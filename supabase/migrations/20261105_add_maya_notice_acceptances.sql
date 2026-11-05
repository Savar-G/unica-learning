-- The parent notice before a child's first chat or call with Maya (#529). One row per family and notice version: who
-- agreed, when, and to which version. A later version needs a new row, so an old agreement does not cover new text.
-- Only the server writes (service_role, insert only, the first row stays); a parent reads their own rows, admins read
-- all. The row goes with the family (on delete cascade from public.parents), and the family write fence stops a new
-- row once deletion is requested. Removing a row for a parent who withdraws is an operator step.
-- Additive: a new table that the code on main does not use.
create table public.maya_notice_acceptances (
  parent_id uuid not null references public.parents (id) on delete cascade,
  notice_version text not null check (char_length(notice_version) between 1 and 40),
  accepted_by uuid not null,
  accepted_at timestamptz not null default now(),
  primary key (parent_id, notice_version)
);

alter table public.maya_notice_acceptances enable row level security;
revoke all on table public.maya_notice_acceptances from public, anon, authenticated, service_role;
grant select on table public.maya_notice_acceptances to authenticated;
grant select, insert on table public.maya_notice_acceptances to service_role;

create policy "Parents read their own Maya notice" on public.maya_notice_acceptances
  for select to authenticated using (parent_id = (select auth.uid()));
create policy "Admins read Maya notices" on public.maya_notice_acceptances
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert on public.maya_notice_acceptances
  for each row execute function public.fence_family_write();
