-- Family voice calls with Maya (the child's call from the family desk, src/lib/maya-voice-desk-server.ts).
-- A real child speaks to Maya on a shipped workbook question. The row is kind 'family' (the kind the parent note, the
-- weekly email and the recap already accept) with mode 'voice'. Maya's voice worker runs the call like an admin test call.
--
-- Adds 'family' to the kind check, and one check for the new kind: a family call is a voice call on a workbook question
-- and never counts minutes (the minutes ledger is unused; the weekly voice time is read from connected_seconds).
-- The other triggers and functions on public.maya_calls were read for kind lists: maya_call_test_family refuses only
-- 'admin_test' (a family call may belong to any family), the note trigger, the weekly email and the recap already accept
-- 'family', and the chat functions name kind 'chat' only. The generated column channel is 'voice' for a family call.
-- Additive: one check is replaced and one is added in one transaction; no row changes (no 'family' row exists yet).
begin;
alter table public.maya_calls drop constraint maya_calls_kind_check;
alter table public.maya_calls add constraint maya_calls_kind_check check (kind in ('admin_test', 'chat', 'family'));
alter table public.maya_calls add constraint maya_family_voice check (kind <> 'family' or (mode = 'voice' and question_source = 'workbook' and not counts_minutes));
commit;
