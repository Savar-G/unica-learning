-- Disposable local dependencies only. The test loads production run tables,
-- functions, foreign keys, RLS, and relevant write fences from migration files.
create role anon;
create role authenticated;
create role service_role bypassrls;
create function public.is_admin() returns boolean language sql as $$ select false $$;
create table public.parents (
  id uuid primary key, deletion_requested_at timestamptz,
  time_zone text default 'America/Vancouver', postal text
);
create table public.children (
  id uuid primary key, parent_id uuid not null references public.parents(id),
  first_name text not null default 'Iris', former_names text[] not null default '{}',
  created_at timestamptz not null default now(), province text default 'BC',
  unique(id,parent_id)
);
create table public.assessments (id uuid primary key, parent_id uuid, child_id uuid);
create table public.workbooks (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.parents(id),
  child_id uuid references public.children(id), number integer, status text, shipped_at timestamptz
);
create table public.workbook_drafts (
  id uuid primary key, parent_id uuid references public.parents(id), child_id uuid references public.children(id)
);
create table public.child_deletions (child_id uuid primary key, parent_id uuid);
create table public.card_setups (
  id uuid primary key, parent_id uuid references public.parents(id), child_id uuid references public.children(id)
);
create table public.plan_starts (card_setup_id uuid, generation integer, primary key(card_setup_id,generation));

-- The controller holds this advisory lock until both concurrent RPCs reach
-- their required row locks. This trigger only pauses the resume test session.
create function public.fixture_resume_barrier() returns trigger language plpgsql as $$
begin
  if current_setting('fixture.resume_barrier',true) = 'on' then
    perform pg_advisory_xact_lock(612,1);
  end if;
  return new;
end $$;
