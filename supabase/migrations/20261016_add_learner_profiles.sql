-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_learner_profiles, 2026-10-16 (SQL editor,
-- registry 20261016214625).
-- The learner profile (#196, spec #181, D-115): one structured, versioned JSON profile per finished test, built by the
-- report job after finish (src/lib/learner-profile.ts) and built again after an extra round (#190) or when the parent
-- answers the learning card for the child's latest test. The facts are written by code (src/lib/assessment/profile.ts);
-- #197 adds AI parts inside the same JSON, each labelled with its model id.
-- The server writes with the secret key (service_role skips row-level security); admins read; parents get nothing, not
-- even their own rows: the profile holds the full error list and the test behaviour, which stay admin-only.
-- A family deletion removes the rows with the test and the family (cascade), and the family write fence covers new rows.
-- Additive: a new table that the code on main does not read or write.
--
-- schema_version: the profile JSON's schemaVersion (PROFILE_SCHEMA_VERSION), kept beside it so a reader can select
--   by version. built_at: when the profile in the row was built (the first build, or the latest rebuild).
create table public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  built_at timestamptz not null default now(),
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  schema_version smallint not null check (schema_version >= 1),
  profile jsonb not null check (
    jsonb_typeof(profile) = 'object'
    and jsonb_typeof(profile->'schemaVersion') = 'number'
    and (profile->>'schemaVersion')::smallint = schema_version
    and pg_column_size(profile) < 500000
  )
);
create index learner_profiles_child_idx on public.learner_profiles (child_id);
create index learner_profiles_parent_idx on public.learner_profiles (parent_id);

alter table public.learner_profiles enable row level security;
revoke all on table public.learner_profiles from anon, authenticated;
grant select on table public.learner_profiles to authenticated;
create policy "Admins read learner profiles" on public.learner_profiles
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.learner_profiles
  for each row execute function public.fence_family_write();
