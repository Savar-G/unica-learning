-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_workbook_drafts, 2026-10-31.
-- Generated workbook drafts (#311, spec #296): one row per generator run, holding the whole draft the generator made
-- (src/lib/workbook-generator.ts, GeneratedWorkbook) as jsonb: every page in book order with its number, type, day and QR
-- token, the fit check's verdict, and every question with its package and the checker's verdict (checked, not checked by
-- code, or failed with the reason). A draft can hold failed questions, so it is not a workbook: the admin review (#312)
-- renders and approves it into public.workbooks. The store is src/lib/workbook-draft-store.ts.
-- Only the server writes, with the secret key (service_role skips row-level security), one insert per run; a draft is
-- never changed in place (a new run is a new row). Admins read. Parents read nothing: a draft is team work.
-- A family deletion removes the rows through the foreign keys (on delete cascade from the parent and the child); there
-- are no files. The family write fence covers new rows.
-- Additive: one new table that the code on main does not read or write.
--
-- schema_version: the draft JSON's shape version (GENERATED_DRAFT_VERSION). The counts beside the JSON let a list show
-- the check results without reading every draft.
create table public.workbook_drafts (
  id uuid primary key,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  number int not null check (number between 1 and 1000),
  levels smallint[] not null check (
    cardinality(levels) between 1 and 30 and array_position(levels, null) is null and 1 <= all(levels) and 30 >= all(levels)
  ),
  model text not null check (char_length(model) between 1 and 200),
  profile_build text check (char_length(profile_build) between 1 and 100),
  schema_version smallint not null check (schema_version >= 1),
  draft jsonb not null check (
    jsonb_typeof(draft) = 'object' and draft->>'id' = id::text and draft->>'childId' = child_id::text
    and pg_column_size(draft) < 5000000
  ),
  pages int not null check (pages between 1 and 1000),
  questions int not null check (questions >= 0),
  failed int not null check (failed >= 0),
  not_checked int not null check (not_checked >= 0),
  failed_pages int not null check (failed_pages >= 0),
  constraint workbook_drafts_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_drafts_parent_idx on public.workbook_drafts (parent_id);
create index workbook_drafts_child_idx on public.workbook_drafts (child_id, number);

alter table public.workbook_drafts enable row level security;
revoke all on table public.workbook_drafts from anon, authenticated, service_role;
grant select, insert on table public.workbook_drafts to service_role;
grant select on table public.workbook_drafts to authenticated;
create policy "Admins read workbook drafts" on public.workbook_drafts
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.workbook_drafts
  for each row execute function public.fence_family_write();
