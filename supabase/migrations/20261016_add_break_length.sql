-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_break_length, 2026-10-16.
-- The halfway break's length (#185, after add_test_context). Additive: one nullable column and checks on it. The code
-- on main does not read or write it, so it keeps working before and after this change.
-- assessments.break_ms: the break's length as the browser measured it, from the break screen showing to the press. The
--   screen sends the end at once with it, so a slow "shown" save or a slow network never makes the break longer. When
--   the end reaches the server first, the server saves the start as the end time minus this length. Written once, with
--   the end. Null: no end recorded.
-- No grant to authenticated: parents never read it; admins read it through public.admin_assessments() (select *).
alter table public.assessments
  add column break_ms integer check (break_ms >= 0),
  add constraint assessments_break_ms_end_check check (break_ms is null or break_ended_at is not null);
