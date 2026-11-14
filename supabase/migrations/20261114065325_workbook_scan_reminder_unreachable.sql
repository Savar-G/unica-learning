-- #962: a family whose reminder cannot be sent (no usable email address) was picked again every run and, at the front
-- of the due list, could hold up every later family. The run now notes it here, keyed to the address it had, and the
-- reminder due list leaves it out until the address changes. Nothing is claimed or used: its episode stays as it was.
create table public.workbook_scan_reminder_unreachable (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{32}$'),
  noted_at timestamptz not null default clock_timestamp()
);
alter table public.workbook_scan_reminder_unreachable enable row level security;
revoke all on table public.workbook_scan_reminder_unreachable from public, anon, authenticated;
grant select on table public.workbook_scan_reminder_unreachable to service_role;
create trigger fence_family_write before insert or update on public.workbook_scan_reminder_unreachable
  for each row execute function public.fence_family_write();

-- The address as the due list compares it: trimmed and lower-cased, so a fixed address always reads as a change.
create function public._workbook_scan_reminder_email_hash(p_email text) returns text
language sql immutable set search_path = '' as $$ select md5(lower(btrim(coalesce(p_email, '')))) $$;
revoke all on function public._workbook_scan_reminder_email_hash(text) from public, anon, authenticated;

-- Service only. Notes the parent's current address as unreachable. A family being deleted is left alone (the due list
-- already leaves it out). Answers 'noted' or 'gone'.
create function public.note_workbook_scan_reminder_unreachable(p_parent uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_deleting timestamptz;
begin
  if p_parent is null then raise exception 'invalid_scan_reminder_parent'; end if;
  select email, deletion_requested_at into v_email, v_deleting from public.parents where id = p_parent;
  if not found or v_deleting is not null then return 'gone'; end if;
  insert into public.workbook_scan_reminder_unreachable (parent_id, email_hash, noted_at)
  values (p_parent, public._workbook_scan_reminder_email_hash(v_email), clock_timestamp())
  on conflict (parent_id) do update set email_hash = excluded.email_hash, noted_at = excluded.noted_at;
  return 'noted';
end $$;
revoke all on function public.note_workbook_scan_reminder_unreachable(uuid) from public, anon, authenticated;
grant execute on function public.note_workbook_scan_reminder_unreachable(uuid) to service_role;

-- The live function, with one added condition for 'reminder-due': no unreachable note for the parent's current address.
create or replace function public._workbook_scan_inactivity_recovery(p_book uuid, p_kind text, p_at timestamp with time zone)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare ident jsonb; e public.workbook_scan_inactivity_episodes; stale boolean;
begin
  ident:=public._workbook_scan_inactivity_identity(p_book,p_at);
  if ident is null then return false; end if;
  select * into e from public.workbook_scan_inactivity_episodes where workbook_id=p_book and activity_key=(ident->>'activity_key')::uuid;
  if e.consumed_at is not null or e.dispatch_count>=3 then return false; end if;
  stale:=e.id is null or (e.delivery_audit_id,e.anchor_at,e.clock_context,e.printed_revision) is distinct from
    ((ident->>'delivery_audit_id')::bigint,(ident->>'anchor_at')::timestamptz,ident->'clock_context',ident->>'printed_revision');
  if p_kind='inactivity' then return stale; end if;
  return not stale and e.due_at<=p_at
    and public._workbook_scan_reminder_program((ident->>'parent_id')::uuid,(ident->>'child_id')::uuid,p_at)
    and not exists(select 1 from public.email_log where parent_id=e.parent_id and kind='unsubscribe')
    and not exists(select 1 from public.workbook_scan_reminder_links l join public.workbook_scan_reminder_messages m on m.id=l.message_id
      where l.episode_id=e.id and not l.released and (m.state<>'refused' or m.attempt_count>=3))
    and not exists(select 1 from public.workbook_scan_reminder_unreachable u join public.parents pa on pa.id=u.parent_id
      where u.parent_id=e.parent_id and u.email_hash=public._workbook_scan_reminder_email_hash(pa.email));
end $function$;
