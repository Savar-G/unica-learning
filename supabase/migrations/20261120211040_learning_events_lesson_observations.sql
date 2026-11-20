-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration learning_events_lesson_observations, 2026-11-20
-- (Management API, registry 20261120211057).
-- #1145 (spec #1137, section 4): the child profile adapts the next lesson from durable teaching evidence. A call's
-- lesson checks parts of the child's work in code (src/lib/maya/checked-exchange.ts): the prerequisite (how many tens),
-- the misconception (swapping the digits), the exchange and each column. Until now these checks were only in the call
-- trace. observations keeps them on the call's own learning event (and on its related question's event), oldest
-- first: each an object with skill, result (correct or incorrect), assistance (independent, hinted, demonstrated or
-- uncertain) and board (true when the base-ten blocks were on the child's board). The code checks each value
-- (src/lib/learning-events.ts); the database checks the shape: a non-empty array of at most 20 objects with those four
-- keys, small, and only on a call's event.
--
-- Additive: one nullable column and one check. Every stored row has no observations and passes the check; code that
-- does not write the column works as before. Deletion needs no change: the column belongs to rows that the existing
-- foreign keys already delete with the family, the child, the test or the call question's event. The append-only
-- trigger still refuses every update.
alter table public.learning_events
  add column observations jsonb,
  add constraint learning_events_observations_check check (
    observations is null or (
      source = 'call' and case when jsonb_typeof(observations) = 'array' then
        jsonb_array_length(observations) between 1 and 20 and pg_column_size(observations) < 8000
        and not jsonb_path_exists(observations, '$[*] ? (!(@.type() == "object" && exists(@.skill) && exists(@.result) && exists(@.assistance) && exists(@.board)))')
      else false end
    )
  );
