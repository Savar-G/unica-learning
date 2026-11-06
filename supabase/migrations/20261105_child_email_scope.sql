-- #657. Child ownership belongs to the claim, before any send or delayed audit-copy write.
-- NULL means unproved legacy scope. Never infer ownership from a name, body, subject or URL.
-- No existing row is changed on application. Old unknown sends require provenance review before child deletion.
alter table public.email_log add column copy_child_ids uuid[];
alter table public.email_log add constraint email_log_copy_child_ids_valid
  check (copy_child_ids is null or (cardinality(copy_child_ids)>0 and array_position(copy_child_ids,null) is null));

-- Resolve legacy rows only from complete typed references. Missing calls are not evidence of no child.
create function public.email_copy_child_scope(l public.email_log) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
begin
  if l.copy_child_ids is not null then return l.copy_child_ids; end if;
  if l.child_id is not null then return array[l.child_id]; end if;
  if coalesce(cardinality(l.call_ids),0)=0 or exists(
    select 1 from unnest(l.call_ids) refs(id) where not exists(
      select 1 from public.maya_calls c where c.id=refs.id and c.parent_id=l.parent_id and c.child_id is not null)) then
    return null;
  end if;
  return array(select distinct c.child_id from public.maya_calls c where c.id=any(l.call_ids) and c.parent_id=l.parent_id order by c.child_id);
end $$;

create function public.assert_child_email_scopes(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.email_log l where l.parent_id=p and l.child_id is null
    and l.status is not null and not l.copy_redacted and public.email_copy_child_scope(l) is null) then
    raise exception 'email_scope_unknown' using errcode='55000';
  end if;
end $$;

-- The existing family fence and this trigger take the same shared parent row lock as deletion.
-- All send kinds use this guard, including legacy daily Maya writers. Unsubscribe markers have no body.
create function public.capture_email_copy_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
declare scope uuid[]; previous uuid[]; references_scope uuid[];
begin
  perform public.assert_family_writable(new.parent_id);
  if tg_op='UPDATE' then
    if new.parent_id is distinct from old.parent_id or new.child_id is distinct from old.child_id
      or new.assessment_id is distinct from old.assessment_id or new.kind is distinct from old.kind then
      raise exception 'email_scope_fixed' using errcode='55000';
    end if;
    if old.copy_redacted and not new.copy_redacted then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
    -- Delivery outcomes remain recordable after deletion. They cannot change ownership or reopen a claim.
    if new.copy_child_ids is not distinct from old.copy_child_ids and new.call_ids is not distinct from old.call_ids
      and not (new.status='claimed' and (new.status is distinct from old.status or new.attempts is distinct from old.attempts)) then
      return new;
    end if;
    if old.copy_redacted then raise exception 'child_unavailable' using errcode='55000'; end if;
    previous := public.email_copy_child_scope(old);
    -- A retry cannot assert what an old unknown attempt contained. A reviewed scope-only repair can.
    if old.status is not null and previous is null
      and (new.status is distinct from old.status or new.attempts is distinct from old.attempts) then
      raise exception 'email_scope_unknown' using errcode='55000';
    end if;
  end if;
  if new.status is null then return new; end if;
  if coalesce(cardinality(new.call_ids),0)>0 then
    if exists(select 1 from unnest(new.call_ids) refs(id) where not exists(
      select 1 from public.maya_calls c where c.id=refs.id and c.parent_id=new.parent_id and c.child_id is not null)) then
      raise exception 'email_scope_unknown' using errcode='55000';
    end if;
    references_scope := array(select distinct c.child_id from public.maya_calls c where c.id=any(new.call_ids) and c.parent_id=new.parent_id);
  end if;
  scope := array(select distinct id from unnest(coalesce(new.copy_child_ids,'{}'::uuid[]) || coalesce(previous,'{}'::uuid[])
    || coalesce(references_scope,'{}'::uuid[]) || case when new.child_id is null then '{}'::uuid[] else array[new.child_id] end) id order by id);
  if cardinality(scope)=0 or array_position(scope,null) is not null then
    raise exception 'email_scope_unknown' using errcode='55000';
  end if;
  if exists(select 1 from unnest(scope) refs(id) where not exists(
    select 1 from public.children c where c.id=refs.id and c.parent_id=new.parent_id)
    or exists(select 1 from public.child_deletions d where d.child_id=refs.id)) then
    raise exception 'child_unavailable' using errcode='55000';
  end if;
  -- Union across attempts: a refused attempt's copy can still exist while a new attempt is in flight.
  new.copy_child_ids := scope;
  return new;
end $$;
create trigger capture_email_copy_scope before insert or update on public.email_log
  for each row execute function public.capture_email_copy_scope();

create function public.redact_child_email_logs(p uuid,c uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_email_scopes(p);
  update public.email_log l set copy_redacted=true
    where l.parent_id=p and l.child_id is null and not l.copy_redacted
      and c=any(public.email_copy_child_scope(l));
end $$;
create or replace function public.mark_child_email_copies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id=new.parent_id for update;
  perform public.redact_child_email_logs(new.parent_id,new.child_id);
  return new;
end $$;

-- Guard the shared writer, not just a sender. The parent lock orders copy writes with the whole deletion transaction.
create or replace function public.fence_redacted_email_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.email_log; scope uuid[]; child uuid;
begin
  perform public.assert_family_writable(new.parent_id);
  if tg_op='UPDATE' and (new.parent_id is distinct from old.parent_id
    or new.email_log_id is distinct from old.email_log_id or new.report_id is distinct from old.report_id) then
    raise exception 'email_scope_fixed' using errcode='55000';
  end if;
  if new.email_log_id is not null then
    select * into l from public.email_log where id=new.email_log_id and parent_id=new.parent_id;
    if not found or l.copy_redacted then raise exception 'child_unavailable' using errcode='55000'; end if;
    scope := public.email_copy_child_scope(l);
  else
    child := public.child_delete_row_child('email_copies',to_jsonb(new));
    if child is not null then scope := array[child]; end if;
  end if;
  if coalesce(cardinality(scope),0)=0 then raise exception 'email_scope_unknown' using errcode='55000'; end if;
  if exists(select 1 from unnest(scope) refs(id) where not exists(
    select 1 from public.children c where c.id=refs.id and c.parent_id=new.parent_id)
    or exists(select 1 from public.child_deletions d where d.child_id=refs.id)) then
    raise exception 'child_unavailable' using errcode='55000';
  end if;
  return new;
end $$;

-- Refuse unknown legacy email scope during the initial check, before the caller stops any plan.
-- Keep all billing admission rules and fence_plan_start_write unchanged.
create or replace function public.check_child_deletion(p uuid, c uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare pending boolean;
begin
  perform 1 from public.parents where id=p and deletion_requested_at is null for update;
  if not found then return 'busy'; end if;
  if not exists(select 1 from public.children where id=c and parent_id=p) then return 'missing'; end if;
  perform public.assert_child_email_scopes(p);
  if exists(select 1 from public.family_card_operations where parent_id=p)
    or exists(select 1 from public.family_delete_holds where parent_id=p and lease_until>clock_timestamp()) then return 'busy'; end if;
  if to_regclass('public.plan_starts') is not null then
    execute 'select exists(select 1 from public.plan_starts s join public.card_setups k on k.id=s.card_setup_id where k.child_id=$1 and k.parent_id=$2 and s.state not in (''started'',''other'',''refused'',''team_ended''))' into pending using c,p;
    if pending then return 'busy'; end if;
  end if;
  if to_regclass('public.child_card_updates') is not null then
    execute 'select exists(select 1 from public.child_card_updates where child_id=$1 and parent_id=$2 and pending_plan_key is not null)' into pending using c,p;
    if pending then return 'busy'; end if;
  end if;
  return 'ready';
end $$;

create or replace function public.complete_child_deletion(p uuid,c uuid,token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_deletion_lease(p,c,token);
  -- Also recheck requests saved by the preceding deployment. No old in-flight row bypasses the scope check.
  perform public.redact_child_email_logs(p,c);
  if not public.confirm_child_copies(p,c,token) then return false; end if;
  if exists(select 1 from public.child_delete_roots(p,c) root join storage.objects o on o.bucket_id=root.bucket
    and starts_with(lower(o.name),root.prefix || '/')) then return false; end if;
  delete from public.email_copies e using public.email_log l
    where e.parent_id=p and e.email_log_id=l.id and l.parent_id=p and l.copy_redacted;
  delete from public.children where parent_id=p and id=c;
  return found;
end $$;
revoke all on function public.email_copy_child_scope(public.email_log), public.assert_child_email_scopes(uuid),
  public.capture_email_copy_scope(), public.redact_child_email_logs(uuid,uuid) from public,anon,authenticated,service_role;
