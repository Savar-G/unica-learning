-- Maya chat, one family at a time (#530, D-241). The families an admin opened chat for. A family that is not on this
-- list gets no chat, even with MAYA_CHAT_ENABLED on and a running plan (src/lib/maya-chat-server.ts). Test families
-- keep chat without the list, as before.
--
-- One row may be the rehearsal family: a test family that still receives the parent notes and the weekly recap, which
-- test families otherwise never get. So the first note and recap in production go to the team, not to a real family.
-- At most one row is the rehearsal (unique index below). The code marks a rehearsal only for a test family.
--
-- Only admins read and change the list, with their own session. The server reads it with the secret key and never
-- writes it. Parents read nothing. A family's deletion removes its row (on delete cascade from public.parents), and
-- the family write fence refuses a new row while a deletion is pending.
--
-- Additive: one new table, and the note trigger now lets the rehearsal family's notes through. Live code on main does
-- not read the table; with the table empty the trigger behaves exactly as before.
create table public.maya_chat_families (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid not null default auth.uid(),
  rehearsal boolean not null default false
);
create unique index maya_chat_families_one_rehearsal on public.maya_chat_families (rehearsal) where rehearsal;

alter table public.maya_chat_families enable row level security;
revoke all on table public.maya_chat_families from anon, authenticated, service_role;
grant select on table public.maya_chat_families to service_role;
grant select, insert, update, delete on table public.maya_chat_families to authenticated;
create policy "Admins read chat families" on public.maya_chat_families
  for select to authenticated using ((select public.is_admin()));
create policy "Admins add chat families" on public.maya_chat_families
  for insert to authenticated with check ((select public.is_admin()) and added_by = (select auth.uid()));
create policy "Admins change chat families" on public.maya_chat_families
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins remove chat families" on public.maya_chat_families
  for delete to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_chat_families
  for each row execute function public.fence_family_write();

-- Same note validation as 20261102171510_desk_maya_chat.sql. A test family's note is refused unless the family is the
-- rehearsal family.
create or replace function public.maya_call_note_family_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_call record;
begin
  select c.kind,c.status,c.parent_id,c.child_id into v_call from public.maya_calls c where c.id=new.call_id;
  if not found then raise exception 'maya_call_note_no_call' using errcode='55000'; end if;
  if v_call.kind not in ('family','chat') then raise exception 'maya_call_note_test_call' using errcode='55000'; end if;
  if (v_call.parent_id,v_call.child_id) is distinct from (new.parent_id,new.child_id) then raise exception 'maya_call_note_family_mismatch' using errcode='55000'; end if;
  if v_call.status <> 'ended' then raise exception 'maya_call_note_not_ended' using errcode='55000'; end if;
  if exists(select 1 from public.test_accounts t where t.parent_id=new.parent_id)
    and not exists(select 1 from public.maya_chat_families r where r.parent_id=new.parent_id and r.rehearsal) then
    raise exception 'maya_call_note_test_family' using errcode='55000';
  end if;
  return new;
end $$;
