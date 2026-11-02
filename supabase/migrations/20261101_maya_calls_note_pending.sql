-- The parent's call notes (#331, review R403-3): a call whose note is not written yet keeps the note's inputs here (the
-- question package and the call's learning event as code built it at the end), so a retried "end" of the call, or the
-- end of a later call of the same child, writes the note from durable inputs (src/lib/maya-call.ts). Cleared once the
-- note is written or refused for good (a test call or a test family). Only an ended call has it. Admins read it with
-- the rest of the call; parents never read public.maya_calls.
-- Additive: one nullable column and one partial index that the code on main does not use.
alter table public.maya_calls add column note_pending jsonb;
alter table public.maya_calls add constraint maya_calls_note_pending check (
  note_pending is null or (status = 'ended' and jsonb_typeof(note_pending) = 'object' and pg_column_size(note_pending) < 2000000)
);
create index maya_calls_note_pending_idx on public.maya_calls (child_id, ended_at) where note_pending is not null;
