-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_learning_style, 2026-10-12.
-- How a child likes to learn (#126): the parent answers after the assessment, on the report, and can change the
-- answers from the account. Additive: four nullable columns; null is no answer, and the book plan then uses the
-- default mix (src/lib/learning-style.ts, whose ids must match the checks below).
-- learning_styles: one or two of the offered styles. interests: the settings of the story problems.
-- learning_note: "Anything else we should know?" learning_updated_at: when the parent last saved the answers.
alter table public.children
  add column learning_styles text[] check (
    learning_styles <@ array['pictures', 'stories', 'worked', 'hands_on']::text[]
    and cardinality(learning_styles) between 1 and 2),
  add column interests text[] check (
    interests <@ array['animals', 'sports', 'space', 'cooking', 'games', 'music', 'art', 'nature', 'vehicles', 'building']::text[]
    and cardinality(interests) between 1 and 10),
  add column learning_note text check (char_length(learning_note) between 1 and 500),
  add column learning_updated_at timestamptz;

-- A signed-in parent writes these four columns, and only on their own children. The other columns stay server-only.
-- Reads are unchanged: "Parents read their own children" already covers every column.
grant update (learning_styles, interests, learning_note, learning_updated_at) on table public.children to authenticated;
create policy "Parents update how their own children learn" on public.children
  for update to authenticated
  using ((select auth.uid()) = parent_id)
  with check ((select auth.uid()) = parent_id);
