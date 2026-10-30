-- Two follow-ups to the workbook store (#299).
-- 1. Review F3: the Storage policy cast the folder name to uuid, and Postgres does not promise the order of AND
--    conditions, so an odd folder name (36 hyphens) could raise 22P02. The check now runs inside one function that tests
--    the canonical uuid form before the cast and answers false for anything else.
-- 2. Learning events (#302) name a workbook by workbook_id with no foreign key until the workbook tables existed. A
--    workbook event must name a workbook of the same child: (workbook_id, child_id) now references the workbook.
--    learning_events held 0 rows when this was added.

create function public.parent_reads_workbook_folder(p_folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_folder is null or p_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.parent_reads_workbook(p_folder::uuid);
end $$;
revoke all on function public.parent_reads_workbook_folder(text) from public, anon;
grant execute on function public.parent_reads_workbook_folder(text) to authenticated, service_role;

drop policy "Parents read files of their own shipped workbooks" on storage.objects;
create policy "Parents read files of their own shipped workbooks" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workbook-pages'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.parent_reads_workbook_folder((storage.foldername(name))[2])
  );

alter table public.workbooks add constraint workbooks_id_child_key unique (id, child_id);
alter table public.learning_events add constraint learning_events_workbook_fkey
  foreign key (workbook_id, child_id) references public.workbooks (id, child_id) on delete cascade;
