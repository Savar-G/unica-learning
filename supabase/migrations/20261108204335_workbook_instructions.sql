-- Book instructions (2026-11-08): what an admin sets for a child's next workbooks after a results call with the family
-- (start level, teach more, teach less, add review, difficulty), one row per child, as jsonb in the shape of
-- WorkbookInstructions (src/lib/workbook-instructions.ts, schema_version 1). Every "Prepare next workbook" run reads the
-- row on its first job call and keeps the exact set in its plan (public.workbook_run_frames), so a later change never
-- reaches a run already planned. The row stays until an admin changes or clears it (clearing deletes it).
--
-- Only the server writes, with the secret key, after it checks the admin's session (/api/admin/children/<id>/
-- workbook-instructions). Admins read. Parents and anon read nothing: no grant, and no policy for them.
-- A family deletion and a child deletion remove the row through the foreign keys (on delete cascade from the parent and
-- the child); there are no files. The family write fence and the child deletion fence cover new rows and updates.
-- Additive: one new table that the code on main does not use.
create table public.workbook_instructions (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  instructions jsonb not null check (jsonb_typeof(instructions) = 'object' and pg_column_size(instructions) < 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text check (updated_by_email is null or char_length(updated_by_email) <= 320),
  constraint workbook_instructions_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_instructions_parent_idx on public.workbook_instructions (parent_id);

alter table public.workbook_instructions enable row level security;
revoke all on table public.workbook_instructions from anon, authenticated, service_role;
grant select, insert, update, delete on table public.workbook_instructions to service_role;
grant select on table public.workbook_instructions to authenticated;
create policy "Admins read workbook instructions" on public.workbook_instructions
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.workbook_instructions
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_instructions
  for each row execute function public.fence_child_delete_write();
