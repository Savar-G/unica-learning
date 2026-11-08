-- Savar decided on 7 November that AI does all marking and a parent marks no question.
-- A two-ways item now keeps the code method and its frozen mastery decision from the app.
-- The old trigger overwrote both with a parent review. It now does nothing for two-ways items.
-- The trigger and the function stay in place, with the same name and grants. A later cleanup can drop them.
-- Live code still writes the parent method itself until its PR merges, so it keeps working.
-- No hosted row holds the old policy (checked on 2026-11-07: 0 rows).
create or replace function public.scan_two_ways_review_policy() returns trigger
language plpgsql set search_path='' as $$
begin
  return new;
end $$;
