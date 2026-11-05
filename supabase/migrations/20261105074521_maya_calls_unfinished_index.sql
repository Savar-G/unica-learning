-- The sweep of abandoned Maya calls (#528, src/lib/maya-call-sweep.ts) also finishes ended calls with a step missing:
-- the learning event (the call keeps its saved state), the profile rebuild, or the parent note. A partial index keeps
-- that read small however many finished calls the table holds.
-- Additive: one new index, no data change.
create index if not exists maya_calls_unfinished_idx on public.maya_calls (ended_at, id)
  where status = 'ended' and (live is not null or note_pending is not null or (learning_event_id is not null and profile_rebuilt_at is null));
