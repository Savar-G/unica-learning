-- Evaluation accounting only. Prepared for independent Sol review and root application.
-- This is a permanent conservative charge, not measured provider usage or a retry grant.
create table public.scan_marking_evaluation_resolutions (
  dispatch_id uuid primary key references public.scan_marking_evaluation_attempts(dispatch_id) on delete restrict,
  attempt_hash text not null unique references public.scan_marking_evaluation_attempts(attempt_hash) on delete restrict,
  run_hash text not null references public.scan_marking_evaluations(run_hash) on delete restrict,
  model text not null,
  endpoint text not null,
  evidence_hash text not null,
  pixels bigint not null check (pixels between 1 and 48000000),
  period date not null,
  reserved_micros bigint not null check (reserved_micros between 1 and 15000000),
  maximum_micros bigint not null check (maximum_micros=reserved_micros),
  run_maximum_micros bigint not null check (run_maximum_micros between reserved_micros and 15000000),
  amount_micros bigint not null check (amount_micros=reserved_micros),
  outcome text not null check (outcome='unknown, charged at its full reservation'),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  actor text not null check (length(actor) between 1 and 200 and actor ~ '[^[:space:]]'),
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (model,endpoint,evidence_hash) references public.scan_marking_evaluation_prices(model,endpoint,evidence_hash) on delete restrict
);
alter table public.scan_marking_evaluation_resolutions enable row level security;
revoke all on public.scan_marking_evaluation_resolutions from public,anon,authenticated,service_role;
grant select on public.scan_marking_evaluation_resolutions to service_role;
create policy scan_marking_evaluation_resolutions_service_read on public.scan_marking_evaluation_resolutions
  for select to service_role using (true);

-- Also refuse privileged cleanup that would erase or rewrite the accounting evidence.
create function public.scan_marking_evaluation_resolution_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Evaluation resolutions are append only' using errcode='55000';
end $$;
revoke all on function public.scan_marking_evaluation_resolution_immutable() from public,anon,authenticated,service_role;
create trigger scan_marking_evaluation_resolution_immutable
  before update or delete or truncate on public.scan_marking_evaluation_resolutions
  for each statement execute function public.scan_marking_evaluation_resolution_immutable();

create function public.resolve_scan_marking_evaluation_full_reservation(
  p_run text,p_attempt text,p_id uuid,p_evidence jsonb,p_actor text
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  admission public.scan_marking_evaluation_attempts%rowtype;
  spend public.scan_marking_spend%rowtype;
  price public.scan_marking_evaluation_prices%rowtype;
  run_cap bigint;
  attempt jsonb;
  response jsonb;
  field text;
  result_attempt jsonb;
  matching_attempts int := 0;
  resolved_at timestamptz;
begin
  if p_run is null or p_run !~ '^[a-f0-9]{64}$' or p_attempt is null or p_attempt !~ '^[a-f0-9]{64}$'
    or p_id is null or p_actor is null or length(p_actor) not between 1 and 200 or p_actor !~ '[^[:space:]]'
    or p_evidence is null or jsonb_typeof(p_evidence) is distinct from 'object'
    or octet_length(p_evidence::text)>1000000 then return false; end if;

  -- Same order as evaluation admission and settlement: global lock, then durable rows.
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  select * into admission from public.scan_marking_evaluation_attempts
    where dispatch_id=p_id and attempt_hash=p_attempt and run_hash=p_run for share;
  if not found then return false; end if; -- Production-only spend has no evaluation admission.
  select * into spend from public.scan_marking_spend where id=p_id for update;
  if not found or spend.charged_micros is not null or spend.settled_at is not null
    or spend.reserved_micros is null or spend.reserved_micros not between 1 and 15000000
    or exists(select 1 from public.scan_marking_evaluation_resolutions where dispatch_id=p_id)
    or exists(select 1 from public.scan_marking_evaluation_deferrals where dispatch_id=p_id) then return false; end if;
  select * into price from public.scan_marking_evaluation_prices
    where model=spend.model and endpoint=admission.endpoint and evidence_hash=admission.evidence_hash for share;
  if not found or price.maximum_micros is distinct from spend.reserved_micros
    or price.maximum_micros not between 1 and 15000000
    or admission.pixels not between 1 and price.max_pixels then return false; end if;
  -- An old admitted price can be disabled later. Its durable identity and bound must still match.
  select maximum_micros into run_cap from public.scan_marking_evaluations where run_hash=p_run for share;
  if not found or run_cap is null or run_cap not between spend.reserved_micros and 15000000 then return false; end if;

  -- Accept the saved unknown journal unchanged, not a caller's asserted cost or maximum.
  attempt := p_evidence->'attempt';
  response := p_evidence->'response';
  if p_evidence->>'run' is distinct from p_run or p_evidence->>'key' is distinct from p_attempt
    or p_evidence->>'model' is distinct from spend.model or p_evidence->>'state' is distinct from 'unknown'
    or jsonb_typeof(attempt) is distinct from 'object' or attempt->>'id' is distinct from p_id::text
    or attempt->'reservedMicros' is distinct from to_jsonb(spend.reserved_micros)
    or jsonb_typeof(attempt->'latencyMs') is distinct from 'number'
    or (attempt->>'latencyMs')::numeric<60000
    or jsonb_typeof(attempt->'usage') is distinct from 'object'
    or jsonb_typeof(response) is distinct from 'object' or response->'status' is distinct from '200'::jsonb
    or attempt->'response' is distinct from response then return false; end if;
  foreach field in array array['body','envelope','openrouter_metadata'] loop
    if response->field is distinct from 'null'::jsonb then return false; end if;
  end loop;
  foreach field in array array['generationId','provider','model','costMicros','inputTokens','outputTokens','reasoningTokens','imageTokens'] loop
    if attempt->'usage'->field is distinct from 'null'::jsonb then return false; end if;
  end loop;
  -- The journal duplicates transport fields at its top level. Refuse conflicting copies.
  foreach field in array array['status','body','envelope','openrouter_metadata'] loop
    if p_evidence->field is distinct from response->field then return false; end if;
  end loop;
  if p_evidence ? 'result' then
    if jsonb_typeof(p_evidence->'result') is distinct from 'object'
      or p_evidence->'result'->>'run' is distinct from p_run
      or p_evidence->'result'->>'model' is distinct from spend.model
      or p_evidence->'result'->>'evidenceHash' is distinct from admission.evidence_hash
      or p_evidence->'result'->'photo' is distinct from p_evidence->'photo'
      or p_evidence->'result'->'batch' is distinct from p_evidence->'batch'
      or jsonb_typeof(p_evidence->'result'->'attempts') is distinct from 'array' then return false; end if;
    for result_attempt in select value from jsonb_array_elements(p_evidence->'result'->'attempts') loop
      if result_attempt->>'id'=p_id::text then
        if result_attempt is distinct from attempt then return false; end if;
        matching_attempts := matching_attempts+1;
      end if;
    end loop;
    if matching_attempts<>1 then return false; end if;
  end if;

  -- Existing settlement is write-once. Later normal settlement cannot lower this charge.
  if not public.settle_scan_marking_evaluation(p_id,spend.reserved_micros) then return false; end if;
  select settled_at into resolved_at from public.scan_marking_spend where id=p_id;
  insert into public.scan_marking_evaluation_resolutions(
    dispatch_id,attempt_hash,run_hash,model,endpoint,evidence_hash,pixels,period,
    reserved_micros,maximum_micros,run_maximum_micros,amount_micros,outcome,evidence,actor,recorded_at
  ) values (
    p_id,p_attempt,p_run,spend.model,admission.endpoint,admission.evidence_hash,admission.pixels,spend.period,
    spend.reserved_micros,price.maximum_micros,run_cap,spend.reserved_micros,
    'unknown, charged at its full reservation',p_evidence,p_actor,resolved_at
  );
  return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return false;
end $$;
revoke all on function public.resolve_scan_marking_evaluation_full_reservation(text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.resolve_scan_marking_evaluation_full_reservation(text,text,uuid,jsonb,text) to service_role;
