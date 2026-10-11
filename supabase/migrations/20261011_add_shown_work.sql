-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_shown_work, 2026-10-11.
-- Shown work on the whiteboard (#67, D-083). Additive: the code on main does not read these columns, the defaults fit
-- every existing row, and no one could read the new bucket before this change.
--
-- answers.work_required: the question required shown work (Question.showWork in the assessment core).
-- answers.work_path: the drawing, a PNG in the private bucket "shown-work"; null when the child did not draw.
-- answers.work_text: the typed working (grades 3-7 only); null when the child did not type.
-- The answer route (src/app/api/account/assessments/[id]/answers/route.ts) writes all three with the secret key, after
-- it checks the size limits (src/lib/test-api.ts: 1 MB PNG, 1000 characters). Parents still cannot read answers.
alter table public.answers
  add column work_required boolean not null default false,
  add column work_path text check (char_length(work_path) <= 200),
  add column work_text text check (char_length(work_text) <= 1000);

-- The bucket is private: no public URLs. Files are <parent id>/<assessment id>/<question id>-<random>.png, written only
-- by the server with the secret key (service_role skips row-level security). The bucket itself refuses anything that
-- is not a PNG of 1 MB or less.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shown-work', 'shown-work', false, 1000000, array['image/png']);

-- A signed-in parent may read (and so sign short-lived URLs for) only the files in their own folder. No insert, update
-- or delete for parents. Admin reads come with the admin ticket (#77).
create policy "Parents read their own children's shown work" on storage.objects
  for select to authenticated
  using (bucket_id = 'shown-work' and (storage.foldername(name))[1] = (select auth.uid())::text);
