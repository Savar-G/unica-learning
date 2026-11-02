-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_attempts_panels, 2026-11-01.
-- #312 round 3 (after #380): the generator now asks the AI for each panel's worked example ("e1", "e2": the k-th
-- layout slot) beside the question slots ("1.2"), and the job counts their AI attempts too, so a retry or a resume never
-- gives a worked example a third attempt either. The slot check takes both forms. Additive: a wider check.
alter table public.workbook_run_attempts drop constraint workbook_run_attempts_slot_check;
alter table public.workbook_run_attempts add constraint workbook_run_attempts_slot_check
  check (slot ~ '^([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$');
