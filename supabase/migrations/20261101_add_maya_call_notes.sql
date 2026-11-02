-- The parent's call notes (#331, spec #297): one note per ended family call with Maya, written by the server after the
-- call (src/lib/maya-call-note.ts): code-written facts and sentences (the question, where the child got stuck, whether
-- they finished, how much help), at most one warm sentence from the AI that code checked, and the call's transcript as
-- the parent reads it (what the child and Maya said, and a few plain notes; no free-talk review, no board, no session).
-- Sentences hold {child} for the child's first name, so the note stores no name.
--
-- Only the server writes, with the secret key; the service role may only insert and read, so a note never changes.
-- A signed-in parent reads only their own family's notes; admins read all; anon reads nothing.
-- Test calls never get a note: a trigger refuses a note unless its call exists, has ended, is of the family call kind
-- ('family') and belongs to the same parent and child, and the family is not a test family (public.test_accounts).
-- Today public.maya_calls holds only admin test calls (kind 'admin_test'), so no note can be written yet: the voice call
-- (#326) adds the family kind to maya_calls.
--
-- A family deletion removes the rows through the foreign keys (on delete cascade from the call, the parent and the
-- child); there are no files. The family write fence covers new rows.
-- Additive: one new table and one trigger function that the code on main does not use.
create table public.maya_call_notes (
  call_id uuid primary key references public.maya_calls (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  created_at timestamptz not null default now(),
  note_version smallint not null default 1 check (note_version >= 1),
  call_ended_at timestamptz not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'object' and pg_column_size(facts) < 20000),
  sentences jsonb not null check (jsonb_typeof(sentences) = 'array' and jsonb_array_length(sentences) between 1 and 12 and pg_column_size(sentences) < 20000),
  warm text check (char_length(warm) between 1 and 160),
  writer text not null check (writer in ('ai', 'code')),
  model text check (char_length(model) between 1 and 200),
  prompt_version text check (char_length(prompt_version) between 1 and 100),
  transcript jsonb not null check (jsonb_typeof(transcript) = 'array' and pg_column_size(transcript) < 2000000),
  constraint maya_call_notes_writer check ((writer = 'ai') = (warm is not null) and (warm is null or model is not null)),
  constraint maya_call_notes_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index maya_call_notes_parent_idx on public.maya_call_notes (parent_id, call_ended_at desc);
create index maya_call_notes_child_idx on public.maya_call_notes (child_id, call_ended_at desc);

alter table public.maya_call_notes enable row level security;
revoke all on table public.maya_call_notes from anon, authenticated, service_role;
grant select, insert on table public.maya_call_notes to service_role;
grant select on table public.maya_call_notes to authenticated;
create policy "Parents read their own call notes" on public.maya_call_notes
  for select to authenticated using (parent_id = (select auth.uid()));
create policy "Admins read call notes" on public.maya_call_notes
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_call_notes
  for each row execute function public.fence_family_write();

-- A note only for an ended family call of a real family, with the call's own parent and child.
create function public.maya_call_note_family_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_call record;
begin
  select c.kind, c.status, c.parent_id, c.child_id into v_call from public.maya_calls c where c.id = new.call_id;
  if not found then
    raise exception 'maya_call_note_no_call' using errcode = '55000';
  end if;
  if v_call.kind <> 'family' then
    raise exception 'maya_call_note_test_call' using errcode = '55000';
  end if;
  if (v_call.parent_id, v_call.child_id) is distinct from (new.parent_id, new.child_id) then
    raise exception 'maya_call_note_family_mismatch' using errcode = '55000';
  end if;
  if v_call.status <> 'ended' then
    raise exception 'maya_call_note_not_ended' using errcode = '55000';
  end if;
  if exists (select 1 from public.test_accounts t where t.parent_id = new.parent_id) then
    raise exception 'maya_call_note_test_family' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.maya_call_note_family_call() from public, anon, authenticated;
create trigger maya_call_note_family_call before insert on public.maya_call_notes
  for each row execute function public.maya_call_note_family_call();
