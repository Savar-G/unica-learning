-- Parent goals (D-323, 2026-11-11): right after signup, before the child's first test, the parent answers three
-- select-one questions about the child: the main goal, how the child feels about math, and the math help the child
-- gets now. Savar chose one set of answers: the goal and the feeling go into the columns the report's learning card
-- used (#195), and that card no longer asks them. The planner's rules stay: catch_up, get_ahead and avoids keep their
-- meaning; the new values change no book.
--
-- 1. public.child_goals (migration child_goals, applied earlier the same day) is dropped: it never held a row and no
--    deployed code reads it.
-- 2. Wider checks, old values kept: learning_goal adds confident, next_grade and not_sure (keep_up stays for older
--    answers); math_feeling adds finds_hard (avoids is now "Gets upset or avoids it").
-- 3. New nullable column math_help (null is no answer). Only the server writes it, with the secret key
--    (/api/account/children/<id>/goals); "Parents read their own children" covers it for reads. Family deletion and
--    child deletion remove it with the row.
-- The ids must match src/lib/learning-style.ts (src/lib/state-lists.test.ts proves it).
-- Additive for the code on main: wider checks and a nullable column it does not read.
drop table if exists public.child_goals;

alter table public.children drop constraint children_learning_goal_check;
alter table public.children add constraint children_learning_goal_check
  check (learning_goal in ('catch_up', 'keep_up', 'get_ahead', 'confident', 'next_grade', 'not_sure'));
alter table public.children drop constraint children_math_feeling_check;
alter table public.children add constraint children_math_feeling_check
  check (math_feeling in ('enjoys', 'okay', 'avoids', 'finds_hard'));
alter table public.children add column math_help text check (math_help in ('school_only', 'parent', 'tutor', 'app'));
