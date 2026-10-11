-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_assessment_help, 2026-10-11.
-- Help flags (#71, D-083). Additive: the code on main does not read or write this column, and it is nullable, so the
-- code keeps working before and after this change.
-- help: the child's answer to the last question, "Did anyone help?" ('yes', 'a-little' or 'no'). Null when the test
--   was finished without it (tests from before #71). The finish route writes it with the placement, from the server,
--   with the secret key. The flags it and the answer times raise live in placement.flags (the admin area, #77).
-- No grant to authenticated: the parent's report shows only the help warning, which is stored in the report model.
alter table public.assessments
  add column help text check (help in ('yes', 'a-little', 'no'));
