-- Prepared only. Root owns hosted application, generated types, and initial price enablement.
-- Root stores JSON.stringify(EndpointEvidence) as the reviewed row's evidence text.
-- No initial bound is enabled here. No direct table grant is added.
create function public.scan_marking_evaluation_policy(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'model',p->'model','provider',p->'endpoint'->'provider_name','tag',p->'endpoint'->'tag',
    'quantization',p->'endpoint'->'quantization','excludedEndpoints',p->'excludedEndpoints',
    'supported',(select jsonb_agg(v order by v) from jsonb_array_elements(p->'endpoint'->'supported_parameters') v),
    'maxPrompt',coalesce(p->'endpoint'->'max_prompt_tokens','null'::jsonb),
    'maxCompletion',p->'endpoint'->'max_completion_tokens','context',p->'endpoint'->'context_length',
    'zdrListed',p->'zdrListed','safetyRetention',p->'safetyRetention','policy',p->'policy');
$$;
revoke all on function public.scan_marking_evaluation_policy(jsonb) from public,anon,authenticated,service_role;

create function public.refresh_scan_marking_evaluation_price(
  p_model text,p_endpoint text,p_previous_evidence text,p_evidence text,p_maximum bigint,p_details text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare approved public.scan_marking_evaluation_prices%rowtype; current_evidence jsonb; price jsonb; tier jsonb;
  input_rate numeric := 0; output_rate numeric := 0; rate numeric; field text; tokens bigint; bound numeric;
begin
  if p_details is null or octet_length(p_details)>100000 or p_evidence is null or p_previous_evidence is null
    or p_evidence !~ '^[a-f0-9]{64}$' or p_previous_evidence !~ '^[a-f0-9]{64}$'
    or p_maximum is null or p_maximum not between 1 and 15000000
    or encode(sha256(convert_to(p_details,'UTF8')),'hex')<>p_evidence then
    return jsonb_build_object('refused','invalid-price-evidence');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  select * into approved from public.scan_marking_evaluation_prices
    where model=p_model and endpoint=p_endpoint and evidence_hash=p_previous_evidence and enabled for share;
  if not found then return jsonb_build_object('refused','reviewed-price-missing'); end if;
  if encode(sha256(convert_to(approved.evidence,'UTF8')),'hex')<>p_previous_evidence then
    return jsonb_build_object('refused','reviewed-price-details-missing');
  end if;
  current_evidence := p_details::jsonb;
  if current_evidence->>'model' is distinct from p_model or current_evidence->'endpoint'->>'model_id' is distinct from p_model
    or current_evidence->'endpoint'->>'tag' is distinct from p_endpoint
    or (current_evidence->'endpoint'->>'status')::int is distinct from 0
    or coalesce(current_evidence->'endpoint'->>'service_tier','standard')<>'standard'
    or p_endpoint ~ '/(flex|priority)(/|$)'
    or public.scan_marking_evaluation_policy(current_evidence) is distinct from public.scan_marking_evaluation_policy(approved.evidence::jsonb) then
    return jsonb_build_object('refused','price-policy-changed');
  end if;
  if not (current_evidence->'endpoint'->'supported_parameters' @> '["response_format","structured_outputs"]'::jsonb)
    or (current_evidence->'endpoint'->>'max_completion_tokens')::bigint<4096 then
    return jsonb_build_object('refused','price-capability-missing');
  end if;
  tokens := coalesce((current_evidence->'endpoint'->>'max_prompt_tokens')::bigint,(current_evidence->'endpoint'->>'context_length')::bigint);
  if tokens is null or tokens<1 then return jsonb_build_object('refused','price-context-missing'); end if;
  price := current_evidence->'endpoint'->'pricing';
  for tier in select value from jsonb_array_elements(jsonb_build_array(price)||coalesce(price->'overrides','[]'::jsonb)) loop
    foreach field in array array['prompt','image','input_cache_read','input_cache_write','input_cache_write_1h','completion','internal_reasoning'] loop
      if tier ? field and (tier->>field is null or tier->>field='') then return jsonb_build_object('refused','invalid-token-price'); end if;
      rate := coalesce((tier->>field)::numeric,0);
      if rate<0 or rate::text in ('NaN','Infinity','-Infinity') then return jsonb_build_object('refused','invalid-token-price'); end if;
      if field in ('completion','internal_reasoning') then output_rate := greatest(output_rate,rate);
      else input_rate := greatest(input_rate,rate); end if;
    end loop;
  end loop;
  if input_rate<=0 or output_rate<=0 then return jsonb_build_object('refused','missing-token-price'); end if;
  bound := ceil((tokens*input_rate+4096*output_rate)*1000000);
  -- JavaScript floating-point arithmetic may conservatively round up one extra microdollar.
  if p_maximum<bound or p_maximum>bound+1 then return jsonb_build_object('refused','price-bound-mismatch'); end if;
  insert into public.scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled)
    values(p_model,p_endpoint,p_evidence,p_maximum,approved.max_pixels,p_details,clock_timestamp(),true)
    on conflict(model,endpoint,evidence_hash) do nothing;
  if not exists(select 1 from public.scan_marking_evaluation_prices where model=p_model and endpoint=p_endpoint and evidence_hash=p_evidence
    and maximum_micros=p_maximum and max_pixels=approved.max_pixels and evidence=p_details and enabled) then
    return jsonb_build_object('refused','price-bound-conflict');
  end if;
  return jsonb_build_object('verified',true);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
  return jsonb_build_object('refused','invalid-price-evidence');
end $$;
revoke all on function public.refresh_scan_marking_evaluation_price(text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.refresh_scan_marking_evaluation_price(text,text,text,text,bigint,text) to service_role;

-- Serialize unresolved evaluation liability across run hashes and months. Existing production admission is unchanged.
create function public.reserve_scan_marking_evaluation_checked(
  p_run text,p_attempt text,p_model text,p_endpoint text,p_evidence text,p_pixels bigint,p_maximum bigint,p_run_maximum bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
  if exists(select 1 from public.scan_marking_evaluation_attempts a join public.scan_marking_spend s on s.id=a.dispatch_id where s.charged_micros is null) then
    return jsonb_build_object('refused','unresolved-evaluation-cost');
  end if;
  return public.reserve_scan_marking_evaluation(p_run,p_attempt,p_model,p_endpoint,p_evidence,p_pixels,p_maximum,p_run_maximum);
end $$;
revoke all on function public.reserve_scan_marking_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_scan_marking_evaluation_checked(text,text,text,text,text,bigint,bigint,bigint) to service_role;
