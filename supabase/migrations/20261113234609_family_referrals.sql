-- Additive. Service-only commands own admissions and durable money/email reservations.
-- No coupon or payment is created by this migration. No production family is changed.
create table public.referral_accounts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid unique references public.parents(id) on delete set null,
  code text unique default ('U-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,28))),
  had_paid boolean not null default false,
  history_complete boolean not null default false,
  history_blocked boolean not null default false,
  first_invoice text,
  risk_checked_at timestamptz not null default '-infinity',
  first_paid_at bigint,
  first_payment_at bigint,
  first_actual boolean not null default false,
  referrer uuid references public.referral_accounts(id),
  applied_at bigint,
  attempts timestamptz[] not null default '{}',
  check (code is null or code ~ '^U-[A-F0-9]{28}$')
);
create table public.referral_customers (
  customer text primary key,
  account_id uuid not null references public.referral_accounts(id),
  child_id uuid references public.children(id) on delete set null,
  checked_at timestamptz not null default '-infinity',
  tried_at timestamptz not null default '-infinity'
);
create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.referral_accounts(id),
  source_id uuid not null references public.referral_accounts(id),
  kind text not null check (kind in ('incoming','earned')),
  position bigint generated always as identity,
  started_at timestamptz,
  risk_revision bigint not null default 0,
  email_tried_at timestamptz not null default '-infinity',
  risk text not null default 'clear' check (risk in ('clear','hold','revoke')),
  email_state text check (email_state in ('sending','sent','unknown')),
  email_token uuid,
  email_to text,
  email_id text,
  email_copy jsonb,
  unique(source_id,kind)
);
create table public.referral_entitlements (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.referral_rewards(id),
  child_id uuid references public.children(id) on delete set null,
  used_at timestamptz,
  unique(reward_id,child_id)
);
create table public.referral_operations (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.referral_entitlements(id),
  parent_id uuid references public.parents(id) on delete set null,
  child_id uuid references public.children(id) on delete set null,
  customer text,
  invoice text unique,
  subscription text,
  start_key text unique,
  coupon text not null,
  product text not null,
  cents integer not null check (cents > 0),
  state text not null default 'reserved' check (state in ('reserved','applied','used','absent')),
  created_at timestamptz not null default clock_timestamp(),
  checked_at timestamptz not null default '-infinity'
);
create table public.referral_start_choices (
  start_key text primary key,
  parent_id uuid references public.parents(id) on delete cascade,
  operation_id uuid references public.referral_operations(id),
  cents integer not null,
  customer text not null
);
create unique index referral_entitlement_one_operation on public.referral_operations(entitlement_id) where state <> 'absent';
create table public.referral_invoice_risk (
  invoice text primary key,
  account_id uuid not null references public.referral_accounts(id),
  read_order bigint not null,
  risk text not null check (risk in ('clear','hold','revoke'))
);
create sequence public.referral_read_order;
create table public.referral_corrections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.referral_accounts(id),
  actor uuid references auth.users(id) on delete set null,
  reason text not null check (length(reason) between 1 and 1000),
  before_id uuid references public.referral_accounts(id),
  after_id uuid not null references public.referral_accounts(id),
  revision jsonb not null,
  preview jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz
);

-- No direct client writes or parent reads. Admin reads contain only operational audit data.
do $$ declare t text; begin
  foreach t in array array['referral_start_choices','referral_accounts','referral_customers','referral_rewards','referral_entitlements','referral_operations','referral_invoice_risk','referral_corrections'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role,authenticated',t);
    execute format('create policy "Admins read referrals" on public.%I for select to authenticated using ((select public.is_admin()))',t);
  end loop;
end $$;
revoke all on sequence public.referral_read_order from public,anon,authenticated,service_role;

create function public.referral_account(p uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  insert into public.referral_accounts(parent_id) values(p) on conflict(parent_id) do nothing;
  select id into strict a from public.referral_accounts where parent_id=p;
  return a;
end $$;

create function public.referral_operation_json(o public.referral_operations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',o.id,'key','referral-'||o.id||'-'||coalesce((select risk_revision from public.referral_rewards rr join public.referral_entitlements re on re.reward_id=rr.id where re.id=o.entitlement_id),0),
    'qualification',(select a.first_invoice from public.referral_rewards rr join public.referral_entitlements re on re.reward_id=rr.id join public.referral_accounts a on a.id=rr.source_id where re.id=o.entitlement_id and rr.kind='earned'),
    'policy',(select risk from public.referral_rewards rr join public.referral_entitlements re on re.reward_id=rr.id where re.id=o.entitlement_id),
    'allowed',coalesce((select risk='clear' from public.referral_rewards rr join public.referral_entitlements re on re.reward_id=rr.id where re.id=o.entitlement_id),false),'parent',o.parent_id,'child',o.child_id,'customer',o.customer,
    'invoice',o.invoice,'subscription',o.subscription,'coupon',o.coupon,'product',o.product,'cents',o.cents,
    'state',o.state,'startKey',o.start_key,'createdAt',floor(extract(epoch from o.created_at)*1000));
$$;

-- All referral commands take this program lock first, then live parent rows in UUID order.
-- Deletion uses the parent lock first and does not take the program lock. Commands take no account/ledger row lock
-- before the parent locks. Thus deletion can finish without waiting for a command that waits for its parent.
create function public.referral_command(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
<<command>>
declare
  cmd text := p_command->>'action'; p uuid := (p_command->>'parent')::uuid;
  a public.referral_accounts; b public.referral_accounts; r public.referral_rewards;
  o public.referral_operations; e public.referral_entitlements; correction public.referral_corrections;
  lock_parent uuid; account uuid; target uuid; risk_value text; n integer; state_value text;
  i text := p_command->>'invoice'; child uuid := (p_command->>'child')::uuid;
  paid_at bigint := (p_command->>'paidAt')::bigint; customer text := p_command->>'customer';
  revision jsonb; preview jsonb; limit_n integer := least(greatest(coalesce((p_command->>'limit')::integer,8),1),20);
  operation_ids uuid[]; risk_ids uuid[];
  stamp bigint := floor(extract(epoch from clock_timestamp())*1000);
begin
  if pg_catalog.pg_column_size(p_command)>600000 then raise exception 'referral_input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(743602130119::bigint);
  -- A due-list entry can become stale before its claim. Never recreate or contact its former owner.
  if cmd like 'email_%' then
    select * into r from public.referral_rewards where id=(p_command->>'reward')::uuid;
    select * into a from public.referral_accounts where id=r.account_id;
    if p is null or a.parent_id is distinct from p or not exists(select 1 from public.parents
      where id=p and email=p_command->>'recipient' and deletion_requested_at is null)
      or exists(select 1 from public.family_deletions where parent_id=p) then
      return jsonb_build_object('ok',true,'token',null,'admitted',false);
    end if;
  end if;
  if p is not null then
    select * into a from public.referral_accounts where parent_id=p;
    if cmd in ('apply','preview') then select * into b from public.referral_accounts where code=p_command->>'code' and parent_id is not null; end if;
    if cmd='correct' then
      select * into correction from public.referral_corrections where id=(p_command->>'preview')::uuid;
      select * into b from public.referral_accounts where id=correction.after_id;
    end if;
    for lock_parent in select distinct id from public.parents where id=p or id=b.parent_id or id=(select parent_id from public.referral_accounts where id=a.referrer) order by id loop
      perform 1 from public.parents where id=lock_parent for update;
    end loop;
    -- Existing receipt/risk reconciliation must survive a deletion request. It never creates an external write.
    if cmd not in ('deletion_history','paid','risk','finish','start_result') then
      perform public.assert_family_writable(p);
      if exists(select 1 from public.family_delete_holds h where h.parent_id=p and h.lease_until>clock_timestamp()) then
        return jsonb_build_object('ok',false,'error','family_unavailable');
      end if;
    end if;
    if cmd='deletion_history' and a.id is null then return jsonb_build_object('ok',true,'financial',jsonb_build_object('needed',false,'customers','[]'::jsonb)); end if;
    account := public.referral_account(p);
    select * into strict a from public.referral_accounts where id=account;
    -- Bind every current customer before history is checked. Never forget a deleted child's unknown history.
    insert into public.referral_customers(customer,account_id,child_id)
      select c.stripe_customer_id,account,c.child_id from public.card_setups c
      where c.parent_id=p and c.stripe_customer_id is not null on conflict(customer) do nothing;
    if exists(select 1 from public.card_setups c join public.referral_customers rc on rc.customer=c.stripe_customer_id
      where c.parent_id=p and rc.account_id<>account) then raise exception 'referral_customer_scope'; end if;
  end if;

  if cmd='risk' and p is null then
    select * into a from public.referral_accounts where first_invoice=i;
    if a.id is null then return jsonb_build_object('ok',true); end if;
    update public.referral_accounts set risk_checked_at=clock_timestamp() where id=a.id;
  end if;

  if cmd='deletion_history' then
    if p_command->'customers' is not null then
      insert into public.referral_customers(customer,account_id) select value,a.id from jsonb_array_elements_text(p_command->'customers') on conflict(customer) do nothing;
      if exists(select 1 from public.referral_customers rc where p_command->'customers' ? rc.customer and rc.account_id<>a.id) then raise exception 'referral_history_scope'; end if;
    end if;
    return jsonb_build_object('ok',true,'financial',jsonb_build_object('needed',a.referrer is not null,'customers',(select coalesce(jsonb_agg(customer order by customer),'[]') from public.referral_customers where account_id=a.id)));
  elsif cmd='child_operations' then
    if (select count(*)>20 from public.referral_operations where parent_id=p and child_id=child and state in ('reserved','applied')) then return jsonb_build_object('ok',false,'error','unavailable'); end if;
    for o in select * from public.referral_operations where parent_id=p and child_id=child and state in ('reserved','applied') order by created_at,id loop
      if not exists(select 1 from public.family_card_operations where id=o.id) then perform public.begin_family_card_operation(p,o.id); end if;
    end loop;
    return jsonb_build_object('ok',true,'due',jsonb_build_object('customers','[]'::jsonb,'emails','[]'::jsonb,'reservations',(select coalesce(jsonb_agg(public.referral_operation_json(ro)),'[]') from public.referral_operations ro where ro.parent_id=p and ro.child_id=child and ro.state in ('reserved','applied'))));
  elsif cmd='overview' then
    return jsonb_build_object('ok',true,'overview',jsonb_build_object(
      'code',a.code,'shareUrl','',
      'rewardsEarned',(select count(*) from public.referral_rewards where account_id=a.id and kind='earned'),
      'rewardsRemaining',(select count(*) from public.referral_rewards rr where rr.account_id=a.id and rr.kind='earned' and rr.risk<>'revoke'
        and (rr.started_at is null or exists(select 1 from public.referral_entitlements re where re.reward_id=rr.id and re.used_at is null and re.child_id is not null))),
      'pendingReferrals',(select count(*) from public.referral_accounts where referrer=a.id and first_invoice is null and parent_id is not null),
      'appliedCode',(select code from public.referral_accounts where id=a.referrer),'benefitApplied',exists(select 1 from public.referral_rewards where source_id=a.id and kind='incoming'),
      'canApply',not a.had_paid and a.referrer is null and a.history_complete and not a.history_blocked));
  elsif cmd='history' then
    if exists(select 1 from public.referral_customers rc where rc.account_id=a.id and not (p_command->'customers' ? rc.customer)) then
      return jsonb_build_object('ok',false,'error','unavailable');
    end if;
    insert into public.referral_customers(customer,account_id) select value,a.id from jsonb_array_elements_text(p_command->'customers') on conflict(customer) do nothing;
    if exists(select 1 from public.referral_customers rc where p_command->'customers' ? rc.customer and rc.account_id<>a.id) then raise exception 'referral_history_scope'; end if;
    update public.referral_accounts set history_complete=true,history_blocked=false,had_paid=had_paid or coalesce((p_command->>'paid')::boolean,false) where id=a.id;
  elsif cmd='attempt' then
    update public.referral_accounts set attempts=array(select x from unnest(a.attempts) x where x>clock_timestamp()-interval '1 hour') where id=a.id;
    if (select cardinality(attempts)>=10 from public.referral_accounts where id=a.id) then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
    update public.referral_accounts set attempts=attempts||clock_timestamp() where id=a.id;
  elsif cmd='apply' then
    if b.id is null then return jsonb_build_object('ok',false,'error','invalid'); end if;
    if b.id=a.id then return jsonb_build_object('ok',false,'error','self_referral'); end if;
    if a.referrer=b.id then return jsonb_build_object('ok',true); end if;
    if a.referrer is not null then return jsonb_build_object('ok',false,'error','already_applied'); end if;
    if not a.history_complete or a.history_blocked then return jsonb_build_object('ok',false,'error','unavailable'); end if;
    if a.had_paid then return jsonb_build_object('ok',false,'error','already_paid'); end if;
    -- An immediate creation can already be in flight. Do not admit a code behind its frozen parameters.
    if exists(select 1 from public.plan_starts where parent_id=p and state='open' and trial_end is null) then return jsonb_build_object('ok',false,'error','unavailable'); end if;
    stamp:=floor(extract(epoch from clock_timestamp())*1000);
    update public.referral_accounts set referrer=b.id,applied_at=stamp where id=a.id;
    insert into public.referral_rewards(account_id,source_id,kind) values(a.id,a.id,'incoming') on conflict do nothing;
  elsif cmd='paid' then
    if not exists(select 1 from public.referral_customers where customer=command.customer and account_id=a.id) then raise exception 'referral_customer_scope'; end if;
    if coalesce((p_command->>'cents')::integer,0)<=0 or coalesce(paid_at,0)<=0 then raise exception 'referral_paid_receipt'; end if;
    update public.referral_accounts set had_paid=true,first_payment_at=least(first_payment_at,paid_at),
      first_invoice=case when (p_command->>'paid')::boolean and (first_paid_at is null or (paid_at,i)<(first_paid_at,first_invoice)) then i else first_invoice end,
      first_actual=case when (p_command->>'paid')::boolean and (first_paid_at is null or (paid_at,i)<(first_paid_at,first_invoice)) then coalesce((p_command->>'paid')::boolean,false) else first_actual end,
      first_paid_at=case when (p_command->>'paid')::boolean then least(first_paid_at,paid_at) else first_paid_at end where id=a.id returning * into a;
    if a.referrer is not null and a.first_actual and (a.first_payment_at>=a.applied_at or exists(select 1 from public.referral_operations ro join public.referral_entitlements re on re.id=ro.entitlement_id join public.referral_rewards rr on rr.id=re.reward_id where ro.invoice=a.first_invoice and rr.source_id=a.id and rr.kind='incoming')) then
      insert into public.referral_rewards(account_id,source_id,kind)
        select a.referrer,a.id,'earned' where exists(select 1 from public.referral_accounts where id=a.referrer and parent_id is not null)
        on conflict(source_id,kind) do nothing;
    elsif a.referrer is not null and (a.first_payment_at<a.applied_at and not exists(select 1 from public.referral_operations ro where ro.invoice=a.first_invoice and ro.parent_id=p)) then
      update public.referral_rewards set risk='revoke',risk_revision=risk_revision+1 where source_id=a.id and risk<>'revoke';
    end if;
    perform public.referral_command(p_command || jsonb_build_object('action','risk'));
  elsif cmd='risk' then
    insert into public.referral_invoice_risk(invoice,account_id,read_order,risk)
      values(i,a.id,(p_command->>'readOrder')::bigint,p_command->>'risk')
      on conflict(invoice) do update set read_order=excluded.read_order,risk=case when public.referral_invoice_risk.risk='revoke' then 'revoke' else excluded.risk end
      where excluded.read_order>public.referral_invoice_risk.read_order;
    if a.first_invoice=i then
      select risk into risk_value from public.referral_invoice_risk where invoice=i;
      update public.referral_rewards set risk_revision=risk_revision+case when risk is distinct from risk_value then 1 else 0 end,
        risk=case when risk='revoke' then 'revoke' else risk_value end where source_id=a.id;
    end if;
  elsif cmd in ('reserve','start') then
    select * into o from public.referral_operations where (cmd='reserve' and invoice=i) or (cmd='start' and start_key=p_command->>'key');
    if o.id is not null then
      if o.parent_id is distinct from p or o.customer is distinct from customer or o.child_id is distinct from child then raise exception 'referral_operation_scope'; end if;
      return jsonb_build_object('ok',true,'reservation',public.referral_operation_json(o));
    end if;
    if cmd='reserve' and (p_command->>'paid')::boolean=false then return jsonb_build_object('ok',true,'reservation',null); end if;
    if cmd='start' and exists(select 1 from public.referral_start_choices where start_key=p_command->>'key') then
      return jsonb_build_object('ok',true,'reservation',null);
    end if;
    if cmd='start' and (p_command->>'paid')::boolean=false then
      insert into public.referral_start_choices(start_key,parent_id,cents,customer) values(p_command->>'key',p,(p_command->>'cents')::integer,customer);
      return jsonb_build_object('ok',true,'reservation',null);
    end if;
    if not exists(select 1 from public.children c join public.card_setups cs on cs.child_id=c.id where c.id=child and c.parent_id=p and cs.stripe_customer_id=customer)
      then raise exception 'referral_child_scope'; end if;
    if exists(select 1 from public.child_deletions where child_id=child) then return jsonb_build_object('ok',false,'error','family_unavailable'); end if;
    if exists(select 1 from public.referral_operations where child_id=child and state='reserved') then return jsonb_build_object('ok',false,'error','unavailable'); end if;
    select re.* into e from public.referral_entitlements re join public.referral_rewards rr on rr.id=re.reward_id
      where rr.account_id=a.id and rr.risk='clear' and re.child_id=child and re.used_at is null
      and not exists(select 1 from public.referral_operations ro where ro.entitlement_id=re.id and ro.state<>'absent') order by rr.position limit 1;
    if e.id is null then
      for r in select * from public.referral_rewards where account_id=a.id and started_at is null and risk='clear' order by position loop
        update public.referral_rewards set started_at=clock_timestamp() where id=r.id;
        insert into public.referral_entitlements(reward_id,child_id)
          select r.id,c.id from public.children c where c.parent_id=p and not exists(select 1 from public.child_deletions d where d.child_id=c.id)
          and (c.id=child or (p_command->'children' ? c.id::text) or exists(select 1 from public.child_plan_states ps where ps.child_id=c.id and ps.kind<>'not_started')
            or exists(select 1 from public.plan_starts ps join public.card_setups cs on cs.id=ps.card_setup_id where cs.child_id=c.id and ps.state in ('open','started')));
        select * into e from public.referral_entitlements where reward_id=r.id and child_id=child;
        if e.id is not null then exit; end if;
      end loop;
    end if;
    if e.id is null then
      if cmd='start' then insert into public.referral_start_choices(start_key,parent_id,cents,customer) values(p_command->>'key',p,(p_command->>'cents')::integer,customer); end if;
      return jsonb_build_object('ok',true,'reservation',null);
    end if;
    insert into public.referral_operations(entitlement_id,parent_id,child_id,customer,invoice,subscription,start_key,coupon,product,cents)
      values(e.id,p,child,customer,i,p_command->>'subscription',p_command->>'key',p_command->>'coupon',p_command->>'product',(p_command->>'cents')::integer) returning * into o;
    if cmd='start' then insert into public.referral_start_choices(start_key,parent_id,operation_id,cents,customer) values(p_command->>'key',p,o.id,o.cents,customer); end if;
    perform public.begin_family_card_operation(p,o.id);
    return jsonb_build_object('ok',true,'reservation',public.referral_operation_json(o));
  elsif cmd in ('finish','start_result') then
    select * into o from public.referral_operations where (p_command->>'operation' is not null and id=(p_command->>'operation')::uuid)
      or (p_command->>'operation' is null and invoice=i and (p_command->>'coupon' is null or coupon=p_command->>'coupon'))
      or (p_command->>'key' is not null and start_key=p_command->>'key');
    if o.id is null then return jsonb_build_object('ok',true); end if;
    if o.state='used' then return jsonb_build_object('ok',true); end if;
    if p_command->>'result'='detached' then
      update public.referral_operations set state=case when exists(select 1 from public.referral_entitlements re join public.referral_rewards rr on rr.id=re.reward_id where re.id=o.entitlement_id and rr.risk='revoke') then 'absent' else 'applied' end where id=o.id;
      perform public.end_family_card_operation(o.id);
      return jsonb_build_object('ok',true);
    end if;
    state_value:=case p_command->>'result' when 'used' then 'used' when 'refused' then 'absent' when 'absent' then 'absent' else 'applied' end;
    update public.referral_operations set state=state_value,invoice=coalesce(i,invoice),subscription=coalesce(p_command->>'subscription',subscription) where id=o.id;
    if state_value='used' then update public.referral_entitlements set used_at=coalesce(used_at,clock_timestamp()) where id=o.entitlement_id; end if;
    perform public.end_family_card_operation(o.id);
  elsif cmd='tried' then
    update public.referral_customers set tried_at=clock_timestamp() where referral_customers.customer=command.customer;
  elsif cmd='checked' then
    update public.referral_customers set checked_at=clock_timestamp() where referral_customers.customer=command.customer;
  elsif cmd='due' then
    select array_agg(id) into operation_ids from (select id from public.referral_operations where state in ('reserved','applied') and parent_id is not null order by checked_at,id limit limit_n) candidates;
    select array_agg(id) into risk_ids from (select a.id from public.referral_accounts a where a.first_invoice is not null
      and exists(select 1 from public.referral_rewards rr where rr.source_id=a.id and rr.kind='earned' and rr.risk<>'revoke' and (rr.started_at is null or exists(select 1 from public.referral_entitlements re where re.reward_id=rr.id and re.used_at is null and re.child_id is not null)))
      order by a.risk_checked_at,a.id limit limit_n) candidates;
    if p_command->>'operation' is distinct from 'email' then
      update public.referral_accounts set risk_checked_at=clock_timestamp() where id=any(risk_ids);
      update public.referral_operations set checked_at=clock_timestamp() where id=any(operation_ids);
    end if;
    return jsonb_build_object('ok',true,'due',jsonb_build_object(
      'riskInvoices',(select coalesce(jsonb_agg(first_invoice),'[]') from public.referral_accounts where id=any(risk_ids)),
      'customers',(select coalesce(jsonb_agg(jsonb_build_object('parent',c.parent_id,'child',c.child_id,'customer',c.customer)),'[]') from
        (select * from (
          select cs.parent_id,cs.child_id,cs.stripe_customer_id as customer,coalesce(rc.tried_at,'-infinity') as checked_at,cs.id::text as tie
            from public.card_setups cs left join public.referral_customers rc on rc.customer=cs.stripe_customer_id where cs.stripe_customer_id is not null and exists(select 1 from public.parents p where p.id=cs.parent_id and p.deletion_requested_at is null) and not exists(select 1 from public.family_deletions fd where fd.parent_id=cs.parent_id)
          union all select a.parent_id,rc.child_id,rc.customer,rc.tried_at,rc.customer from public.referral_customers rc join public.referral_accounts a on a.id=rc.account_id
            where rc.child_id is null and a.parent_id is not null and exists(select 1 from public.parents p where p.id=a.parent_id and p.deletion_requested_at is null) and not exists(select 1 from public.family_deletions fd where fd.parent_id=a.parent_id)
        ) candidates order by checked_at,tie limit limit_n) c),
      'reservations',(select coalesce(jsonb_agg(public.referral_operation_json(ro)),'[]') from
        (select * from public.referral_operations where id=any(operation_ids) order by checked_at,id) ro),
      'emails',(select coalesce(jsonb_agg(jsonb_build_object('reward',rr.id,'parent',a.parent_id,'email',p.email)),'[]') from
        (select * from public.referral_rewards where kind='earned' and risk='clear' and email_state is null order by email_tried_at,position limit limit_n) rr
        join public.referral_accounts a on a.id=rr.account_id join public.parents p on p.id=a.parent_id where p.deletion_requested_at is null)));
  elsif cmd in ('preview','correct') then
    if not exists(select 1 from public.admin_users where user_id=(p_command->>'actor')::uuid) then raise exception 'referral_admin'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'owner',rr.account_id,'started',rr.started_at,'email',rr.email_state,
      'children',(select coalesce(jsonb_agg(jsonb_build_object('id',re.id,'used',re.used_at) order by re.id),'[]') from public.referral_entitlements re where re.reward_id=rr.id)) order by rr.position),'[]') into revision from public.referral_rewards rr where rr.source_id=a.id;
    if cmd='preview' then
      if b.id is null or b.id=a.id or length(trim(p_command->>'reason')) not between 1 and 1000 then return jsonb_build_object('ok',false,'error','invalid'); end if;
      preview:=jsonb_build_object('before',a.referrer,'after',b.id,'paid',a.had_paid,
        'used',(select count(*) from public.referral_entitlements re join public.referral_rewards rr on rr.id=re.reward_id where rr.source_id=a.id and re.used_at is not null),
        'unused',(select count(*) from public.referral_entitlements re join public.referral_rewards rr on rr.id=re.reward_id where rr.source_id=a.id and re.used_at is null));
      insert into public.referral_corrections(account_id,actor,reason,before_id,after_id,revision,preview)
        values(a.id,(p_command->>'actor')::uuid,trim(p_command->>'reason'),a.referrer,b.id,revision,preview) returning * into correction;
      return jsonb_build_object('ok',true,'preview',preview||jsonb_build_object('token',correction.id));
    end if;
    if correction.id is null or correction.account_id<>a.id or correction.actor<>(p_command->>'actor')::uuid
      or correction.applied_at is not null or correction.before_id is distinct from a.referrer or correction.revision<>revision then return jsonb_build_object('ok',false,'error','invalid'); end if;
    -- A started reward stays with its fixed children, including used invoices. There is no second award.
    if exists(select 1 from public.referral_rewards where source_id=a.id and kind='earned' and started_at is null and email_state in ('sending','unknown')) then
      return jsonb_build_object('ok',false,'error','email_pending');
    end if;
    update public.referral_rewards set account_id=correction.after_id,email_copy=null,email_id=null,email_token=null,email_to=null where source_id=a.id and kind='earned' and started_at is null;
    if a.first_actual then
      insert into public.referral_rewards(account_id,source_id,kind,risk) values(correction.after_id,a.id,'earned',coalesce((select risk from public.referral_invoice_risk where invoice=a.first_invoice),'clear')) on conflict(source_id,kind) do nothing;
    end if;
    update public.referral_accounts set referrer=correction.after_id where id=a.id;
    update public.referral_corrections set applied_at=clock_timestamp() where id=correction.id;
  elsif cmd like 'email_%' then
    select * into r from public.referral_rewards where id=(p_command->>'reward')::uuid;
    select * into a from public.referral_accounts where id=r.account_id;
    if cmd='email_claim' then
      if r.kind<>'earned' or r.risk<>'clear' or r.email_state is not null or a.parent_id is null then return jsonb_build_object('ok',true,'token',null); end if;
      perform public.assert_family_writable(a.parent_id);
      update public.referral_rewards set email_state='sending',email_tried_at=clock_timestamp(),email_token=(p_command->>'token')::uuid,email_to=p_command->>'recipient' where id=r.id;
      return jsonb_build_object('ok',true,'token',p_command->>'token');
    elsif cmd='email_admit' then
      return jsonb_build_object('ok',true,'admitted',r.risk='clear' and r.email_state='sending'
        and r.email_token=(p_command->>'token')::uuid and r.email_to=p_command->>'recipient' and a.parent_id=p
        and exists(select 1 from public.parents where id=a.parent_id and deletion_requested_at is null)
        and not exists(select 1 from public.family_deletions where parent_id=a.parent_id));
    elsif cmd='email_result' then
      update public.referral_rewards set email_state=case p_command->>'emailState' when 'refused' then null else p_command->>'emailState' end,
        email_id=p_command->>'emailId' where id=r.id and email_token=(p_command->>'token')::uuid and email_to=p_command->>'recipient';
    elsif cmd='email_copy' then
      if a.parent_id is null then return jsonb_build_object('ok',true); end if;
      perform public.assert_family_writable(a.parent_id);
      update public.referral_rewards set email_copy=p_command->'copy' where id=r.id and email_token=(p_command->>'token')::uuid and email_to=p_command->>'recipient' and a.parent_id=p;
    end if;
  else raise exception 'referral_command';
  end if;
  return jsonb_build_object('ok',true);
end $$;

create function public.referral_next_read() returns bigint language sql security definer set search_path='' as $$ select nextval('public.referral_read_order'); $$;

-- A deleted child's customer stays until full billing history has been established. The history flag never returns
-- to complete after an unchecked deletion. A paid receipt and other children's entitlements survive all child deletes.
create function public.referral_before_card_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
  if old.stripe_customer_id is null or not exists(select 1 from public.parents where id=old.parent_id) then return old; end if;
  if exists(select 1 from public.referral_accounts where parent_id=old.parent_id and code is null) then return old; end if;
  a:=public.referral_account(old.parent_id);
  update public.referral_accounts set history_blocked=history_blocked or not history_complete where id=a;
  insert into public.referral_customers(customer,account_id,child_id) values(old.stripe_customer_id,a,null) on conflict(customer) do update set child_id=null;
  return old;
end $$;
create trigger referral_history_before_card_delete before delete on public.card_setups for each row execute function public.referral_before_card_delete();

-- Remove cross-family identifiers while preserving an already earned reward. A referral code is not reissued.
create function public.referral_before_family_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
  select id into a from public.referral_accounts where parent_id=old.id;
  if a is not null then
    update public.referral_accounts set code=null,attempts='{}' where id=a;
    -- Retain only the first financial receipt for another family's unused reward. Parent/code/contact links are removed.
    delete from public.referral_invoice_risk where account_id=a and invoice is distinct from (select first_invoice from public.referral_accounts where id=a);
    update public.referral_operations set customer=null,invoice=null,subscription=null,start_key=null where parent_id=old.id;
    delete from public.referral_customers where account_id=a;
    update public.referral_rewards set email_copy=null,email_id=null,email_token=null,email_to=null where account_id=a;
    update public.referral_corrections set reason='Family removed',preview='{}',revision='[]' where account_id=a or before_id=a or after_id=a;
  end if;
  return old;
end $$;
create trigger referral_cleanup_before_family_delete before delete on public.parents for each row execute function public.referral_before_family_delete();

revoke all on function public.referral_account(uuid),public.referral_operation_json(public.referral_operations),public.referral_before_card_delete(),public.referral_before_family_delete(),public.referral_command(jsonb),public.referral_next_read() from public,anon,authenticated,service_role;
grant execute on function public.referral_command(jsonb),public.referral_next_read() to service_role;
