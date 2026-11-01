-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_maya_calls, 2026-10-31 (Management API, registry
-- 20261031104419).
-- Maya's calls (#323, spec #297): one row per call with Maya. Today only admin test calls exist: in admin, a team member
-- picks a supported assessment question of a test family's child (D-099, public.test_accounts), types the child's turns
-- and sees Maya's replies (src/lib/maya-call.ts). The row holds the call, its transcript and board commands (the trace
-- v1 of src/lib/maya-trace.ts), the board history (src/lib/board-history.ts, version 1), the outcome and the versions
-- (model, prompt, lines, session, proposal, and the question package hash). The later voice calls (#326), the minutes
-- ledger and the safety alerts add their values to the nullable columns kept for them here; none is built yet.
--
-- Only the server writes, with the secret key (service_role skips row-level security). Admins read. Parents read
-- nothing yet: the parent's notes and transcripts (#333) add their own read. A family deletion removes the rows through
-- the foreign keys (on delete cascade from the parent, the child and the test); there are no files. The family write
-- fence covers new rows and changes.
--
-- kind: 'admin_test' only. A trigger refuses an admin test call for a family that is not marked as a test family, so a
--   test call never touches a real family (#323); a later kind for real calls comes with its own migration.
-- status: 'live' while the call runs, 'ended' once it has an outcome. `live` holds what the server needs to go on with
--   the call on the next request (the session, its turns and board batches), and is cleared when the call ends. A
--   request changes a live call only at the `revision` it read, so two requests never both write.
-- connected_seconds, counts_minutes, voice, speech_to_text: for voice calls and the minutes ledger; an admin test call
--   never counts against a child's minutes (counts_minutes stays false).
-- Additive: one new table that the code on main does not read or write.
create table public.maya_calls (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  record_version smallint not null default 1 check (record_version >= 1),
  kind text not null check (kind in ('admin_test')),
  mode text not null default 'text' check (mode in ('text', 'voice')),
  started_by uuid,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  question_source text not null check (question_source in ('workbook', 'assessment')),
  assessment_id uuid,
  assessment_question_id text check (char_length(assessment_question_id) between 1 and 40),
  workbook_id uuid,
  workbook_page integer check (workbook_page between 1 and 9999),
  workbook_question integer check (workbook_question between 1 and 9999),
  package_id text not null check (char_length(package_id) between 1 and 200),
  package_hash text not null check (package_hash ~ '^sha256:[0-9a-f]{64}$'),
  question_text text check (char_length(question_text) <= 2000),
  status text not null default 'live' check (status in ('live', 'ended')),
  revision integer not null default 0 check (revision >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  model text not null check (char_length(model) between 1 and 200),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  versions jsonb not null check (jsonb_typeof(versions) = 'object'),
  outcome_reason text check (outcome_reason in ('solved', 'child_stopped', 'time_limit', 'no_response', 'technical_issue', 'content_issue', 'safety')),
  assistance text check (assistance in ('independent', 'hint', 'worked_example', 'guided', 'answer_given')),
  paper_status text check (paper_status in ('child_confirmed', 'declined', 'unknown')),
  understanding text check (understanding in ('evidence_observed', 'uncertain')),
  highest_hint smallint check (highest_hint between 0 and 4),
  call_seconds integer check (call_seconds between 0 and 86400),
  maya_turns integer check (maya_turns >= 0),
  child_turns integer check (child_turns >= 0),
  fallbacks integer check (fallbacks >= 0),
  mishearing_confirmations integer check (mishearing_confirmations >= 0),
  mishearing_corrections integer check (mishearing_corrections >= 0),
  safety_flag boolean not null default false,
  safety_severity text check (safety_severity in ('concern', 'immediate')),
  connected_seconds integer check (connected_seconds between 0 and 86400),
  counts_minutes boolean not null default false,
  voice text check (char_length(voice) between 1 and 200),
  speech_to_text text check (char_length(speech_to_text) between 1 and 200),
  live jsonb check (live is null or (jsonb_typeof(live) = 'object' and pg_column_size(live) < 2000000)),
  trace jsonb check (trace is null or (jsonb_typeof(trace) = 'object' and trace->>'callId' = id::text and pg_column_size(trace) < 2000000)),
  board_history jsonb check (board_history is null or (jsonb_typeof(board_history) = 'object' and pg_column_size(board_history) < 2000000)),
  learning_event_id uuid references public.learning_events (id) on delete set null,
  profile_rebuilt_at timestamptz,
  constraint maya_calls_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint maya_calls_assessment_fkey foreign key (assessment_id, child_id) references public.assessments (id, child_id) on delete cascade,
  check (
    (question_source = 'workbook' and workbook_id is not null and workbook_page is not null and workbook_question is not null
      and assessment_id is null and assessment_question_id is null)
    or (question_source = 'assessment' and assessment_id is not null and assessment_question_id is not null
      and workbook_id is null and workbook_page is null and workbook_question is null)
  ),
  check (kind <> 'admin_test' or counts_minutes = false),
  check ((status = 'live') = (live is not null)), -- replaced by maya_calls_live_until_event
  check (status = 'live' or (ended_at is not null and outcome_reason is not null and trace is not null))
);
create index maya_calls_created_idx on public.maya_calls (created_at desc, id);
create index maya_calls_parent_idx on public.maya_calls (parent_id);
create index maya_calls_child_idx on public.maya_calls (child_id, created_at desc);
create index maya_calls_assessment_idx on public.maya_calls (assessment_id) where assessment_id is not null;
create index maya_calls_event_idx on public.maya_calls (learning_event_id) where learning_event_id is not null;

alter table public.maya_calls enable row level security;
revoke all on table public.maya_calls from anon, authenticated, service_role;
grant select, insert, update on table public.maya_calls to service_role;
grant select on table public.maya_calls to authenticated;
create policy "Admins read Maya calls" on public.maya_calls
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_calls
  for each row execute function public.fence_family_write();

-- An admin test call only ever names a test family: a real family is never touched by one.
create function public.maya_call_test_family() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'admin_test' and not exists (select 1 from public.test_accounts t where t.parent_id = new.parent_id) then
    raise exception 'maya_call_not_test_family' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (new.kind, new.parent_id, new.child_id) is distinct from (old.kind, old.parent_id, old.child_id) then
    raise exception 'maya_call_family_fixed' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.maya_call_test_family() from public, anon, authenticated;
create trigger maya_call_test_family before insert or update on public.maya_calls
  for each row execute function public.maya_call_test_family();
