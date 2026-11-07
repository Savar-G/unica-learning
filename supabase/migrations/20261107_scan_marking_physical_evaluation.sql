-- Additive physical-evaluation admission only. Root applies after review.
-- Count all earlier marking charges and retained holds, including production test charges.
-- This intentionally overcounts any unrelated production spend instead of inventing a baseline.
create function public.reserve_scan_marking_physical_evaluation_checked(
  p_run text,p_attempt text,p_model text,p_endpoint text,p_evidence text,p_pixels bigint,p_maximum bigint,p_run_maximum bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  liability numeric;
  answer jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  if p_maximum is null or p_maximum not between 1 and 15000000 then
    return jsonb_build_object('refused','invalid-physical-maximum');
  end if;
  -- Unknown production test charges must stop this controlled test too.
  if exists(select 1 from public.scan_marking_spend s
    where s.charged_micros is null and not exists(
      select 1 from public.scan_marking_evaluation_deferrals d where d.dispatch_id=s.id
    )) then
    return jsonb_build_object('refused','unresolved-marking-cost');
  end if;
  select coalesce(sum(coalesce(charged_micros,reserved_micros)),0) into liability
    from public.scan_marking_spend;
  if liability+p_maximum>15000000 then
    return jsonb_build_object('refused','aggregate-marking-test-budget','liability_micros',liability);
  end if;
  answer := public.reserve_scan_marking_evaluation_checked(
    p_run,p_attempt,p_model,p_endpoint,p_evidence,p_pixels,p_maximum,p_run_maximum);
  return answer || jsonb_build_object('prior_liability_micros',liability,'aggregate_maximum_micros',15000000);
end $$;
revoke all on function public.reserve_scan_marking_physical_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_scan_marking_physical_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) to service_role;
