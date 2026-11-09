-- #772. New entry points only. Existing admission and finish functions keep their bodies and behavior.
-- Applying this migration does not change a stored operation or send an alert.
alter table public.plan_control_operations add column deletion_closed_at timestamptz;
create index plan_cancel_open_age on public.plan_control_operations(created_at,id) where kind='cancel' and state='open';

-- A separate service-only ledger also works when the family's writes are fenced.
create table public.plan_cancel_alerts (
  operation_id uuid primary key references public.plan_control_operations(id) on delete cascade,
  state text not null check(state in ('sending','sent','released','unknown')),
  claimed_at timestamptz not null default clock_timestamp()
);
alter table public.plan_cancel_alerts enable row level security;
revoke all on public.plan_cancel_alerts from public,anon,authenticated,service_role;
grant select on public.plan_cancel_alerts to service_role;

create function public.due_plan_cancel_alerts(p_before timestamptz,p_limit integer default 50)
returns table(id uuid,parent_id uuid,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select o.id,o.parent_id,o.created_at from public.plan_control_operations o
  left join public.plan_cancel_alerts a on a.operation_id=o.id
  where o.kind='cancel' and o.state='open' and o.created_at<p_before and (a.state is null or a.state='released')
  order by o.created_at,o.id limit least(greatest(coalesce(p_limit,50),1),1000);
$$;
create function public.claim_plan_cancel_alert(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.plan_control_operations where id=p_id and kind='cancel' and state='open') then return false; end if;
  insert into public.plan_cancel_alerts(operation_id,state) values(p_id,'sending')
    on conflict(operation_id) do update set state='sending',claimed_at=clock_timestamp() where plan_cancel_alerts.state='released';
  return found;
end $$;
create function public.note_plan_cancel_alert(p_id uuid,p_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_state not in ('sent','released','unknown') then raise exception 'invalid_alert_state'; end if;
  update public.plan_cancel_alerts set state=p_state where operation_id=p_id and state='sending';
end $$;

-- Replace only this table's trigger bindings. No shared fence function changes.
-- Old callers cannot opt in: they never set deletion_closed_at. The exception permits exactly one open Cancel's close.
create function public.fence_plan_cancel_recovery() returns trigger
language plpgsql security definer set search_path='' as $$
declare deleting timestamptz;
begin
  if tg_op='UPDATE' and old.kind='cancel' and old.state='open' and old.deletion_closed_at is null
    and new.state in ('applied','refused') and new.deletion_closed_at is not null
    and new.finished_at=new.deletion_closed_at
    and (to_jsonb(new)-array['state','finished_at','deletion_closed_at'])=(to_jsonb(old)-array['state','finished_at','deletion_closed_at']) then
    select deletion_requested_at into deleting from public.parents where id=old.parent_id for share;
    if found and deleting is not null then return new; end if;
  end if;
  -- The original family and child guards for this table, including their parent locks.
  if tg_name='fence_family_write' then
    if tg_op='UPDATE' then perform public.assert_family_writable(old.parent_id); end if;
    perform public.assert_family_writable(new.parent_id);
  else
    perform public.assert_family_writable(new.parent_id);
    if exists(select 1 from public.child_deletions where child_id=new.child_id) then raise exception 'child_unavailable' using errcode='55000'; end if;
    if tg_op='UPDATE' then
      perform public.assert_family_writable(old.parent_id);
      if exists(select 1 from public.child_deletions where child_id=old.child_id) then raise exception 'child_unavailable' using errcode='55000'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.fence_plan_cancel_recovery() from public,anon,authenticated,service_role;
create or replace trigger fence_family_write before insert or update on public.plan_control_operations
  for each row execute function public.fence_plan_cancel_recovery();
create or replace trigger fence_child_delete_write before insert or update on public.plan_control_operations
  for each row execute function public.fence_plan_cancel_recovery();

create function public.close_plan_cancel(p_parent uuid,p_id uuid,p_state text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.plan_control_operations; deleting timestamptz; closed timestamptz;
begin
  if p_state not in ('applied','refused') or p_state is null then raise exception 'invalid_state'; end if;
  -- Lock parent, then child, then operation, in the same order as admission and deletion.
  select deletion_requested_at into deleting from public.parents where id=p_parent for share;
  if not found then return false; end if;
  select * into o from public.plan_control_operations where id=p_id and parent_id=p_parent and kind='cancel' and state='open';
  if not found then return false; end if;
  perform 1 from public.children where id=o.child_id and parent_id=p_parent for no key update;
  if not found then return false; end if;
  select * into o from public.plan_control_operations where id=p_id and parent_id=p_parent and kind='cancel' and state='open' for update;
  if not found then return false; end if;
  if deleting is null then
    -- The ordinary close retains cancellation and mailing semantics. The old function is unchanged.
    perform public.finish_plan_control(p_id,p_state);
  else
    closed:=clock_timestamp();
    update public.plan_control_operations set state=p_state,finished_at=closed,deletion_closed_at=closed
      where id=p_id and parent_id=p_parent and kind='cancel' and state='open';
    -- The existing release function removes only the hold owned by this operation. No other family record changes.
    perform public.end_family_card_operation(p_id);
  end if;
  return true;
end $$;

create function public.admin_open_plan_cancels(p_parent uuid)
returns table(id uuid,child_name text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select o.id,c.first_name,o.created_at from public.plan_control_operations o
  join public.children c on c.id=o.child_id and c.parent_id=o.parent_id
  where public.is_admin() and o.parent_id=p_parent and o.kind='cancel' and o.state='open'
  order by o.created_at,o.id;
$$;

revoke all on function public.due_plan_cancel_alerts(timestamptz,integer),public.claim_plan_cancel_alert(uuid),
  public.note_plan_cancel_alert(uuid,text),public.close_plan_cancel(uuid,uuid,text),public.admin_open_plan_cancels(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.due_plan_cancel_alerts(timestamptz,integer),public.claim_plan_cancel_alert(uuid),
  public.note_plan_cancel_alert(uuid,text),public.close_plan_cancel(uuid,uuid,text) to service_role;
grant execute on function public.admin_open_plan_cancels(uuid) to authenticated;
