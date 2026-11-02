-- Failed attempts keep the previous page and its existing print checks.
create or replace function public.finish_workbook_edit(p_id uuid, p_lease uuid, p_content jsonb, p_rendering jsonb, p_problems jsonb, p_error text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e record; d record; v_status text; r record; v_before jsonb; v_after jsonb; v_pair record; v_question_data jsonb; v_page_id uuid; v_targets int[]; v_question int; v_page_number int;
begin
  -- Same draft-before-workbook lock order as approve and mark. Recheck the lease only after those locks.
  select * into e from public.workbook_edits where id=p_id;
  if not found then return jsonb_build_object('status','refused','reason','This edit is unavailable.'); end if;
  select * into d from public.workbook_drafts where id=e.draft_id for no key update;
  select status into v_status from public.workbooks where id=e.draft_id for update;
  select * into e from public.workbook_edits where id=p_id for update;
  if e.status <> 'running' or e.lease is distinct from p_lease then return jsonb_build_object('status','refused','reason','This edit stopped. Reload the page.'); end if;
  select * into r from public.workbook_draft_revisions where draft_id=e.draft_id order by revision desc limit 1;
  if p_error is null and (r.revision <> e.base_revision or v_status in ('printed','shipped')) then p_error := 'This workbook changed. Reload the page.'; end if;
  if p_error is null then
    select array_agg(distinct page_number) into v_targets from public.workbook_comments where batch_id=p_id and status='sent'
      and not exists(select 1 from jsonb_array_elements(p_problems) errors(failure) where (errors.failure->>'page')::int=page_number);
    if v_targets is null then p_error:='No comments could be applied. See each comment for the reason.'; end if;
  end if;
  if p_error is null then
    v_before := coalesce(r.content,d.draft);
    -- Only the selected page and its rendering may differ. Numbers, QR tokens, book identity stay fixed.
    if (v_before - 'pages' - 'counts') is distinct from (p_content - 'pages' - 'counts')
      or jsonb_array_length(v_before->'pages') <> jsonb_array_length(p_content->'pages') then raise exception 'The workbook identity changed'; end if;
    for v_pair in select b.value as b, a.value as a from jsonb_array_elements(v_before->'pages') with ordinality b(value,n)
      join jsonb_array_elements(p_content->'pages') with ordinality a(value,n) using(n) loop
      if not ((v_pair.b->>'number')::int = any(v_targets)) then
        if v_pair.b is distinct from v_pair.a then raise exception 'Another page changed'; end if;
      else
        v_before := v_pair.b; v_after := v_pair.a;
        if (v_pair.b - 'questions' - 'content' - 'fit') is distinct from (v_pair.a - 'questions' - 'content' - 'fit') then raise exception 'The page identity changed'; end if;
        select case when bool_or(question_number is null) then null else -1 end into v_question
          from public.workbook_comments where batch_id=p_id and page_number=(v_pair.b->>'number')::int;
        if v_question is not null and (
          (select jsonb_agg(j_value) from jsonb_array_elements(v_pair.b->'questions') j_value where not exists(select 1 from public.workbook_comments c where c.batch_id=p_id and c.page_number=(v_pair.b->>'number')::int and c.question_number=(j_value->>'number')::int))
            is distinct from (select jsonb_agg(j_value) from jsonb_array_elements(v_pair.a->'questions') j_value where not exists(select 1 from public.workbook_comments c where c.batch_id=p_id and c.page_number=(v_pair.b->>'number')::int and c.question_number=(j_value->>'number')::int))
        ) then raise exception 'Another question changed'; end if;
      end if;
    end loop;
    if (select jsonb_agg(j_value) from jsonb_array_elements(r.rendering->'pages') j_value where not ((j_value->>'number')::int=any(v_targets)))
      is distinct from (select jsonb_agg(j_value) from jsonb_array_elements(p_rendering->'pages') j_value where not ((j_value->>'number')::int=any(v_targets))) then raise exception 'Another page image changed'; end if;
    insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,by_user,by_email,note,content,rendering,render_problems)
      values(e.draft_id,r.revision+1,e.parent_id,e.child_id,case when e.action='redo-page' then 'redo-page' else 'edit' end,e.actor_id,e.actor_email,e.note,p_content,p_rendering,coalesce((select jsonb_agg(old_problem) from jsonb_array_elements(r.render_problems) old_problem where not ((old_problem->>'page')::int=any(v_targets))),'[]'::jsonb));
    if v_status is not null then
      update public.workbooks set status='draft',approved_at=null,pdf_path=p_rendering->>'pdfPath' where id=e.draft_id;
      foreach v_page_number in array v_targets loop
      select value into v_after from jsonb_array_elements(p_content->'pages') where (value->>'number')::int=v_page_number;
      -- Keep stored pages and packages consistent with the new draft. No rows on other pages change.
      select id into v_page_id from public.workbook_pages where workbook_id=e.draft_id and page_number=v_page_number;
      update public.workbook_pages set image_path=j_value->'image'->>'path',image_width=(j_value->'image'->>'width')::int,image_height=(j_value->'image'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') j_value where id=v_page_id and (j_value->>'number')::int=v_page_number;
      for v_question_data in select value from jsonb_array_elements(v_after->'questions') loop
        update public.workbook_questions set package=v_question_data->'package' where page_id=v_page_id and question_number=(v_question_data->>'number')::int;
      end loop;
      update public.workbook_questions w set box_x=(q->'box'->>'x')::int,box_y=(q->'box'->>'y')::int,box_width=(q->'box'->>'width')::int,box_height=(q->'box'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') p, jsonb_array_elements(p->'questions') q
        where w.page_id=v_page_id and (p->>'number')::int=v_page_number and w.question_number=(q->>'number')::int;
      end loop;
    end if;
    update public.workbook_edits set status='done',finished_at=now(),before_page=v_before,after_page=v_after,revision=r.revision+1 where id=p_id;
    update public.workbook_comments c set status=case when c.page_number=any(v_targets) then 'done' else 'failed' end,
      error=(select errors.failure->>'reason' from jsonb_array_elements(p_problems) errors(failure) where (errors.failure->>'page')::int=c.page_number limit 1),
      before_value=(select case when c.question_number is null then pg else (select q from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number) end
        from jsonb_array_elements(coalesce(r.content,d.draft)->'pages') pg where (pg->>'number')::int=c.page_number),
      after_value=(select case when c.question_number is null then pg else (select q from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number) end
        from jsonb_array_elements(p_content->'pages') pg where (pg->>'number')::int=c.page_number)
      where c.batch_id=p_id and c.status='sent';
    update public.workbook_comments c set revision=r.revision+1,
      status=case when exists(select 1 from jsonb_array_elements(p_content->'pages') pg where (pg->>'number')::int=c.page_number
        and (c.question_number is null or exists(select 1 from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number))) then c.status else 'stale' end
      where c.draft_id=e.draft_id and c.status in ('pending','failed','stale');
    insert into public.workbook_audit(parent_id,child_id,draft_id,actor_id,actor_email,action,detail)
      values(e.parent_id,e.child_id,e.draft_id,e.actor_id,e.actor_email,'workbook-comments-sent',jsonb_build_object('pages',to_jsonb(v_targets),'comments',(select count(*) from public.workbook_comments where batch_id=p_id),'revision',r.revision+1));
    return jsonb_build_object('status','done','revision',r.revision+1);
  end if;
  update public.workbook_comments c set status='failed',error=coalesce((select errors.failure->>'reason' from jsonb_array_elements(p_problems) errors(failure) where (errors.failure->>'page')::int=c.page_number limit 1),p_error) where batch_id=p_id and status='sent';
  update public.workbook_edits set status='failed',finished_at=now(),error=p_error where id=p_id;
  return jsonb_build_object('status','refused','reason',p_error);
end $$;
