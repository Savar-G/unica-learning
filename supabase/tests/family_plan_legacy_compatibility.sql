-- origin/main 724f38b488d3a9ce36d2136b8bf1ea4050d2b2f0; single child and older offer matrix.
-- The caller wraps this file in BEGIN / ROLLBACK. Each baseline and actual case also rolls back.
-- Helper for the rolled-back live compatibility comparison. No Stripe request or email is sent.
create function pg_temp.capture_legacy_start(p uuid,c uuid,k uuid,saved_cents integer,amount integer,purpose text) returns jsonb
language plpgsql as $$
declare g integer:=case when purpose='restart' then 2 else 1 end; a jsonb; during_start jsonb; after_start jsonb; account_row jsonb; email_row jsonb; claim boolean; token uuid:=k; first_charge timestamptz; customer text:='cus_probe_'||k::text;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Legacy compatibility probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Synthetic child',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,stripe_customer_id,card_saved_at,workbook_welcome_enabled)
    values(k,p,c,'one',saved_cents/100.0,customer,now(),false);
  if purpose='restart' then
    insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,state,started_at,finished_at,subscription_id,purpose,monthly_cents)
      values(k,1,p,k::text||'-old','pm_probe','started',now()-interval '60 days',now()-interval '60 days','sub_old','initial',amount);
    insert into public.child_card_updates(child_id,parent_id) values(c,p);
    insert into public.child_plan_controls(child_id,parent_id,cancelled,revision) values(c,p,true,k);
  end if;
  a:=public.admit_plan_start_terms(k,g,k::text||'-new','pm_probe',purpose,amount,case when purpose='restart' then k::text else '' end);
  if (a->>'monthly_cents')::integer<>amount then raise exception 'legacy price mismatch'; end if;
  first_charge:=case when purpose='initial' then (a->>'at')::timestamptz+interval '720 hours' end;
  during_start:=jsonb_build_object('admission',a,'terms',public.plan_start_terms(k,g),
    'route_row',(select to_jsonb(r) from public.card_recovery_rows(k) r),
    'customer_row',(select to_jsonb(r) from public.card_recovery_rows(null,customer) r),
    'context',public.plan_control_context(p,k),
    'columns',(select jsonb_build_object('family_terms',family_terms,'trial_end',trial_end,'price',monthly_cents,'started_at',started_at) from public.plan_starts where card_setup_id=k and generation=g));
  if not public.finish_plan_start(k,g,'started','sub_probe_'||k::text,first_charge,purpose='initial') then raise exception 'finish refused'; end if;
  perform public.save_child_plan_state(customer,case when purpose='initial' then 'free_month' else 'paying' end,
    case when purpose='initial' then first_charge else now()+interval '1 month' end,null,amount,false,now(),k::text||'-event',1);
  account_row:=(select to_jsonb(s) from public.child_plan_states s where child_id=c and parent_id=p);
  after_start:=jsonb_build_object('route_row',(select to_jsonb(r) from public.card_recovery_rows(k) r),
    'sweep_rows',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.card_recovery_rows(null,null,'2099-01-01',1000) r where card_id=k),
    'context',public.plan_control_context(p,k),
    'restart_request',(select to_jsonb(r) from public.workbook_restart_requests r where card_setup_id=k and generation=g));
  if purpose='initial' then
    claim:=public.claim_plan_start_email(k,g,token,jsonb_build_object('to',p::text||'@example.invalid','subject','Synthetic compatibility email','text','CAD '||(amount/100.0)::text||', first charge '||first_charge::text,'html','<p>Synthetic compatibility email</p>'));
    if not claim then raise exception 'email claim refused'; end if;
    perform public.note_plan_start_email_send(k,g,token,'sent','synthetic_provider',null);
    email_row:=(select jsonb_build_object('email_state',email_state,'email_send_status',email_send_status,'email_to',email_to,'email_text',email_text,'email_sent_at',email_sent_at) from public.plan_starts where card_setup_id=k and generation=g);
    if public.claim_plan_start_email(k,g,token,'{}') then raise exception 'duplicate email admitted'; end if;
    perform public.note_plan_start_email(k,g,'sent');
  else
    email_row:=(select jsonb_build_object('email_state',email_state,'email_send_status',email_send_status) from public.plan_starts where card_setup_id=k and generation=g);
    if email_row->>'email_state'<>'none' then raise exception 'Restart unexpectedly queues trial email'; end if;
  end if;
  return jsonb_build_object('during',during_start,'after',after_start,'account',account_row,'email_after_send',email_row,
    'sweep_after_email',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.card_recovery_rows(null,null,'2099-01-01',1000) r where card_id=k),
    'trial_seconds',case when first_charge is null then null else extract(epoch from first_charge-(a->>'at')::timestamptz) end);
end $$;

create temp table legacy_compatibility_results(scenario text,price_cents integer,trial_seconds numeric,rows_equal boolean,email_pending_sent boolean) on commit drop;
do $probe$
declare baseline jsonb; actual jsonb; commands text[]:=array[$old0$create or replace function public.plan_start_terms(p_card uuid,p_generation integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('purpose',purpose,'monthly_cents',monthly_cents) from public.plan_starts where card_setup_id=p_card and generation=p_generation;
$$;$old0$,$old1$create or replace function public.plan_start_answer(p_row public.plan_starts,p_admitted boolean) returns jsonb
language sql immutable security definer set search_path='' as $$
 select jsonb_build_object('admitted',p_admitted,'generation',p_row.generation,'key',p_row.start_key,'card',p_row.payment_method_id,
 'at',p_row.started_at,'state',p_row.state,'subscription',p_row.subscription_id,'first_charge',p_row.first_charge_at,
 'finished_at',p_row.finished_at,'email',p_row.email_state,'alert',p_row.team_alert_state,'purpose',p_row.purpose,'monthly_cents',p_row.monthly_cents);
$$;$old1$,$old2$create or replace function public.admit_plan_start_terms(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; p uuid; last public.plan_starts; control public.child_plan_controls;
begin
  select child_id,parent_id into c,p from public.card_setups where id=p_card;
  if c is null then raise exception 'plan_start_no_card_setup'; end if;
  perform public.plan_control_owner(p,p_card);
  if exists(select 1 from public.plan_control_operations where child_id=c and state='open') then raise exception 'plan_control_pending' using errcode='55000'; end if;
  select * into control from public.child_plan_controls where child_id=c;
  select * into last from public.plan_starts where card_setup_id=p_card order by generation desc limit 1;
  if p_purpose not in ('initial','restart') or p_monthly_cents<0 or p_generation<1 then raise exception 'invalid_start_terms'; end if;
  if (last.generation is not null and last.generation>=p_generation) or last.state='open' then
    -- An old initial caller sends trial fields without inspecting purpose. Never disclose a Restart key to it.
    if last.purpose<>p_purpose then raise exception 'restart_required' using errcode='55000'; end if;
    return public.plan_start_answer(last,false);
  end if;
  if p_purpose='initial' and (control.cancelled or exists(select 1 from public.plan_starts where card_setup_id=p_card and state in ('started','other'))) then
    raise exception 'restart_required' using errcode='55000';
  end if;
  if p_purpose='restart' and coalesce(control.revision::text,'')<>p_revision then raise exception 'stale_restart' using errcode='55000'; end if;
  insert into public.child_card_updates(child_id,parent_id) values(c,p) on conflict(child_id) do nothing;
  perform 1 from public.child_card_updates where child_id=c for update;
  if coalesce(last.generation,0)<>p_generation-1 then raise exception 'plan_start_generation_gap'; end if;
  insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,purpose,monthly_cents)
    values(p_card,p_generation,p,p_key,p_payment_method,p_purpose,p_monthly_cents) returning * into last;
  return public.plan_start_answer(last,true);
end $$;$old2$,$old3$create or replace function public.finish_plan_start(p_card uuid, p_generation integer, p_state text, p_subscription text, p_first_charge timestamptz, p_email boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
  if p_state not in ('started', 'other', 'refused') then
    raise exception 'plan_start_bad_state' using errcode = '22023';
  end if;
  select p.deletion_requested_at into deleting from public.parents p
    join public.card_setups c on c.parent_id = p.id where c.id = p_card for share of p;
  if not found then return false; end if;
  update public.plan_starts p set
    state = p_state, finished_at = now(), subscription_id = p_subscription, first_charge_at = p_first_charge,
    email_state = case when p_state = 'started' and p_email and deleting is null then 'pending' else 'none' end
    where p.card_setup_id = p_card and p.generation = p_generation and p.state = 'open';
  return found;
end $$;$old3$]; command text; p uuid; c uuid; k uuid; saved integer; amount integer; purpose text;
begin
  foreach saved in array array[7999,4900,9900] loop
    amount:=least(saved,7999);
    foreach purpose in array array['initial','restart'] loop
      p:=gen_random_uuid(); c:=gen_random_uuid(); k:=gen_random_uuid(); baseline:=null; actual:=null;
      begin
        foreach command in array commands loop execute command; end loop;
        baseline:=pg_temp.capture_legacy_start(p,c,k,saved,amount,purpose);
        raise exception using errcode='P0003',message='rollback baseline';
      exception when sqlstate 'P0003' then null;
      end;
      begin
        actual:=pg_temp.capture_legacy_start(p,c,k,saved,amount,purpose);
        raise exception using errcode='P0003',message='rollback actual';
      exception when sqlstate 'P0003' then null;
      end;
      if baseline is null or actual is null then raise exception 'missing comparison result'; end if;
      if baseline is distinct from actual then
        raise exception 'LEGACY_ONE_CHILD_MISMATCH saved=% purpose=%',saved,purpose
          using detail='baseline='||left(baseline::text,900)||' actual='||left(actual::text,900);
      end if;
      insert into legacy_compatibility_results values(purpose||' saved='||saved,amount,(actual->>'trial_seconds')::numeric,true,
        actual->'email_after_send'->>'email_state'='pending' and actual->'email_after_send'->>'email_send_status'='sent');
    end loop;
  end loop;
end $probe$;
select jsonb_build_object('marker','LEGACY_ONE_CHILD_COMPATIBILITY_OK','origin_main','724f38b488d3a9ce36d2136b8bf1ea4050d2b2f0','cases',(select jsonb_agg(to_jsonb(r) order by scenario) from legacy_compatibility_results r)) as proof;
