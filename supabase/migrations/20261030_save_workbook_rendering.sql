-- A new rendering of a stored workbook (#309): replaces its PDF path, each page's image and each question's box in one
-- transaction, and nothing else. The workbook row, its page tokens, its question packages and its status stay, so the
-- learning events that name it are never deleted with it (their foreign key cascades on delete). The caller checks the
-- shape first (renderingProblem in src/lib/workbook-content.ts); this function checks what only the database knows:
-- the workbook exists, the rendering names exactly its pages and each page's questions, and every file is in the
-- family's folder. It locks the workbook row first, so two renderings of one workbook run one after the other. A
-- refusal changes nothing. A family being deleted is refused by the fence (55000), which is raised, not answered.
-- Additive: a new service-only function; the live code does not call it until this PR ships.
create function public.save_workbook_rendering(p_rendering jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w_id uuid := (p_rendering->>'workbookId')::uuid;
  w_parent uuid;
  folder text;
  pg jsonb;
  q jsonb;
  v_page uuid;
  c text;
begin
  select parent_id into w_parent from public.workbooks where id = w_id for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not known'); end if;

  if (select coalesce(array_agg((pg->>'number')::int order by (pg->>'number')::int), '{}') from jsonb_array_elements(p_rendering->'pages') pg)
     is distinct from (select coalesce(array_agg(page_number order by page_number), '{}') from public.workbook_pages where workbook_id = w_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'the pages are not the workbook''s pages');
  end if;
  for pg in select value from jsonb_array_elements(p_rendering->'pages') order by (value->>'number')::int loop
    if (select coalesce(array_agg((q->>'number')::int order by (q->>'number')::int), '{}') from jsonb_array_elements(pg->'questions') q)
       is distinct from (
         select coalesce(array_agg(wq.question_number order by wq.question_number), '{}')
         from public.workbook_questions wq join public.workbook_pages wp on wp.id = wq.page_id
         where wp.workbook_id = w_id and wp.page_number = (pg->>'number')::int
       ) then
      return jsonb_build_object('status', 'refused', 'reason', format('page %s: the questions are not the page''s questions', pg->>'number'));
    end if;
  end loop;

  folder := w_parent::text || '/' || w_id::text || '/';
  if exists (
    select 1 from (
      select p_rendering->>'pdfPath' as path
      union all select page->'image'->>'path' from jsonb_array_elements(p_rendering->'pages') page
    ) f where f.path is null or left(f.path, length(folder)) <> folder
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'a file is not in the family''s folder');
  end if;

  begin
    update public.workbooks set pdf_path = p_rendering->>'pdfPath' where id = w_id;
    for pg in select value from jsonb_array_elements(p_rendering->'pages') loop
      update public.workbook_pages
      set image_path = pg->'image'->>'path', image_width = (pg->'image'->>'width')::int, image_height = (pg->'image'->>'height')::int
      where workbook_id = w_id and page_number = (pg->>'number')::int
      returning id into v_page;
      for q in select value from jsonb_array_elements(pg->'questions') loop
        update public.workbook_questions
        set box_x = (q->'box'->>'x')::int, box_y = (q->'box'->>'y')::int,
            box_width = (q->'box'->>'width')::int, box_height = (q->'box'->>'height')::int
        where page_id = v_page and question_number = (q->>'number')::int;
      end loop;
    end loop;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', format('the rendering does not pass the database check %s', coalesce(c, 'not null')));
  end;
  return jsonb_build_object('status', 'written', 'workbookId', w_id);
end $$;
revoke all on function public.save_workbook_rendering(jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_rendering(jsonb) to service_role;
