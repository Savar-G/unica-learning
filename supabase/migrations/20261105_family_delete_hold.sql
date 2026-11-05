-- The self-serve family delete keeps plan starts out from its final plan read until its request is written (#556, review
-- of PR #602), and records that a request came from that flow. It creates no request and deletes no family.
--
-- Additive: it only creates and replaces. The new table is empty, so begin_family_card_operation behaves as before
-- for the code on main. The parent's request gets a new function, request_parent_family_deletion_held. The old
-- request_parent_family_deletion(uuid, boolean) stays in place with no caller (main never called it); the PR names it for a later cleanup.

-- The delete's hold, one row per parent. It is not a row of public.family_card_operations, on purpose. That table's holds
-- never expire, because each may hide a Stripe object that a lost answer left behind. This hold protects no Stripe write of
-- its own: a stop that is lost is settled by the read after it. So it has a lease: a server that dies while it holds it
-- blocks plan starts for at most 5 minutes, and blocks no retention run and no admin request at all. No family write fence
-- trigger: a retry must work for a family already fenced. The row goes with the parent through the cascade.
create table public.family_delete_holds (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  lease_token uuid not null,
  lease_until timestamptz not null
);
alter table public.family_delete_holds enable row level security;
revoke all on public.family_delete_holds from public, anon, authenticated, service_role;

-- Set only when the parent's own flow wrote the request, after a read of every Stripe customer found no plan that can
-- charge. An admin's request and a retention freeze leave it null. It goes with the request row.
alter table public.family_deletions add column plans_stopped_at timestamptz;

-- The time is read after the row lock, not at the start of the transaction, so that a wait for the lock cannot stretch a
-- lease: under one row lock, the plan start and the request see the lease's end in the order they ran.

-- As before, and a plan start or a card step is refused with the fence's own error while a delete hold is live.
create or replace function public.begin_family_card_operation(p uuid, token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_family_writable(p);
  if exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_until > clock_timestamp()) then
    raise exception 'family_unavailable' using errcode = '55000';
  end if;
  insert into public.family_card_operations(id, parent_id) values(token, p);
end $$;

-- The check before any plan stops. It writes nothing. 'busy': a card step, or another delete that holds the family.
create function public.check_parent_family_deletion(p uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p)
    or exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_until > clock_timestamp()) then return 'busy'; end if;
  return 'ready';
end $$;

-- Taken before the final plan read. From this commit, begin_family_card_operation is refused, so no plan can start after
-- that read and before the request. A start that went first still holds its own row here ('busy'), or has ended and its
-- plan is in the read.
create function public.begin_family_delete_hold(p uuid, hold uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p)
    or exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_until > clock_timestamp() and h.lease_token <> hold) then return 'busy'; end if;
  insert into public.family_delete_holds(parent_id, lease_token, lease_until) values (p, hold, clock_timestamp() + interval '5 minutes')
    on conflict (parent_id) do update set lease_token = excluded.lease_token, lease_until = excluded.lease_until;
  return 'held';
end $$;

-- Lets go of this flow's hold only, by ending its lease. The row stays until the next hold replaces it or the family goes.
create function public.end_family_delete_hold(p uuid, hold uuid) returns void
language sql security definer set search_path = '' as $$
  update public.family_delete_holds set lease_until = '-infinity' where parent_id = p and lease_token = hold;
$$;

-- The parent's own request. The server calls it only after it checked the password, stopped every plan and read every
-- customer again under `hold`. Without that hold still live, it refuses: after a lease ended, a plan may have started since
-- the read. It also refuses any card hold, as request_family_deletion does. Same effects as before: a family the retention
-- job froze moves to reason 'request', so a late 'keep' cannot reopen it. The hold ends in the same transaction.
create function public.request_parent_family_deletion_held(p uuid, hold uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if not exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_token = hold and h.lease_until > clock_timestamp())
    or exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason, plans_stopped_at) values (p, 'request', now())
    on conflict (parent_id) do update set reason = 'request', plans_stopped_at = excluded.plans_stopped_at;
  update public.family_delete_holds set lease_until = '-infinity' where parent_id = p;
  return 'requested';
end $$;

-- What the signed-in parent's own session may know: null (no queued request), 'queued' (a request that did not stop any
-- plan, such as an admin's) or 'plans_stopped'. A retention freeze can reopen, so it does not count. It reads the request
-- row, not the parent row, so it still answers after the deletion removed the Auth user and before it removed the row.
create function public.my_family_deletion_state() returns text
language sql stable security definer set search_path = '' as $$
  select case when d.plans_stopped_at is null then 'queued' else 'plans_stopped' end
    from public.family_deletions d where d.parent_id = auth.uid() and d.reason = 'request';
$$;

revoke all on function public.check_parent_family_deletion(uuid), public.begin_family_delete_hold(uuid, uuid),
  public.end_family_delete_hold(uuid, uuid), public.request_parent_family_deletion_held(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_parent_family_deletion(uuid), public.begin_family_delete_hold(uuid, uuid),
  public.end_family_delete_hold(uuid, uuid), public.request_parent_family_deletion_held(uuid, uuid) to service_role;
revoke all on function public.my_family_deletion_state() from public, anon;
grant execute on function public.my_family_deletion_state() to authenticated;
