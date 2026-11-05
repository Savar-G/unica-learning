-- The child's ink in a chat with Maya (#534): the child's desk sends its copy of the chat's board (Maya's batches and
-- the child's strokes, src/lib/board-history.ts), and the server keeps it beside the call. The admin call page merges
-- the strokes with Maya's recorded batches for the replay (src/lib/maya-call.ts, withChildInk).
--
-- Kept in its own column, written without raising the call's revision, so the chat's next message still goes in at
-- the revision the desk holds. Only the server writes it (secret key); admins read it with the call. Deleted with the
-- call and the family, as the rest of the row.
--
-- Additive: one new nullable column. The code on main does not read it.
alter table public.maya_calls
  add column if not exists child_ink jsonb
  check (child_ink is null or (jsonb_typeof(child_ink) = 'object' and pg_column_size(child_ink) < 2000000));

comment on column public.maya_calls.child_ink is
  'The child''s desk copy of a text call''s board (#534): its strokes are the child''s ink. Written by the server without raising the revision.';
