-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_child_profiles, 2026-10-29.
-- The child's profile (#303, spec #295): one current, versioned profile per child, built by code from the child's
-- latest assessment profile (public.learner_profiles) plus every learning event of the child (public.learning_events)
-- (src/lib/child-profile.ts). The workbook planner, the generator and Maya read it on the server.
-- Only the server writes, with the secret key (service_role skips row-level security). Admins read. Parents read
-- nothing, not even their own child's row: it holds the full test facts and the events' evidence, which stay admin-only.
-- A family deletion removes the row through the foreign keys (on delete cascade from the parent and the child), and a
-- test deletion removes the profile built on that test (on delete cascade from the test); the next rebuild builds it
-- again from what is left. The family write fence covers new and changed rows.
-- Additive: one new table that the code on main does not read or write.
--
-- revision: 1 for the first build, one more for each build after it. The server stores a build only while the row
--   holds the revision it read before it built (compare and set), so a build from older inputs never replaces a newer
--   one. schema_version: the profile JSON's schemaVersion (CHILD_PROFILE_SCHEMA_VERSION), beside it. assessment_id: the
--   test of the assessment profile the build started from; null when the child has none. built_at: when the stored
--   build was made.
create table public.child_profiles (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  created_at timestamptz not null default now(),
  built_at timestamptz not null default now(),
  revision integer not null check (revision >= 1),
  assessment_id uuid,
  schema_version smallint not null check (schema_version >= 1),
  profile jsonb not null check (
    jsonb_typeof(profile) = 'object'
    and jsonb_typeof(profile->'schemaVersion') = 'number'
    and (profile->>'schemaVersion')::smallint = schema_version
    and pg_column_size(profile) < 1000000
  ),
  foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  foreign key (assessment_id, child_id) references public.assessments (id, child_id) on delete cascade
);
create index child_profiles_parent_idx on public.child_profiles (parent_id);
create index child_profiles_assessment_idx on public.child_profiles (assessment_id) where assessment_id is not null;

alter table public.child_profiles enable row level security;
revoke all on table public.child_profiles from anon, authenticated, service_role;
grant select, insert, update on table public.child_profiles to service_role;
grant select on table public.child_profiles to authenticated;
create policy "Admins read child profiles" on public.child_profiles
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.child_profiles
  for each row execute function public.fence_family_write();
