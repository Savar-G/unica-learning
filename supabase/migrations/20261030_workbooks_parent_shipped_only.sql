-- Parents read only shipped workbooks (#299 review F1, F2). A draft, approved or printed workbook is team work: the
-- parent and the child see a workbook, its pages, its questions and its files only once it is shipped (the child has the
-- paper book). Admins keep reading every status. Additive in effect: it narrows three table policies and one Storage
-- policy that the code on main does not use yet.

-- True when the workbook belongs to the signed-in parent and is shipped. Security definer so the Storage policy and the
-- page and question policies do not depend on the workbooks policy.
create function public.parent_reads_workbook(p_workbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workbooks w
    where w.id = p_workbook and w.parent_id = (select auth.uid()) and w.status = 'shipped'
  );
$$;
revoke all on function public.parent_reads_workbook(uuid) from public, anon;
grant execute on function public.parent_reads_workbook(uuid) to authenticated, service_role;

drop policy "Parents read their own workbooks" on public.workbooks;
create policy "Parents read their own shipped workbooks" on public.workbooks
  for select to authenticated using (parent_id = (select auth.uid()) and status = 'shipped');

drop policy "Parents read their own workbooks" on public.workbook_pages;
create policy "Parents read pages of their own shipped workbooks" on public.workbook_pages
  for select to authenticated using (parent_id = (select auth.uid()) and public.parent_reads_workbook(workbook_id));

drop policy "Parents read their own workbooks" on public.workbook_questions;
create policy "Parents read questions of their own shipped workbooks" on public.workbook_questions
  for select to authenticated using (parent_id = (select auth.uid()) and public.parent_reads_workbook(workbook_id));

-- Files are stored as <parent>/<workbook>/<file>.
drop policy "Parents read their own workbook files" on storage.objects;
create policy "Parents read files of their own shipped workbooks" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workbook-pages'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.parent_reads_workbook(((storage.foldername(name))[2])::uuid)
  );
