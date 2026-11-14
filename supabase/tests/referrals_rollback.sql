-- Synthetic rows only. Run after the migration. The final ROLLBACK is required.
begin;
do $$
declare
  p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  a uuid; b uuid; code text; result jsonb; op jsonb; mail uuid:=gen_random_uuid(); earned uuid; stamp bigint:=floor(extract(epoch from clock_timestamp())*1000)+1000;
begin
  if has_function_privilege('anon','public.referral_command(jsonb)','execute') or has_function_privilege('authenticated','public.referral_command(jsonb)','execute') then raise exception 'public command privilege'; end if;
  if not has_function_privilege('service_role','public.referral_command(jsonb)','execute') then raise exception 'service command privilege'; end if;
  insert into auth.users(id) values(p),(q),(admin);
  insert into public.parents(id,name,email,postal) values(p,'Synthetic Referrer','referrer@referral.invalid','V6B1A1'),(q,'Synthetic Referred','referred@referral.invalid','V6B1A1'),(admin,'Synthetic Target','target@referral.invalid','V6B1A1');
  insert into public.admin_users(user_id,email,name) values(admin,'target@referral.invalid','Synthetic Target');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Synthetic',3,'BC'),(d,q,'Synthetic',3,'BC');
  insert into public.card_setups(parent_id,child_id,plan,price,stripe_customer_id) values(p,c,'one',79.99,'synthetic_'||c),(q,d,'one',59.99,'synthetic_'||d);
  perform public.referral_command(jsonb_build_object('action','overview','parent',p));
  select id,referral_accounts.code into a,code from public.referral_accounts where parent_id=p;
  perform public.referral_command(jsonb_build_object('action','history','parent',q,'customers',jsonb_build_array('synthetic_'||d),'paid',false,'complete',true));
  result:=public.referral_command(jsonb_build_object('action','apply','parent',q,'code',code));
  if not (result->>'ok')::boolean then raise exception 'admission failed: %',result; end if;
  perform public.referral_command(jsonb_build_object('action','apply','parent',q,'code',code));
  select id into b from public.referral_accounts where parent_id=q;
  if (select count(*) from public.referral_rewards where source_id=b and kind='incoming')<>1 then raise exception 'duplicate incoming'; end if;
  perform public.referral_command(jsonb_build_object('action','paid','parent',q,'customer','synthetic_'||d,'invoice','synthetic_first_'||d,'subscription','synthetic_sub','cents',3000,'paidAt',stamp,'paid',true,'risk','clear','readOrder',1));
  perform public.referral_command(jsonb_build_object('action','paid','parent',q,'customer','synthetic_'||d,'invoice','synthetic_first_'||d,'subscription','synthetic_sub','cents',3000,'paidAt',stamp,'paid',true,'risk','clear','readOrder',2));
  if (select count(*) from public.referral_rewards where source_id=b and kind='earned')<>1 then raise exception 'duplicate earned'; end if;
  select id into earned from public.referral_rewards where source_id=b and kind='earned';
  result:=public.referral_command(jsonb_build_object('action','email_claim','parent',p,'reward',earned,'recipient','wrong@referral.invalid','token',mail));
  if result->>'token' is not null then raise exception 'wrong recipient claimed'; end if;
  result:=public.referral_command(jsonb_build_object('action','email_claim','parent',p,'reward',earned,'recipient','referrer@referral.invalid','token',mail));
  if result->>'token' is distinct from mail::text then raise exception 'email not claimed'; end if;
  result:=public.referral_command(jsonb_build_object('action','email_admit','parent',p,'reward',earned,'recipient','referrer@referral.invalid','token',gen_random_uuid()));
  if (result->>'admitted')::boolean then raise exception 'wrong token admitted'; end if;
  result:=public.referral_command(jsonb_build_object('action','email_admit','parent',p,'reward',earned,'recipient','referrer@referral.invalid','token',mail));
  if not (result->>'admitted')::boolean then raise exception 'current claim refused'; end if;
  perform public.referral_command(jsonb_build_object('action','overview','parent',admin));
  select referral_accounts.code into code from public.referral_accounts where parent_id=admin;
  result:=public.referral_command(jsonb_build_object('action','preview','parent',q,'code',code,'actor',admin,'reason','Pending email control'));
  result:=public.referral_command(jsonb_build_object('action','correct','parent',q,'actor',admin,'preview',result->'preview'->>'token'));
  if result->>'error' is distinct from 'email_pending' then raise exception 'in-flight email moved'; end if;
  perform public.referral_command(jsonb_build_object('action','email_result','parent',p,'reward',earned,'recipient','referrer@referral.invalid','token',mail,'emailState','refused'));
  -- An immediate start includes its current child even before its plan state is saved.
  result:=public.referral_command(jsonb_build_object('action','start','parent',p,'child',c,'customer','synthetic_'||c,'key','synthetic_start_'||c,'cents',7999,'coupon','synthetic_coupon','product','unica_math','paid',true));
  op:=result->'reservation';
  if op is null or op='null'::jsonb then raise exception 'no immediate reservation: %',result; end if;
  result:=public.referral_command(jsonb_build_object('action','start','parent',p,'child',c,'customer','synthetic_'||c,'key','synthetic_start_'||c,'cents',7999,'coupon','changed_coupon','product','unica_math','paid',true));
  if result->'reservation'->>'coupon'<>'synthetic_coupon' then raise exception 'parameters not frozen'; end if;
  if not exists(select 1 from public.family_card_operations where id=(op->>'id')::uuid) then raise exception 'missing deletion hold'; end if;
  perform public.referral_command(jsonb_build_object('action','start_result','operation',op->>'id','invoice','synthetic_use_'||c,'result','used'));
  -- A previewed post-use correction changes attribution without moving a fixed cohort or duplicating its award.
  perform public.referral_command(jsonb_build_object('action','overview','parent',admin));
  select referral_accounts.code into code from public.referral_accounts where parent_id=admin;
  result:=public.referral_command(jsonb_build_object('action','preview','parent',q,'code',code,'actor',admin,'reason','Synthetic correction'));
  if not (result->>'ok')::boolean or (result->'preview'->>'used')::integer<>1 then raise exception 'correction preview failed'; end if;
  result:=public.referral_command(jsonb_build_object('action','correct','parent',q,'actor',admin,'preview',result->'preview'->>'token'));
  if not (result->>'ok')::boolean or (select count(*) from public.referral_corrections where account_id=b and applied_at is not null)<>1 then raise exception 'correction audit failed'; end if;
  if (select count(*) from public.referral_rewards where source_id=b and kind='earned')<>1 or not exists(select 1 from public.referral_rewards where source_id=b and kind='earned' and account_id=a) then raise exception 'correction duplicated or moved a used award'; end if;
  perform public.referral_command(jsonb_build_object('action','risk','parent',q,'customer','synthetic_'||d,'invoice','synthetic_first_'||d,'risk','revoke','readOrder',4));
  perform public.referral_command(jsonb_build_object('action','risk','parent',q,'customer','synthetic_'||d,'invoice','synthetic_first_'||d,'risk','clear','readOrder',3));
  if exists(select 1 from public.referral_rewards where source_id=b and risk<>'revoke') then raise exception 'reordered revival'; end if;
  if not exists(select 1 from public.referral_entitlements where reward_id=(select id from public.referral_rewards where source_id=b and kind='earned') and used_at is not null) then raise exception 'used benefit erased'; end if;
  delete from public.children where id=d;
  if not (select had_paid from public.referral_accounts where id=b) then raise exception 'history erased by child delete'; end if;
  delete from public.parents where id=q;
  if not exists(select 1 from public.referral_rewards where source_id=b and account_id=a and kind='earned') then raise exception 'cross-family reward erased'; end if;
  if exists(select 1 from public.referral_customers where account_id=b) or (select referral_accounts.code is not null from public.referral_accounts where id=b) then raise exception 'cross-family identifiers retained'; end if;
end $$;
rollback;
