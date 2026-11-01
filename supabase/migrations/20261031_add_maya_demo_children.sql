-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_maya_demo_children, 2026-10-31 (Management API,
-- registry 20261031122636).
-- The demo children of Maya's admin test calls (#323): one row per child that `npm run maya:demo-child`
-- (src/lib/maya-demo-child.ts) made in a test family. It is the script's creation marker: the script renames or reuses
-- only a child with a row here, never a child it finds by name and shape alone (review round 2 of PR #385), so a test
-- family's own children are never changed.
-- Only the server writes, with the secret key (service_role skips row-level security). Admins read. Parents read
-- nothing. A family deletion removes the rows through the foreign keys (on delete cascade from the parent and the
-- child); there are no files. The family write fence covers new rows.
-- Additive: one new table. The insert at the end marks the one demo child the script made before this table existed
-- (child 6fb4cfc4-1342-45e7-92a0-97e81250483c in the workbook-samples test family, made on 2026-10-31); it does nothing
-- where that child does not exist.
create table public.maya_demo_children (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  created_at timestamptz not null default now(),
  made_by text not null default 'maya-demo-child' check (made_by = 'maya-demo-child'),
  constraint maya_demo_children_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create unique index maya_demo_children_parent_idx on public.maya_demo_children (parent_id);

alter table public.maya_demo_children enable row level security;
revoke all on table public.maya_demo_children from anon, authenticated, service_role;
grant select, insert on table public.maya_demo_children to service_role;
grant select on table public.maya_demo_children to authenticated;
create policy "Admins read Maya demo children" on public.maya_demo_children
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_demo_children
  for each row execute function public.fence_family_write();

insert into public.maya_demo_children (child_id, parent_id)
select c.id, c.parent_id from public.children c
join public.test_accounts t on t.parent_id = c.parent_id
where c.id = '6fb4cfc4-1342-45e7-92a0-97e81250483c';
