-- Independent historical evidence. These tables never write app spend or canonical receipts.
-- No typmod on numeric projections: the original source decimal text also remains immutable.
create function public.ai_history_row_line(j jsonb) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.string_agg(coalesce(j->>k, ''), E'\t' order by n) || E'\n'
  from pg_catalog.unnest(array['row_number','source_row_number','generation_id','created_at_text','cost_total_text',
    'cost_web_search_text','cost_cache_text','cost_file_processing_text','byok_usage_inference_text','tokens_prompt_text',
    'tokens_completion_text','tokens_reasoning_text','tokens_cached_text','model_permaslug','provider_name',
    'generation_time_ms_text','time_to_first_token_ms_text','api_key_label','api_key_disabled']) with ordinality as x(k,n)
$$;
revoke all on function public.ai_history_row_line(jsonb) from public, anon, authenticated, service_role;

create function public.ai_history_valid_row(j jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v text; stamp text;
begin
  if jsonb_typeof(j) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(j)) <> 19 or
    (j - array['row_number','source_row_number','generation_id','created_at_text','cost_total_text','cost_web_search_text',
      'cost_cache_text','cost_file_processing_text','byok_usage_inference_text','tokens_prompt_text','tokens_completion_text',
      'tokens_reasoning_text','tokens_cached_text','model_permaslug','provider_name','generation_time_ms_text',
      'time_to_first_token_ms_text','api_key_label','api_key_disabled']) <> '{}'::jsonb then return false; end if;
  foreach k in array array['row_number','source_row_number'] loop
    if jsonb_typeof(j->k) is distinct from 'number' or (j->>k) !~ '^[1-9][0-9]{0,5}$' or (j->>k)::integer > 250000 then return false; end if;
  end loop;
  for k,v in select key,value from jsonb_each_text(j - array['row_number','source_row_number']) loop
    if jsonb_typeof(j->k) not in ('null','string') then return false; end if;
    if v is not null and (v = '' or v ~ '[\x00-\x1f\x7f]') then return false; end if;
  end loop;
  if j->>'generation_id' is null or (j->>'generation_id') !~ '^gen-[a-zA-Z0-9_-]{1,196}$' then return false; end if;
  foreach k in array array['cost_total_text','cost_web_search_text','cost_file_processing_text','byok_usage_inference_text','generation_time_ms_text','time_to_first_token_ms_text','cost_cache_text'] loop
    v := j->>k;
    if v is not null and (v !~ '^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,30})?$' or (k <> 'cost_cache_text' and left(v,1) = '-')) then return false; end if;
  end loop;
  foreach k in array array['tokens_prompt_text','tokens_completion_text','tokens_reasoning_text','tokens_cached_text'] loop
    v := j->>k; if v is not null and v !~ '^(0|[1-9][0-9]{0,14})$' then return false; end if;
  end loop;
  v := j->>'model_permaslug'; if v is not null and v !~ '^[a-zA-Z0-9][a-zA-Z0-9_./:@+~-]{0,199}$' then return false; end if;
  foreach k in array array['provider_name','api_key_label'] loop
    v := j->>k;
    if v is not null and v !~ '^[a-zA-Z0-9][a-zA-Z0-9 ._:/()-]{0,79}$' then return false; end if;
  end loop;
  v := j->>'api_key_label';
  if v ~* 'sk-|sb_secret|bearer|eyJ|AIza[a-zA-Z0-9_-]{35}|(AKIA|ASIA)[a-zA-Z0-9]{16}|[a-f0-9]{32}|[a-zA-Z0-9_-]{40}' then return false; end if;
  if j->>'api_key_disabled' is not null and j->>'api_key_disabled' not in ('true','false') then return false; end if;
  stamp := j->>'created_at_text';
  if stamp is not null then
    if stamp !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$' then return false; end if;
    if to_char(stamp::timestamp, 'YYYY-MM-DD HH24:MI:SS.MS') <> stamp then return false; end if;
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.ai_history_valid_row(jsonb) from public, anon, authenticated, service_role;

create table public.ai_cost_history_manifests (
  export_id uuid primary key,
  manifest jsonb not null,
  registered_at timestamptz not null default now()
);
create table public.ai_cost_history_rows (
  export_id uuid not null references public.ai_cost_history_manifests(export_id),
  evidence jsonb not null check (public.ai_history_valid_row(evidence)),
  row_number integer generated always as ((evidence->>'row_number')::integer) stored,
  source_row_number integer generated always as ((evidence->>'source_row_number')::integer) stored,
  generation_id text generated always as (evidence->>'generation_id') stored,
  cost_usd numeric generated always as ((evidence->>'cost_total_text')::numeric) stored,
  primary key(export_id, row_number),
  unique(export_id, generation_id),
  unique(export_id, source_row_number)
);
create table public.ai_cost_history_completions (
  export_id uuid primary key references public.ai_cost_history_manifests(export_id),
  completed_at timestamptz not null default now()
);
alter table public.ai_cost_history_manifests enable row level security;
alter table public.ai_cost_history_rows enable row level security;
alter table public.ai_cost_history_completions enable row level security;
revoke all on public.ai_cost_history_manifests, public.ai_cost_history_rows, public.ai_cost_history_completions from public, anon, authenticated, service_role;
-- No direct read/write grants. Admin access is only through the explicit gated reader below.
create function public.refuse_ai_history_change() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'append only' using errcode = '55000'; end $$;
revoke all on function public.refuse_ai_history_change() from public, anon, authenticated, service_role;
create trigger append_only before update or delete on public.ai_cost_history_manifests for each row execute function public.refuse_ai_history_change();
create trigger append_only before update or delete on public.ai_cost_history_rows for each row execute function public.refuse_ai_history_change();
create trigger append_only before update or delete on public.ai_cost_history_completions for each row execute function public.refuse_ai_history_change();

create function public.begin_ai_cost_history(p_manifest jsonb) returns void
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare m jsonb := p_manifest; k text; v jsonb; old jsonb;
begin
  if jsonb_typeof(m) is distinct from 'object' or (select count(*) from jsonb_object_keys(m)) <> 19 or
    (m - array['version','parser','export_id','source_kind','workspace_id','workspace_basis','source','headers','source_row_count','row_count',
      'distinct_generation_count','known_cost_usd','unknown_cost_count','rows_sha256','selection','verified_at','captured_at','row_time_zone','analytics']) <> '{}'::jsonb then
    raise exception 'invalid history manifest';
  end if;
  foreach k in array array['parser','export_id','source_kind','workspace_id','workspace_basis','known_cost_usd','rows_sha256','verified_at'] loop
    if jsonb_typeof(m->k) is distinct from 'string' then raise exception 'invalid history manifest'; end if;
  end loop;
  if m->'version' <> '1'::jsonb or m->>'parser' is distinct from 'openrouter-logs-csv-v1' or
    m->>'source_kind' is distinct from 'openrouter_logs_csv' or m->>'workspace_id' is distinct from '2468d17e-b7eb-467f-b1ef-feec9e328d58' or
    m->>'workspace_basis' is distinct from 'controller_recorded_export_procedure' or m->'captured_at' <> 'null'::jsonb or m->'row_time_zone' <> 'null'::jsonb or
    m->>'export_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    m->'headers' <> '["generation_id","created_at","cost_total","cost_web_search","cost_cache","cost_file_processing","byok_usage_inference","tokens_prompt","tokens_completion","tokens_reasoning","tokens_cached","model_permaslug","provider_name","variant","cancelled","streamed","user","finish_reason_raw","finish_reason_normalized","generation_time_ms","time_to_first_token_ms","user_agent","country","city","asn","asn_organization","app_name","api_key_name","api_key_disabled"]'::jsonb then raise exception 'invalid history manifest'; end if;
  foreach k in array array['source_row_count','row_count','distinct_generation_count','unknown_cost_count'] loop
    if jsonb_typeof(m->k) is distinct from 'number' or m->>k !~ '^(0|[1-9][0-9]{0,5})$' or (m->>k)::integer > 250000 then raise exception 'invalid history count'; end if;
  end loop;
  if (m->>'row_count')::integer < 1 or m->'row_count' <> m->'distinct_generation_count' or (m->>'row_count')::integer > (m->>'source_row_count')::integer or
    (m->>'unknown_cost_count')::integer > (m->>'row_count')::integer then raise exception 'invalid history count'; end if;
  if jsonb_typeof(m->'known_cost_usd') is distinct from 'string' or m->>'known_cost_usd' !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,30})?$' or
    m->>'rows_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid history amount'; end if;
  v := m->'source';
  if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v)) <> 2 or (v - array['sha256','bytes']) <> '{}'::jsonb or
    jsonb_typeof(v->'sha256') is distinct from 'string' or v->>'sha256' !~ '^[a-f0-9]{64}$' or jsonb_typeof(v->'bytes') is distinct from 'number' or
    v->>'bytes' !~ '^[1-9][0-9]{0,7}$' or (v->>'bytes')::bigint not between 1 and 50000000 then raise exception 'invalid history source'; end if;
  v := m->'selection';
  if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v)) <> 3 or (v - array['control','from','to']) <> '{}'::jsonb or
    v->>'control' is distinct from 'This Year' then raise exception 'invalid history selection'; end if;
  foreach k in array array['from','to'] loop
    if jsonb_typeof(v->k) is distinct from 'string' or v->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or
      to_char((v->>k)::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> v->>k then raise exception 'invalid history selection'; end if;
  end loop;
  if (v->>'from')::timestamptz >= (v->>'to')::timestamptz then raise exception 'invalid history selection'; end if;
  if m->>'verified_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or
    to_char((m->>'verified_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> m->>'verified_at' then raise exception 'invalid history verification'; end if;
  v := m->'analytics';
  if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v)) <> 3 or (v - array['total_usd','request_count','snapshots']) <> '{}'::jsonb or
    jsonb_typeof(v->'total_usd') is distinct from 'string' or v->>'total_usd' !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,30})?$' or
    v->'request_count' is distinct from m->'row_count' or jsonb_typeof(v->'snapshots') is distinct from 'array' or jsonb_array_length(v->'snapshots') not between 1 and 8 then raise exception 'invalid history analytics'; end if;
  for v in select value from jsonb_array_elements(v->'snapshots') loop
    if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v)) <> 2 or (v - array['sha256','bytes']) <> '{}'::jsonb or
      jsonb_typeof(v->'sha256') is distinct from 'string' or v->>'sha256' !~ '^[a-f0-9]{64}$' or jsonb_typeof(v->'bytes') is distinct from 'number' or
      v->>'bytes' !~ '^[1-9][0-9]{0,7}$' or (v->>'bytes')::bigint not between 1 and 50000000 then raise exception 'invalid history snapshot'; end if;
  end loop;
  insert into public.ai_cost_history_manifests(export_id, manifest) values ((m->>'export_id')::uuid, m) on conflict do nothing;
  select manifest into strict old from public.ai_cost_history_manifests where export_id = (m->>'export_id')::uuid for update;
  if old is distinct from m then raise exception 'conflicting history manifest'; end if;
end $$;
revoke all on function public.begin_ai_cost_history(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.begin_ai_cost_history(jsonb) to service_role;

-- Begin, batches and finalization share the same manifest row lock. Completion does not mutate evidence.
create function public.ingest_ai_cost_history_rows(p_export_id uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare m jsonb; j jsonb; old jsonb; complete boolean;
begin
  select manifest into strict m from public.ai_cost_history_manifests where export_id = p_export_id for update;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 128 then raise exception 'invalid history batch'; end if;
  complete := exists(select 1 from public.ai_cost_history_completions where export_id = p_export_id);
  for j in select value from jsonb_array_elements(p_rows) order by (value->>'row_number')::integer loop
    if not public.ai_history_valid_row(j) or (j->>'row_number')::integer > (m->>'row_count')::integer or
      (j->>'source_row_number')::integer > (m->>'source_row_count')::integer then raise exception 'invalid history row'; end if;
    select evidence into old from public.ai_cost_history_rows where export_id = p_export_id and row_number = (j->>'row_number')::integer;
    if found then
      if old is distinct from j then raise exception 'conflicting history row'; end if;
    else
      if complete then raise exception 'completed history is immutable'; end if;
      insert into public.ai_cost_history_rows(export_id, evidence) values(p_export_id, j);
    end if;
  end loop;
end $$;
revoke all on function public.ingest_ai_cost_history_rows(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_ai_cost_history_rows(uuid,jsonb) to service_role;

create function public.finalize_ai_cost_history(p_export_id uuid) returns boolean
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare m jsonb; n bigint; distinct_n bigint; unknown_n bigint; total numeric; digest text; sequence_ok boolean;
begin
  select manifest into strict m from public.ai_cost_history_manifests where export_id = p_export_id for update;
  if exists(select 1 from public.ai_cost_history_completions where export_id = p_export_id) then return true; end if;
  select count(*), count(distinct generation_id), count(*) filter(where cost_usd is null), coalesce(sum(cost_usd),0),
    encode(sha256(convert_to(string_agg(public.ai_history_row_line(evidence), '' order by row_number),'UTF8')),'hex'),
    min(row_number) = 1 and max(row_number) = count(*)
    into n, distinct_n, unknown_n, total, digest, sequence_ok
    from public.ai_cost_history_rows where export_id = p_export_id;
  if n <> (m->>'row_count')::bigint or distinct_n <> (m->>'distinct_generation_count')::bigint or unknown_n <> (m->>'unknown_cost_count')::bigint or
    total <> (m->>'known_cost_usd')::numeric or digest is distinct from m->>'rows_sha256' or sequence_ok is distinct from true or
    exists(select 1 from (select source_row_number, lag(source_row_number) over(order by row_number) as previous
      from public.ai_cost_history_rows where export_id = p_export_id) x where previous >= source_row_number) then raise exception 'incomplete history export'; end if;
  insert into public.ai_cost_history_completions(export_id) values(p_export_id);
  return true;
end $$;
revoke all on function public.finalize_ai_cost_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.finalize_ai_cost_history(uuid) to service_role;

create function public.admin_ai_cost_history(p_export_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare chosen uuid; m jsonb; result jsonb; export_list jsonb; export_count bigint;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  select count(*) into export_count from public.ai_cost_history_completions;
  select coalesce(jsonb_agg(jsonb_build_object('export_id',export_id,'rows',(manifest->>'row_count')::integer) order by completed_at desc,export_id),'[]'::jsonb)
    into export_list from (select c.export_id,c.completed_at,h.manifest from public.ai_cost_history_completions c
      join public.ai_cost_history_manifests h using(export_id) order by c.completed_at desc,c.export_id limit 50) x;
  if p_export_id is null then
    select export_id into chosen from public.ai_cost_history_completions order by completed_at desc,export_id limit 1;
  else select export_id into chosen from public.ai_cost_history_completions where export_id = p_export_id; end if;
  if chosen is null then return jsonb_build_object('exports',export_list,'omitted_exports',greatest(0,export_count-50),
    'selection',case when p_export_id is null then 'empty' else 'missing' end,'selected',null); end if;
  select manifest into strict m from public.ai_cost_history_manifests where export_id = chosen;
  with attributed as materialized (
    select r.*, case when a.n = 1 and not a.other_workspace then a.feature end as feature,
      case when a.n = 1 and not a.other_workspace then p.id end as parent_id,
      case when a.n = 1 and not a.other_workspace then c.id end as child_id,
      case when a.n = 1 and not a.other_workspace then p.name end as parent_name,
      case when a.n = 1 and not a.other_workspace then c.first_name end as child_name,
      a.n = 1 and not a.other_workspace as matched, a.n > 1 or a.other_workspace as ambiguous
    from public.ai_cost_history_rows r
    -- Aggregate before joining: ambiguous app rows cannot multiply source amounts.
    cross join lateral (
      select count(*) as n, min(e.feature) as feature, min(e.parent_id::text)::uuid as parent_id, min(e.child_id::text)::uuid as child_id,
        exists(select 1 from public.openrouter_provider_receipts w where w.generation_id = r.generation_id and w.workspace_id <> m->>'workspace_id') as other_workspace
      from public.ai_usage_events e where e.provider = 'openrouter' and e.generation_id = r.generation_id
    ) a
    left join public.parents p on p.id = a.parent_id
    left join public.children c on c.id = a.child_id and c.parent_id = p.id
    where r.export_id = chosen
  ), models as (
    select evidence->>'model_permaslug' as label,count(*) as rows,coalesce(sum(cost_usd),0)::text as known_cost_usd,count(*) filter(where cost_usd is null) as unknown_cost_count from attributed group by 1
  ), keys as (
    select evidence->>'api_key_label' as label,count(*) as rows,coalesce(sum(cost_usd),0)::text as known_cost_usd,count(*) filter(where cost_usd is null) as unknown_cost_count from attributed group by 1
  ), ownership as (
    select feature,parent_id,child_id,parent_name,child_name,count(*) as rows,coalesce(sum(cost_usd),0)::text as known_cost_usd,count(*) filter(where cost_usd is null) as unknown_cost_count
    from attributed group by feature,parent_id,child_id,parent_name,child_name
  ), blank as (select jsonb_build_object('label',null,'feature',null,'parent_id',null,'child_id',null,'parent_name',null,'child_name',null) as fields)
  select jsonb_build_object('export_id',chosen,'manifest',m,'rows',count(*),'known_cost_usd',coalesce(sum(cost_usd),0)::text,
    'unknown_cost_count',count(*) filter(where cost_usd is null),'unknown_time_count',count(*),
    'matched_rows',count(*) filter(where matched),'ambiguous_rows',count(*) filter(where ambiguous),
    'unknown_family_rows',count(*) filter(where parent_id is null),'unknown_child_rows',count(*) filter(where child_id is null),
    'analytics_total_usd',m->'analytics'->>'total_usd','difference_usd',(coalesce(sum(cost_usd),0)-(m->'analytics'->>'total_usd')::numeric)::text,
    'models',(select coalesce(jsonb_agg((select fields from blank)||to_jsonb(x)),'[]'::jsonb) from (select * from models order by known_cost_usd::numeric desc,label nulls last limit 1000) x),
    'keys',(select coalesce(jsonb_agg((select fields from blank)||to_jsonb(x)),'[]'::jsonb) from (select * from keys order by known_cost_usd::numeric desc,label nulls last limit 1000) x),
    'ownership',(select coalesce(jsonb_agg((select fields from blank)||to_jsonb(x)),'[]'::jsonb) from (select * from ownership order by known_cost_usd::numeric desc,feature nulls last,parent_id nulls last,child_id nulls last limit 1000) x),
    'omitted_groups',greatest(0,(select count(*) from models)-1000)+greatest(0,(select count(*) from keys)-1000)+greatest(0,(select count(*) from ownership)-1000),
    'technical_rows',(select coalesce(jsonb_agg(evidence order by row_number),'[]'::jsonb) from
      (select evidence,row_number from public.ai_cost_history_rows where export_id=chosen order by row_number limit 100) t),
    'omitted_rows',greatest(0,count(*)-100)) into result from attributed;
  return jsonb_build_object('exports',export_list,'omitted_exports',greatest(0,export_count-50),'selection','ok','selected',result);
end $$;
revoke all on function public.admin_ai_cost_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_ai_cost_history(uuid) to authenticated;
