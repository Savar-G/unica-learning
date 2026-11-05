-- The sweep of abandoned Maya calls ends one pass over a list at the newest call there was when the pass began (#586
-- review, src/lib/maya-call-sweep.ts). Without it, a run that always left calls for the next one walked forward past
-- new calls and never went back to the oldest, so a call that failed once was never tried again.
--
-- until_at: the newest time the current pass covers. A stored place has all three of at, call_id and until_at, or none.
-- Additive: one new nullable column and one check (the table has no rows yet).
alter table public.maya_call_sweep_cursors add column until_at timestamptz;
alter table public.maya_call_sweep_cursors
  add constraint maya_call_sweep_cursors_until check ((at is null) = (until_at is null));
