-- The sweep of abandoned Maya calls keeps its place between runs (#586, src/lib/maya-call-sweep.ts). One row per kind of
-- call it reads ('live': abandoned live calls by made time; 'unfinished': ended calls with a step missing, by end time):
-- the time and call id the next run starts after. No row, or a row with no time, means the oldest call. Without it,
-- each run started again at the oldest call, so calls that always fail could keep a later call live forever.
--
-- Only the server reads and writes it, with the secret key; parents and admins read nothing (it holds a time and a call
-- id, no family data). The call id has no foreign key: it is only a place in the list, and a deleted call leaves a place
-- the next run still starts after.
--
-- Additive: one new table.
create table public.maya_call_sweep_cursors (
  kind text primary key check (kind in ('live', 'unfinished')),
  at timestamptz,
  call_id uuid,
  updated_at timestamptz not null default now(),
  constraint maya_call_sweep_cursors_place check ((at is null) = (call_id is null))
);

alter table public.maya_call_sweep_cursors enable row level security;
revoke all on table public.maya_call_sweep_cursors from anon, authenticated, service_role;
grant select, insert, update on table public.maya_call_sweep_cursors to service_role;
