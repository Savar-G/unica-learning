-- #191 R4. Apply after fix_customer_retention, with old workers stopped and drained.
-- Stop old signup handlers too. A pre-migration Stripe call has no durable hold.
-- No deletion or time-based release. Null state preserves legacy booking discovery.
do $$ begin
  if to_regprocedure('public.family_retention_cards(uuid)') is null then
    raise exception 'apply_fix_customer_retention_first';
  end if;
end $$;

alter table public.signups add column booking_state text
  check (booking_state in ('pending', 'ready', 'not_started'));
alter table public.signups add column booking_customer_id text
  check (length(booking_customer_id) between 1 and 255);

-- Keep linkage after an email change. The hold uses the existing claim/decision/lease guards.
create table public.booking_family_links (
  signup_id bigint not null references public.signups(id),
  parent_id uuid not null references public.parents(id) on delete cascade,
  hold_id uuid not null unique default gen_random_uuid(),
  primary key(signup_id, parent_id)
);
alter table public.booking_family_links enable row level security;
revoke all on public.booking_family_links from public, anon, authenticated;
grant all on public.booking_family_links to service_role;

-- Direct browser inserts cannot acknowledge a hold before they create a remote customer.
revoke all on public.signups from public, anon, authenticated;
drop policy "Site can add signups" on public.signups;
grant select, insert, update on public.signups to service_role;
grant usage, select on sequence public.signups_id_seq to service_role;

-- Serialize email admission with family creation and identity changes, including when no parent exists yet.
-- Hash collisions only serialize unrelated bookings. They never bypass a check.
create function public.lock_booking_email(mail text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if mail is not null then perform pg_advisory_xact_lock(hashtextextended(lower(mail), 191)); end if;
end $$;

-- Caller holds the email admission lock. Each existing parent also shares the deletion row lock.
create function public.link_booking_family(sid bigint, pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare link public.booking_family_links; state text;
begin
  perform public.assert_family_writable(pid);
  insert into public.booking_family_links(signup_id, parent_id) values(sid, pid)
    on conflict do nothing;
  select * into link from public.booking_family_links where signup_id = sid and parent_id = pid;
  select booking_state into state from public.signups where id = sid;
  if state = 'pending' then
    insert into public.family_card_operations(id, parent_id) values(link.hold_id, pid) on conflict do nothing;
  end if;
end $$;

create function public.fence_booking_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform public.lock_booking_email(new.email);
  if tg_op = 'INSERT' then
    if new.ref is null then raise exception 'booking_reference_required' using errcode = '55000'; end if;
    new.booking_state := case when new.status = 'reserved' then 'pending' else 'not_started' end;
    new.booking_customer_id := null;
  else
    if (new.id, new.email, new.ref, new.status) is distinct from (old.id, old.email, old.ref, old.status)
      or old.booking_state is distinct from 'pending'
      or new.booking_state not in ('ready', 'not_started') or new.booking_state is null
      or (new.booking_state = 'ready' and new.booking_customer_id is null)
      or (new.booking_state = 'not_started' and new.booking_customer_id is not null) then
      raise exception 'booking_transition_unavailable' using errcode = '55000';
    end if;
  end if;
  for pid in
    select p.id from public.parents p left join auth.users u on u.id = p.id
    where lower(p.email) = lower(new.email) or lower(u.email) = lower(new.email)
      or exists(select 1 from public.booking_family_links l where l.signup_id = new.id and l.parent_id = p.id)
    order by p.id for update of p
  loop
    perform public.assert_family_writable(pid);
  end loop;
  return new;
end $$;

create function public.attach_booking_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  for pid in
    select p.id from public.parents p left join auth.users u on u.id = p.id
    where lower(p.email) = lower(new.email) or lower(u.email) = lower(new.email)
      or exists(select 1 from public.booking_family_links l where l.signup_id = new.id and l.parent_id = p.id)
    order by p.id
  loop
    perform public.link_booking_family(new.id, pid);
  end loop;
  if new.booking_state <> 'pending' then
    delete from public.family_card_operations c using public.booking_family_links l
      where l.signup_id = new.id and c.id = l.hold_id;
  end if;
  return new;
end $$;
create trigger fence_booking_signup before insert or update on public.signups
  for each row execute function public.fence_booking_signup();
create trigger attach_booking_signup after insert or update on public.signups
  for each row execute function public.attach_booking_signup();

-- Both identity tables participate. A pending booking cannot disappear through an email change.
-- A new family adopts all existing bookings and their pending holds under the same email lock.
create function public.fence_booking_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mail text;
begin
  for mail in
    select distinct x from unnest(array[new.email,
      case when tg_op = 'UPDATE' then old.email else null end,
      case when tg_table_schema = 'public' then (select u.email from auth.users u where u.id = new.id)
        else (select p.email from public.parents p where p.id = new.id) end]) x
    where x is not null order by x
  loop perform public.lock_booking_email(mail); end loop;
  if exists(select 1 from public.parents where id = new.id) then
    perform public.assert_family_writable(new.id);
  end if;
  return new;
end $$;
create function public.attach_booking_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid bigint;
begin
  if not exists(select 1 from public.parents where id = new.id) then return new; end if;
  for sid in
    select s.id from public.signups s
    join public.parents p on p.id = new.id left join auth.users u on u.id = p.id
    where lower(s.email) = lower(p.email) or lower(s.email) = lower(u.email)
      or exists(select 1 from public.booking_family_links l where l.signup_id = s.id and l.parent_id = p.id)
    order by s.id
  loop perform public.link_booking_family(sid, new.id); end loop;
  return new;
end $$;
create trigger fence_booking_parent_identity before insert or update of email on public.parents
  for each row execute function public.fence_booking_identity();
create trigger attach_booking_parent_identity after insert or update of email on public.parents
  for each row execute function public.attach_booking_identity();
create trigger fence_booking_auth_identity before insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.fence_booking_identity();
create trigger attach_booking_auth_identity after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.attach_booking_identity();

-- An acknowledged transaction is required before any Stripe call. No fallback to anonymous insertion.
create function public.begin_booking_signup(payload jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.signups(status, ref, name, email, postal, plan, subject, grade, curriculum, price, source)
  values(payload->>'status', (payload->>'ref')::uuid, payload->>'name', lower(payload->>'email'),
    payload->>'postal', payload->>'plan', payload->>'subject', (payload->>'grade')::smallint,
    payload->>'curriculum', (payload->>'price')::smallint, coalesce(payload->'source', '{}'::jsonb));
  return true;
end $$;
-- customer=null attests that no remote call was started. It is never used after a remote error or abort.
-- A lost finish response is safe: either its transaction committed or the pending hold remains.
create function public.finish_booking_signup(booking_ref uuid, customer text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.signups set booking_state = case when customer is null then 'not_started' else 'ready' end,
    booking_customer_id = customer where ref = booking_ref and booking_state = 'pending';
  return found;
end $$;

-- Persist existing identity links without changing old booking/payment facts or creating deletion requests.
insert into public.booking_family_links(signup_id, parent_id)
  select s.id, p.id from public.signups s join public.parents p on true left join auth.users u on u.id = p.id
  where lower(s.email) = lower(p.email) or lower(s.email) = lower(u.email)
  on conflict do nothing;

create or replace function public.family_retention_cards(p uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(f.card), '[]'::jsonb) from (
    select jsonb_build_object('customer', c.stripe_customer_id, 'saved', c.card_saved_at is not null) as card
      from public.card_setups c where c.parent_id = p
        and (c.stripe_customer_id is not null or c.card_saved_at is not null)
    union all
    select jsonb_build_object('customer', null, 'saved', false, 'booking',
      case when s.booking_state is distinct from 'pending' and s.ref is not null
        and u.email_confirmed_at is not null and lower(u.email) = lower(parent.email)
        and lower(s.email) = lower(u.email)
      then jsonb_build_object('email', s.email, 'ref', s.ref) else 'null'::jsonb end)
      from public.parents parent left join auth.users u on u.id = parent.id
      join public.signups s on lower(s.email) = lower(parent.email) or lower(s.email) = lower(u.email)
        or exists(select 1 from public.booking_family_links l where l.signup_id = s.id and l.parent_id = parent.id)
      -- Reserved signups keep their reference even when Stripe was off. The existing flow permits a later
      -- manual card link. No match stays unknown; it is never proof that this booking cannot become a customer.
      where parent.id = p and (s.booking_state is distinct from 'not_started' or s.status = 'reserved')
  ) f;
$$;

revoke all on function public.lock_booking_email(text), public.link_booking_family(bigint,uuid),
  public.fence_booking_signup(), public.attach_booking_signup(), public.fence_booking_identity(),
  public.attach_booking_identity(), public.begin_booking_signup(jsonb), public.finish_booking_signup(uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_booking_signup(jsonb), public.finish_booking_signup(uuid,text) to service_role;
