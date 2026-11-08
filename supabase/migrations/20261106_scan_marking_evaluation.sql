-- Prepared only. Root must review, apply and regenerate types before any comparison dispatch.
-- No family/photo rows. No price is enabled. Existing family admission remains unchanged.
create table public.scan_marking_evaluation_prices (
  model text not null references public.scan_marking_prices(model),
  endpoint text not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  maximum_micros bigint not null check (maximum_micros between 1 and 15000000),
  max_pixels bigint not null check (max_pixels between 1 and 48000000),
  evidence text not null check (length(evidence)>0),
  verified_at timestamptz not null,
  enabled boolean not null default false,
  primary key(model,endpoint,evidence_hash)
);
create table public.scan_marking_evaluations (
  run_hash text primary key check (run_hash ~ '^[a-f0-9]{64}$'),
  maximum_micros bigint not null check (maximum_micros between 1 and 15000000)
);
create table public.scan_marking_evaluation_attempts (
  attempt_hash text primary key check (attempt_hash ~ '^[a-f0-9]{64}$'),
  run_hash text not null references public.scan_marking_evaluations(run_hash),
  dispatch_id uuid not null unique references public.scan_marking_spend(id),
  endpoint text not null,
  evidence_hash text not null,
  pixels bigint not null
);
-- Disabled FK rows permit comparison accounting without opening production model admission.
insert into public.scan_marking_prices(model) values
  ('z-ai/glm-5.3-flash'),('deepseek/deepseek-v4.1-flash-1017'),('bytedance-seed/seed-1.6-flash'),
  ('xiaomi/mimo-v2.6-flash'),('anthropic/claude-haiku-5.5'),('openai/gpt-6-luna'),
  ('qwen/qwen3.8-flash'),('minimax/minimax-m3.1-flash'),('mistralai/mistral-small-2603'),
  ('google/gemini-3.1-flash-lite'),('google/gemini-3.5-flash-lite'),('google/gemini-3.8-flash'),
  ('anthropic/claude-sonnet-5.5') on conflict(model) do nothing;

do $$ declare t text; begin
  foreach t in array array['scan_marking_evaluation_prices','scan_marking_evaluations','scan_marking_evaluation_attempts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
end $$;

create function public.reserve_scan_marking_evaluation(
  p_run text,p_attempt text,p_model text,p_endpoint text,p_evidence text,
  p_pixels bigint,p_maximum bigint,p_run_maximum bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare price public.scan_marking_evaluation_prices%rowtype; held numeric; run_cap bigint; dispatch uuid; budget_period date;
begin
  if p_run is null or p_attempt is null or p_evidence is null or p_run !~ '^[a-f0-9]{64}$' or p_attempt !~ '^[a-f0-9]{64}$' or p_evidence !~ '^[a-f0-9]{64}$'
    or p_pixels is null or p_pixels not between 1 and 48000000 or p_maximum is null or p_maximum not between 1 and 15000000
    or p_run_maximum is null or p_run_maximum not between 1 and 15000000 then
    return jsonb_build_object('refused','invalid-admission');
  end if;
  -- EXACT same serialization lock and ledger as the family worker. Read the period after acquiring it.
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  if exists(select 1 from public.scan_marking_evaluation_attempts where attempt_hash=p_attempt) then
    return jsonb_build_object('refused','existing-attempt-no-redispatch');
  end if;
  select * into price from public.scan_marking_evaluation_prices
    where model=p_model and endpoint=p_endpoint and evidence_hash=p_evidence and enabled for share;
  if not found or price.maximum_micros<>p_maximum or price.max_pixels<p_pixels then
    return jsonb_build_object('refused','price-unverified');
  end if;
  insert into public.scan_marking_evaluations(run_hash,maximum_micros) values(p_run,p_run_maximum) on conflict do nothing;
  select maximum_micros into run_cap from public.scan_marking_evaluations where run_hash=p_run;
  if run_cap<>p_run_maximum then return jsonb_build_object('refused','run-cap-changed'); end if;
  select coalesce(sum(coalesce(s.charged_micros,s.reserved_micros)),0) into held
    from public.scan_marking_evaluation_attempts a join public.scan_marking_spend s on s.id=a.dispatch_id where a.run_hash=p_run;
  if held+p_maximum>run_cap then return jsonb_build_object('refused','run-budget'); end if;
  budget_period := date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
  select coalesce(sum(coalesce(charged_micros,reserved_micros)),0) into held from public.scan_marking_spend where period=budget_period;
  if held+p_maximum>50000000 then return jsonb_build_object('refused','shared-month-budget'); end if;
  -- The dedicated key has a lifetime USD 50 cap. This conservative extra check does not replace its provider limit.
  select coalesce(sum(coalesce(charged_micros,reserved_micros)),0) into held from public.scan_marking_spend;
  if held+p_maximum>50000000 then return jsonb_build_object('refused','key-total-budget'); end if;
  insert into public.scan_marking_spend(period,model,reserved_micros) values(budget_period,p_model,p_maximum) returning id into dispatch;
  insert into public.scan_marking_evaluation_attempts(attempt_hash,run_hash,dispatch_id,endpoint,evidence_hash,pixels)
    values(p_attempt,p_run,dispatch,p_endpoint,p_evidence,p_pixels);
  return jsonb_build_object('id',dispatch);
end $$;

create function public.settle_scan_marking_evaluation(p_id uuid,p_cost bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare row public.scan_marking_spend%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  select s.* into row from public.scan_marking_spend s join public.scan_marking_evaluation_attempts a on a.dispatch_id=s.id where s.id=p_id for update of s;
  if not found then return false; end if;
  if p_cost is null then return true; end if; -- Unknown cost never releases the hold.
  if p_cost<0 or p_cost>row.reserved_micros then return false; end if;
  if row.charged_micros is not null then return row.charged_micros=p_cost; end if;
  update public.scan_marking_spend set charged_micros=p_cost,settled_at=clock_timestamp() where id=p_id;
  return true;
end $$;
revoke all on function public.reserve_scan_marking_evaluation(text,text,text,text,text,bigint,bigint,bigint) from public,anon,authenticated;
revoke all on function public.settle_scan_marking_evaluation(uuid,bigint) from public,anon,authenticated;
grant execute on function public.reserve_scan_marking_evaluation(text,text,text,text,text,bigint,bigint,bigint) to service_role;
grant execute on function public.settle_scan_marking_evaluation(uuid,bigint) to service_role;
