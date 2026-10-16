-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_learning_questions, 2026-10-16.
-- Three more questions on the "Tell us how {child} learns" card (#195, D-107, updates D-100): how the child feels about
-- math, the parent's main goal and the time each week. Additive: three nullable columns; null is no answer. The ids
-- must match src/lib/learning-style.ts. The free text keeps its column (learning_note) under the new question
-- "What does {child} find hard in math?".
alter table public.children
  add column math_feeling text check (math_feeling in ('enjoys', 'okay', 'avoids')),
  add column learning_goal text check (learning_goal in ('catch_up', 'keep_up', 'get_ahead')),
  add column weekly_time text check (weekly_time in ('under_1h', '1_to_2h', '2_to_3h', 'over_3h'));

-- A signed-in parent writes these three columns too, and only on their own children: the policy "Parents update how
-- their own children learn" (20261012_add_learning_style.sql) already limits updates to the parent's own rows. Every
-- other column stays server-only. Reads are unchanged: "Parents read their own children" covers every column.
grant update (math_feeling, learning_goal, weekly_time) on table public.children to authenticated;
