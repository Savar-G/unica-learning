-- A failed old image is not the authority for a replacement. Keep the saved-content binding and clear only accepted-page render errors.
-- A reviewed layout batch has no writer or solver and cannot use the legacy claim or finish RPC.
create or replace function public.queue_workbook_layout_edit(p_draft uuid,p_revision int,p_plan jsonb,p_by uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d record; r record; v_result jsonb; v_id uuid; v_page int; v_count int; v_status text;
begin
  select * into d from public.workbook_drafts where id=p_draft for no key update;
  if not found then return jsonb_build_object('status','refused','reason','This draft is unavailable.'); end if;
  select status into v_status from public.workbooks where id=p_draft for update;
  if v_status in ('printed','shipped') then return jsonb_build_object('status','refused','reason','This workbook is printed or shipped. It cannot change.'); end if;
  select * into r from public.workbook_draft_revisions where draft_id=p_draft order by revision desc limit 1;
  if r.revision is distinct from p_revision then return jsonb_build_object('status','refused','reason','This workbook changed. Reload the page.'); end if;
  if p_plan->'reviewed' is distinct from 'true'::jsonb or coalesce(p_plan->>'build','') !~ '^[a-f0-9]{40}$'
    or jsonb_typeof(p_plan->'pages') is distinct from 'array' or jsonb_typeof(p_plan->'results') is distinct from 'array'
    or jsonb_array_length(p_plan->'pages') not between 1 and 500 or jsonb_array_length(p_plan->'results') not between 1 and 500 then
    return jsonb_build_object('status','refused','reason','Review each layout result and select its affected pages.');
  end if;
  if (select count(distinct value) from jsonb_array_elements(p_plan->'pages'))<>jsonb_array_length(p_plan->'pages')
    or exists(select 1 from jsonb_array_elements_text(p_plan->'pages') n where not exists(select 1 from jsonb_array_elements(coalesce(r.content,d.draft)->'pages') p where p->>'number'=n)) then
    return jsonb_build_object('status','refused','reason','Check the affected page numbers.');
  end if;
  -- The authenticated API computes this small map from the saved snapshot, not from the browser's fields.
  if jsonb_typeof(p_plan->'contentFingerprints') is distinct from 'object' then
    return jsonb_build_object('status','refused','reason','Review the saved page content before rendering.');
  end if;
  if (select count(*) from jsonb_object_keys(p_plan->'contentFingerprints'))<>jsonb_array_length(p_plan->'pages')
    or exists(select 1 from jsonb_array_elements_text(p_plan->'pages') entry(value)
      where jsonb_typeof(p_plan->'contentFingerprints'->entry.value) is distinct from 'string'
        or length(coalesce(p_plan->'contentFingerprints'->>entry.value,'')) not between 1 and 200) then
    return jsonb_build_object('status','refused','reason','The reviewed page content is incomplete. Review it again.');
  end if;
  select count(distinct c.id) into v_count from jsonb_array_elements(p_plan->'results') entry(value)
    join public.workbook_comments c on c.id=(entry.value->>'id')::uuid and c.draft_id=p_draft and c.revision=p_revision and c.status in ('pending','failed')
    join lateral (select value as page from jsonb_array_elements(coalesce(r.content,d.draft)->'pages') where (value->>'number')::int=c.page_number) p on true
    where public.workbook_comment_route(p.page,c.note,c.route)='layout'
      and entry.value->>'status' in ('applied','partial','unsupported') and length(btrim(entry.value->>'note')) between 1 and 2000
      and (entry.value->>'page')::int=c.page_number and p_plan->'pages' @> jsonb_build_array(c.page_number);
  if v_count<>jsonb_array_length(p_plan->'results') then
    return jsonb_build_object('status','refused','reason','Review each current layout comment. Unresolved requests stay open.');
  end if;
  if not exists(select 1 from jsonb_array_elements(p_plan->'results') entry(value) where entry.value->>'status' in ('applied','partial')) then
    update public.workbook_comments c set route='layout',status='failed',batch_id=null,error=entry.value->>'note',result_note=entry.value->>'note'
      from jsonb_array_elements(p_plan->'results') entry(value) where c.id=(entry.value->>'id')::uuid;
    insert into public.workbook_audit(parent_id,child_id,draft_id,actor_id,actor_email,action,detail)
      values(d.parent_id,d.child_id,p_draft,p_by,p_email,'workbook-layout-comments-reviewed',jsonb_build_object('unresolved',v_count,'revision',p_revision));
    return jsonb_build_object('status','layout-review','reason','The unresolved results are saved. These comments remain open.');
  end if;
  select min(value::int) into v_page from jsonb_array_elements_text(p_plan->'pages');
  v_result:=public.queue_workbook_edit(p_draft,p_revision,v_page,null,'redo-page','Reviewed page-layout changes',null,p_by,p_email,'mac');
  if v_result->>'status'<>'queued' then return v_result; end if;
  v_id:=(v_result->>'id')::uuid;
  update public.workbook_edits set edit_kind='layout',layout_plan=p_plan||jsonb_build_object('reviewedBy',p_by,'reviewedAt',now()) where id=v_id;
  update public.workbook_comments c set route='layout',batch_id=v_id,
    status=case when entry.value->>'status'='unsupported' then 'pending' else 'sent' end,
    error=case when entry.value->>'status'='unsupported' then entry.value->>'note' else null end,result_note=null
    from jsonb_array_elements(p_plan->'results') entry(value) where c.id=(entry.value->>'id')::uuid;
  return v_result||jsonb_build_object('runner','mac');
end $$;
revoke all on function public.queue_workbook_layout_edit(uuid,int,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_workbook_layout_edit(uuid,int,jsonb,uuid,text) to service_role;

create or replace function public.finish_workbook_layout_edit(p_id uuid,p_lease uuid,p_rendering jsonb,p_results jsonb,p_error text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e record; d record; r record; v_status text; b jsonb; a jsonb; v_resolution jsonb; v_changed int[]; v_outcome text; v_note text; v_page_number int; v_page_id uuid; v_source jsonb; v_content jsonb;
begin
  select * into e from public.workbook_edits where id=p_id;
  if not found then return jsonb_build_object('status','refused','reason','This layout edit is unavailable.'); end if;
  select * into d from public.workbook_drafts where id=e.draft_id for no key update;
  select status into v_status from public.workbooks where id=e.draft_id for update;
  select * into e from public.workbook_edits where id=p_id for update;
  if e.edit_kind<>'layout' or e.status<>'running' or e.lease is distinct from p_lease or e.heartbeat_at<=clock_timestamp()-interval '6 minutes' then
    return jsonb_build_object('status','refused','reason','This layout edit stopped. Reload the page.');
  end if;
  select * into r from public.workbook_draft_revisions where draft_id=e.draft_id order by revision desc limit 1;
  if r.revision is distinct from e.base_revision or v_status in ('printed','shipped') then p_error:='This workbook changed or is printed. Reload the page.'; end if;
  if p_error is null and (e.frame->>'build' is distinct from e.layout_plan->>'build'
    or e.frame->>'solveModel' is distinct from 'layout-no-model' or nullif(e.frame->>'model','') is not null
    or e.frame->'layoutPages' is distinct from e.layout_plan->'pages') then
    p_error:='The reviewed layout version changed. Review it again before rendering.';
  end if;
  if p_error is null then
    if coalesce(p_rendering->>'pdfPath','') not like e.parent_id::text||'/'||e.draft_id::text||'/%'
      or coalesce(p_rendering->>'pdfSha256','') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(p_rendering->'pages') is distinct from 'array' or jsonb_array_length(p_rendering->'pages')<>jsonb_array_length(r.rendering->'pages')
      or jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)<>jsonb_array_length(e.layout_plan->'results') then
      p_error:='The rendered book does not match the reviewed layout request.';
    end if;
  end if;
  if p_error is null then
    for b,a in select old.value,new.value from jsonb_array_elements(r.rendering->'pages') with ordinality old(value,n)
      join jsonb_array_elements(p_rendering->'pages') with ordinality new(value,n) using(n) loop
      if b->'number' is distinct from a->'number' then p_error:='The page order changed.'; exit; end if;
      if not e.layout_plan->'pages' @> jsonb_build_array((b->>'number')::int) then
        if b is distinct from a then p_error:='An unselected page changed.'; exit; end if;
        continue;
      end if;
      -- A failed selected page keeps its old record and error while other repairs can finish.
      if b is not distinct from a then continue; end if;
      select value into v_source from jsonb_array_elements(coalesce(r.content,d.draft)->'pages') where value->'number'=b->'number';
      if not found or jsonb_typeof(a->'printContract') is distinct from 'object'
        or jsonb_typeof(a->'questions') is distinct from 'array' or coalesce(a->>'proof','false')<>'false'
        or nullif(a->>'contractProblem','') is not null
        or a->'printContract'->>'version' is distinct from '1'
        or coalesce(a->'printContract'->'fingerprints'->>'image','') !~ '^[a-f0-9]{64}$'
        or a->'printContract'->>'workbookId' is distinct from e.draft_id::text
        or a->'printContract'->'page' is distinct from v_source->'number'
        or a->'printContract'->>'label' is distinct from v_source->'content'->>'id'
        or a->'printContract'->>'day' is distinct from (case when v_source->'content'->>'kind'='day' and coalesce(v_source->'content'->>'extraPractice','false')<>'true' then v_source->'content'->>'day' else null end)
        or a->'printContract'->>'pageOfDay' is distinct from (case when v_source->'content'->>'kind'='day' and coalesce(v_source->'content'->>'extraPractice','false')<>'true' then v_source->'content'->>'page' else null end)
        or a->'printContract'->'fingerprints'->>'content' is distinct from e.layout_plan->'contentFingerprints'->>(b->>'number')
        or (select jsonb_agg(q->'number') from jsonb_array_elements(v_source->'questions') q) is distinct from (select jsonb_agg(q->'number') from jsonb_array_elements(a->'questions') q)
        or coalesce(a->'image'->>'path','') not like e.parent_id::text||'/'||e.draft_id::text||'/%' then
        p_error:='The rendered page does not preserve its saved identity and question data.'; exit;
      end if;
      if b->>'proof'='true' or b->'printContract'->'fingerprints'->'image' is distinct from a->'printContract'->'fingerprints'->'image' then v_changed:=array_append(v_changed,(b->>'number')::int); end if;
    end loop;
    if p_error is null and (v_changed is null or not exists(select 1 from jsonb_array_elements(p_results) entry(value) where entry.value->>'status' in ('applied','partial') and (entry.value->>'page')::int=any(v_changed))) then
      p_error:='No reviewed page changes could be saved. All comments stay open.';
    end if;
    if p_error is null and (exists(select 1 from jsonb_array_elements(p_results) entry(value) where not exists(
      select 1 from jsonb_array_elements(e.layout_plan->'results') planned where planned->>'id'=entry.value->>'id' and planned->'page'=entry.value->'page'
        and entry.value->>'status' in ('applied','partial','unsupported') and length(btrim(entry.value->>'note')) between 1 and 2000
        and (entry.value->>'status'<>'applied' or planned->>'status'='applied')
        and (planned->>'status'<>'unsupported' or entry.value->>'status'='unsupported')))
      or (select count(distinct entry.value->>'id') from jsonb_array_elements(p_results) entry(value))<>jsonb_array_length(p_results)) then
      p_error:='The comment outcomes do not match this reviewed request.';
    end if;
  end if;
  if p_error is not null then
    update public.workbook_comments set status='failed',error=p_error where batch_id=p_id and status='sent';
    update public.workbook_edits set status='failed',finished_at=now(),error=p_error where id=p_id;
    return jsonb_build_object('status','refused','reason',p_error);
  end if;
  -- The saved draft is copied from the database. No caller-supplied question, answer, plan or schedule can replace it.
  -- Strictly accepted replacements can repair old fit metadata. Retained pages keep their own failed status.
  v_content:=coalesce(r.content,d.draft);
  if exists(select 1 from jsonb_array_elements(v_content->'pages') pg where (pg->>'number')::int=any(v_changed) and pg->'fit'->>'status'='failed') then
    v_content:=jsonb_set(v_content,'{pages}',(select jsonb_agg(case when (pg->>'number')::int=any(v_changed) and pg->'fit'->>'status'='failed'
      then jsonb_set(pg,'{fit}','{"status":"fits"}'::jsonb) else pg end order by n) from jsonb_array_elements(v_content->'pages') with ordinality entries(pg,n)));
    v_content:=jsonb_set(v_content,'{counts,failedPages}',to_jsonb((select count(*) from jsonb_array_elements(v_content->'pages') pg where pg->'fit'->>'status'='failed')));
  end if;
  insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,by_user,by_email,note,content,rendering,render_problems)
    values(e.draft_id,r.revision+1,e.parent_id,e.child_id,'edit',e.actor_id,e.actor_email,'Reviewed page-layout changes',v_content,p_rendering,coalesce((select jsonb_agg(problem) from jsonb_array_elements(r.render_problems) problem where not coalesce((problem->>'page')::int=any(v_changed),false)),'[]'::jsonb));
  if v_status is not null then
    update public.workbooks set status='draft',approved_at=null,pdf_path=p_rendering->>'pdfPath' where id=e.draft_id;
    foreach v_page_number in array v_changed loop
      select id into v_page_id from public.workbook_pages where workbook_id=e.draft_id and page_number=v_page_number;
      if not found then raise exception 'The stored page is unavailable'; end if;
      update public.workbook_pages set image_path=pg->'image'->>'path',image_width=(pg->'image'->>'width')::int,image_height=(pg->'image'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') pg where id=v_page_id and (pg->>'number')::int=v_page_number;
      update public.workbook_questions w set box_x=(q->'box'->>'x')::int,box_y=(q->'box'->>'y')::int,
        box_width=(q->'box'->>'width')::int,box_height=(q->'box'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') pg,jsonb_array_elements(pg->'questions') q
        where w.page_id=v_page_id and (pg->>'number')::int=v_page_number and w.question_number=(q->>'number')::int;
    end loop;
    -- Approval applies this revision's full print contract and marking regions through the existing path.
    -- Packages, question identities, QR tokens and unselected stored rows do not change here.
  end if;
  for v_resolution in select value from jsonb_array_elements(p_results) loop
    v_outcome:=v_resolution->>'status';v_note:=v_resolution->>'note';
    if not (v_resolution->>'page')::int=any(v_changed) then v_outcome:='unsupported';v_note:='The page did not change. This comment stays open.'; end if;
    update public.workbook_comments set status=case when v_outcome='applied' then 'done' else 'failed' end,
      revision=case when v_outcome='applied' then revision else r.revision+1 end,result_note=v_note,
      error=case when v_outcome='applied' then null when v_outcome='partial' then 'Partly applied. '||v_note else v_note end,
      before_value=(select value from jsonb_array_elements(r.rendering->'pages') where (value->>'number')::int=(v_resolution->>'page')::int),
      after_value=(select value from jsonb_array_elements(p_rendering->'pages') where (value->>'number')::int=(v_resolution->>'page')::int)
      where id=(v_resolution->>'id')::uuid and batch_id=p_id;
  end loop;
  update public.workbook_comments set revision=r.revision+1 where draft_id=e.draft_id and status in ('pending','failed','stale');
  update public.workbook_edits set status='done',finished_at=now(),revision=r.revision+1 where id=p_id;
  insert into public.workbook_audit(parent_id,child_id,draft_id,actor_id,actor_email,action,detail)
    values(e.parent_id,e.child_id,e.draft_id,e.actor_id,e.actor_email,'workbook-layout-comments-applied',jsonb_build_object('pages',v_changed,'revision',r.revision+1,'build',e.layout_plan->>'build'));
  return jsonb_build_object('status','done','revision',r.revision+1);
end $$;
revoke all on function public.finish_workbook_layout_edit(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_workbook_layout_edit(uuid,uuid,jsonb,jsonb,text) to service_role;
