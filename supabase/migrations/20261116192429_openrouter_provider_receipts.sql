-- Independent provider evidence. No application event, prompt, user identity, or raw payload is copied here.
create table public.openrouter_provider_receipts (
  workspace_id text not null check (workspace_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  generation_id text not null check (generation_id ~ '^gen-[a-zA-Z0-9_-]{1,196}$'),
  received_at timestamptz not null default now(),
  occurred_at timestamptz not null check (occurred_at >= '2020-01-01' and occurred_at < '2100-01-01'),
  model text not null check (model ~ '^[a-zA-Z0-9][a-zA-Z0-9_./:@+~-]{0,199}$'),
  api_key_id text check (api_key_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  cost_usd numeric check (cost_usd >= 0 and cost_usd < 1000000),
  input_cost_usd numeric check (input_cost_usd >= 0 and input_cost_usd < 1000000),
  output_cost_usd numeric check (output_cost_usd >= 0 and output_cost_usd < 1000000),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  primary key (workspace_id, generation_id)
);
create index openrouter_provider_receipts_time on public.openrouter_provider_receipts (occurred_at);
create index openrouter_provider_receipts_generation on public.openrouter_provider_receipts (generation_id);
alter table public.openrouter_provider_receipts enable row level security;
revoke all on public.openrouter_provider_receipts from public, anon, authenticated, service_role;
grant select on public.openrouter_provider_receipts to authenticated, service_role;
create policy "Admins read provider receipts" on public.openrouter_provider_receipts
  for select to authenticated using ((select public.is_admin()));

create function public.refuse_provider_receipt_change() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'append only' using errcode = '55000'; end $$;
revoke all on function public.refuse_provider_receipt_change() from public, anon, authenticated, service_role;
create trigger append_only before update or delete on public.openrouter_provider_receipts
  for each row execute function public.refuse_provider_receipt_change();

-- One transaction per batch. An identical retry is a no-op. A conflicting receipt aborts the entire batch.
-- Lock in identity order to avoid a deadlock between differently ordered retries. No update/upsert overwrites evidence.
create function public.ingest_openrouter_provider_receipts(p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.openrouter_provider_receipts; old public.openrouter_provider_receipts; j jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 256 then
    raise exception 'invalid receipt batch';
  end if;
  for j in select value from jsonb_array_elements(p_rows) order by value->>'workspace_id', value->>'generation_id' loop
    if jsonb_typeof(j) <> 'object' or (j - array['workspace_id','generation_id','occurred_at','model','api_key_id',
      'cost_usd','input_cost_usd','output_cost_usd','input_tokens','output_tokens']) <> '{}'::jsonb then
      raise exception 'invalid receipt';
    end if;
    r := jsonb_populate_record(null::public.openrouter_provider_receipts, j);
    insert into public.openrouter_provider_receipts (workspace_id, generation_id, occurred_at, model, api_key_id,
      cost_usd, input_cost_usd, output_cost_usd, input_tokens, output_tokens)
    values (r.workspace_id, r.generation_id, r.occurred_at, r.model, r.api_key_id,
      r.cost_usd, r.input_cost_usd, r.output_cost_usd, r.input_tokens, r.output_tokens)
    on conflict (workspace_id, generation_id) do nothing;
    select * into strict old from public.openrouter_provider_receipts
      where workspace_id = r.workspace_id and generation_id = r.generation_id;
    if row(old.occurred_at, old.model, old.api_key_id, old.cost_usd, old.input_cost_usd, old.output_cost_usd,
      old.input_tokens, old.output_tokens) is distinct from row(r.occurred_at, r.model, r.api_key_id, r.cost_usd,
      r.input_cost_usd, r.output_cost_usd, r.input_tokens, r.output_tokens) then
      raise exception 'conflicting receipt';
    end if;
  end loop;
end $$;
revoke all on function public.ingest_openrouter_provider_receipts(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_openrouter_provider_receipts(jsonb) to service_role;

-- Read-time attribution tolerates a delayed application write. Never infer from a model, key, or a timestamp.
-- Multiple workspace receipts for a generation make its application attribution ambiguous.
-- No test-family exclusion: provider charges include all keys, tools, practice, and production traffic.
create function public.admin_openrouter_provider_receipts(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '366 days' then
    raise exception 'invalid period';
  end if;
  with receipts as (
    select r.*, e.id as event_id, e.feature, e.child_id,
      case when e.id is not null then exists (select 1 from public.test_accounts t where t.parent_id = e.parent_id)
        or exists (select 1 from public.admin_users a where a.user_id = e.parent_id) else null end as test_family
    from public.openrouter_provider_receipts r
    left join public.ai_usage_events e on e.provider = 'openrouter' and e.generation_id = r.generation_id
      and not exists (select 1 from public.openrouter_provider_receipts x
        where x.generation_id = r.generation_id and x.workspace_id <> r.workspace_id)
    where r.occurred_at >= p_from and r.occurred_at < p_to
  ), totals as (
    select count(*) as receipts, coalesce(sum(cost_usd),0) as known_cost_usd,
      count(*) filter (where cost_usd is null) as unknown_cost_receipts,
      count(*) filter (where event_id is not null) as matched_receipts,
      count(*) filter (where event_id is null) as unmatched_receipts,
      coalesce(sum(cost_usd) filter (where event_id is null),0) as unmatched_known_cost_usd,
      count(*) filter (where event_id is null and cost_usd is null) as unmatched_unknown_cost_receipts,
      min(occurred_at) as first_receipt_at, max(occurred_at) as last_receipt_at,
      max(received_at) as last_received_at from receipts
  ), models as (
    select model as label, count(*) as receipts, coalesce(sum(cost_usd),0) as known_cost_usd,
      count(*) filter (where cost_usd is null) as unknown_cost_receipts from receipts group by model
  ), keys as (
    select workspace_id, api_key_id, count(*) as receipts, coalesce(sum(cost_usd),0) as known_cost_usd,
      count(*) filter (where cost_usd is null) as unknown_cost_receipts from receipts group by workspace_id, api_key_id
  ), features as (
    select feature as label, count(*) as receipts, coalesce(sum(cost_usd),0) as known_cost_usd,
      count(*) filter (where cost_usd is null) as unknown_cost_receipts from receipts group by feature
  ), children as (
    select child_id, feature, model, workspace_id, api_key_id, test_family,
      count(*) as receipts, coalesce(sum(cost_usd),0) as known_cost_usd,
      count(*) filter (where cost_usd is null) as unknown_cost_receipts
    from receipts where child_id is not null group by child_id, feature, model, workspace_id, api_key_id, test_family
  ) select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'models', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from
      (select * from models order by known_cost_usd desc, label limit 1000) m),
    'keys', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from
      (select * from keys order by known_cost_usd desc, workspace_id, api_key_id limit 1000) k),
    'features', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from
      (select * from features order by known_cost_usd desc, label nulls last limit 1000) f),
    'children', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from
      (select * from children order by known_cost_usd desc, child_id, feature, model, workspace_id, api_key_id limit 1000) c),
    'omitted_groups', greatest(0,(select count(*) from models)-1000) + greatest(0,(select count(*) from keys)-1000)
      + greatest(0,(select count(*) from features)-1000) + greatest(0,(select count(*) from children)-1000)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_openrouter_provider_receipts(timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.admin_openrouter_provider_receipts(timestamptz,timestamptz) to authenticated;
