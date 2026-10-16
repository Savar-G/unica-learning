-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_answer_strokes, 2026-10-16.
-- Whiteboard strokes (#186, spec #181): every stroke a child drew on a question, with times since the question was
-- shown, for the admin's replay. Additive: the code on main does not read or write the new column, no stored file
-- changes, and the new policy narrows only what nobody stores yet (files that are not .png in the shown-work bucket).
--
-- answers.strokes_path: the strokes, a JSON file in the private bucket "shown-work", in the parent's folder beside the
-- drawing (<parent id>/<assessment id>/<question id>-<random>.strokes.json); null when the child drew no strokes. The
-- answer route writes it with the secret key after it checks the size (src/lib/test-api.ts: 500 KB). Parents still
-- cannot read answers. Because the files are in the parent's folder, the family deletion (migration
-- add_family_deletion) fences and removes them as it does the drawings.
alter table public.answers
  add column strokes_path text check (char_length(strokes_path) <= 200);

-- The bucket takes the strokes' JSON beside the PNG drawings. Its size limit (1 MB a file) does not change.
update storage.buckets set allowed_mime_types = array['image/png', 'application/json'] where id = 'shown-work';

-- Strokes are for admins only: they hold a child's handwriting. The policy "Parents read their own children's shown
-- work" lets a parent read every file in their folder; this restrictive policy narrows that to the .png drawings.
-- Admins still read everything ("Admins read all shown work"). Other buckets are not affected.
create policy "Only admins read shown work that is not a drawing" on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'shown-work' or name like '%.png' or (select public.is_admin()));
