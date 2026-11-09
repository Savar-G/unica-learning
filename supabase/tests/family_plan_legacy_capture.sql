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
