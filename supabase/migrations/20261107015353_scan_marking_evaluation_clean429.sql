-- Prepared only. Root applies after review and regenerates official database types.
-- No settlement, price enablement, family admission or production marking changes.
create table public.scan_marking_evaluation_deferrals (
  dispatch_id uuid primary key references public.scan_marking_evaluation_attempts(dispatch_id) on delete restrict,
  attempt_hash text not null unique references public.scan_marking_evaluation_attempts(attempt_hash) on delete restrict,
  run_hash text not null references public.scan_marking_evaluations(run_hash) on delete restrict,
  policy text not null check (policy='clean429-v1'),
  response jsonb not null,
  received_at_ms bigint not null check (received_at_ms>=0),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.scan_marking_evaluation_deferrals enable row level security;
revoke all on public.scan_marking_evaluation_deferrals from public,anon,authenticated,service_role;
grant select on public.scan_marking_evaluation_deferrals to service_role;
create policy scan_marking_evaluation_deferrals_service_read on public.scan_marking_evaluation_deferrals for select to service_role using (true);
-- No family FK: synthetic evaluation evidence belongs to the accounting ledger.
-- Restrict deletion so cleanup cannot erase an unresolved hold or its classification.

-- Refuse usage/generation evidence at every level, including JSON stored in metadata.raw.
create function public.scan_marking_evaluation_has_generation(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; decoded jsonb;
begin
  if jsonb_typeof(p)='object' then
    for k,v in select * from jsonb_each(p) loop
      if k in ('id','generation_id','generationId','usage','choices') or public.scan_marking_evaluation_has_generation(v) then return true; end if;
    end loop;
  elsif jsonb_typeof(p)='array' then
    for v in select * from jsonb_array_elements(p) loop
      if public.scan_marking_evaluation_has_generation(v) then return true; end if;
    end loop;
  elsif jsonb_typeof(p)='string' then
    begin decoded := (p#>>'{}')::jsonb;
    exception when invalid_text_representation then return false; end;
    return public.scan_marking_evaluation_has_generation(decoded);
  end if;
  return false;
end $$;
revoke all on function public.scan_marking_evaluation_has_generation(jsonb) from public,anon,authenticated,service_role;

create function public.defer_scan_marking_evaluation(p_run text,p_attempt text,p_id uuid,p_response jsonb,p_received_at bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare body jsonb; metadata jsonb; existing public.scan_marking_evaluation_deferrals%rowtype;
begin
  if p_run is null or p_attempt is null or p_id is null or p_run !~ '^[a-f0-9]{64}$' or p_attempt !~ '^[a-f0-9]{64}$'
    or p_received_at is null or p_received_at<0 or p_received_at>floor(extract(epoch from clock_timestamp())*1000)+60000
    or p_response is null or octet_length(p_response::text)>1000000
    or jsonb_typeof(p_response) is distinct from 'object' or p_response->'status' is distinct from '429'::jsonb
    or jsonb_typeof(p_response->'body') is distinct from 'string' or length(p_response->>'body')=0 then return false; end if;
  body := (p_response->>'body')::jsonb;
  if jsonb_typeof(body) is distinct from 'object' or body is distinct from p_response->'envelope'
    or jsonb_typeof(body->'error') is distinct from 'object' or body->'error'->'code' is distinct from '429'::jsonb
    or jsonb_typeof(body->'error'->'message') is distinct from 'string' or length(body->'error'->>'message')=0
    or public.scan_marking_evaluation_has_generation(body) then return false; end if;
  metadata := coalesce(nullif(body->'openrouter_metadata','null'::jsonb),body->'error'->'metadata','null'::jsonb);
  if metadata is distinct from coalesce(p_response->'openrouter_metadata','null'::jsonb) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  if not exists(select 1 from public.scan_marking_evaluation_attempts a join public.scan_marking_spend s on s.id=a.dispatch_id
    where a.attempt_hash=p_attempt and a.run_hash=p_run and a.dispatch_id=p_id and s.charged_micros is null) then return false; end if;
  insert into public.scan_marking_evaluation_deferrals(dispatch_id,attempt_hash,run_hash,policy,response,received_at_ms)
    values(p_id,p_attempt,p_run,'clean429-v1',p_response,p_received_at) on conflict do nothing;
  select * into existing from public.scan_marking_evaluation_deferrals where dispatch_id=p_id;
  return existing.attempt_hash=p_attempt and existing.run_hash=p_run and existing.response=p_response and existing.received_at_ms=p_received_at;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return false;
end $$;
revoke all on function public.defer_scan_marking_evaluation(text,text,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.defer_scan_marking_evaluation(text,text,uuid,jsonb,bigint) to service_role;

-- A validated clean 429 is the sole exception. The original reserve still counts the whole hold
-- through coalesce(charged_micros,reserved_micros) at the run, UTC month and lifetime limits.
create or replace function public.reserve_scan_marking_evaluation_checked(
  p_run text,p_attempt text,p_model text,p_endpoint text,p_evidence text,p_pixels bigint,p_maximum bigint,p_run_maximum bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  if exists(select 1 from public.scan_marking_evaluation_attempts a join public.scan_marking_spend s on s.id=a.dispatch_id
    where s.charged_micros is null and not exists(select 1 from public.scan_marking_evaluation_deferrals d
      where d.dispatch_id=a.dispatch_id and d.attempt_hash=a.attempt_hash and d.run_hash=a.run_hash)) then
    return jsonb_build_object('refused','unresolved-evaluation-cost');
  end if;
  return public.reserve_scan_marking_evaluation(p_run,p_attempt,p_model,p_endpoint,p_evidence,p_pixels,p_maximum,p_run_maximum);
end $$;
revoke all on function public.reserve_scan_marking_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_scan_marking_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) to service_role;
