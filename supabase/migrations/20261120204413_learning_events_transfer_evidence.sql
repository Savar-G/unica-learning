-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration learning_events_transfer_evidence, 2026-11-20
-- (Management API, registry 20261120204436).
-- #1144 follow-up to 20261120185003_learning_events_transfer_questions: a related question's row must name its call.
-- learning_events_transfer_check compares evidence_kind with 'call', which is NULL (so accepted) when the row has no
-- evidence at all. This check is false, not NULL, for such a row: a transfer row needs evidence_kind 'call' and an
-- evidence_id.
-- Additive: one new check. Before it was applied, the live table had no transfer row (0 of 230 rows), so every stored
-- row passes it.
alter table public.learning_events add constraint learning_events_transfer_evidence_check check (
  question_source <> 'transfer' or (evidence_kind is not null and evidence_id is not null and evidence_kind = 'call')
);
