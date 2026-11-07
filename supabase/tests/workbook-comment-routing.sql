do $$
declare d uuid; a uuid:=gen_random_uuid(); c1 uuid;c2 uuid;v jsonb;e uuid;l uuid:=gen_random_uuid();r jsonb;content jsonb;plan jsonb;checks int:=0;
begin
  if has_function_privilege('anon','public.queue_workbook_layout_edit(uuid,int,jsonb,uuid,text)','execute')
    or has_function_privilege('authenticated','public.finish_workbook_layout_edit(uuid,uuid,jsonb,jsonb,text)','execute')
    or has_function_privilege('service_role','public.finish_workbook_question_edit_checked(uuid,uuid,jsonb,jsonb,jsonb,text)','execute') then raise exception 'RPC grant leak'; end if;
  checks:=checks+1;
  if not has_function_privilege('service_role','public.finish_workbook_layout_edit(uuid,uuid,jsonb,jsonb,text)','execute') then raise exception 'Missing service grant'; end if;
  checks:=checks+1;
  d:=public.qa_seed_book();
  v:=public.save_workbook_comment(d,1,jsonb_build_object('page',1,'question',null,'x',.5,'y',.5,'note','Use normal capitals'),a,'test@example.com',false);c1:=(v->>'id')::uuid;
  if (select route from public.workbook_comments where id=c1)<>'layout' then raise exception 'Cover not routed'; end if;checks:=checks+1;
  if public.send_workbook_comments(d,1,a,'test@example.com','mac')->>'status'<>'layout-review' then raise exception 'Layout entered question queue'; end if;
  if exists(select 1 from public.workbook_edits where draft_id=d) or (select status from public.workbook_comments where id=c1)<>'pending' then raise exception 'Layout request falsely applied'; end if;checks:=checks+1;
  v:=public.save_workbook_comment(d,1,jsonb_build_object('page',3,'question',1,'x',.5,'y',.5,'note','Use clearer words'),a,'test@example.com',false);c2:=(v->>'id')::uuid;
  v:=public.send_workbook_comments(d,1,a,'test@example.com','mac');e:=(v->>'id')::uuid;
  if (select status from public.workbook_comments where id=c1)<>'pending' or (select status from public.workbook_comments where id=c2)<>'sent' then raise exception 'Mixed routing failed'; end if;checks:=checks+1;
  if not public.claim_workbook_edit(e,l,'mac') then raise exception 'Question claim failed'; end if;
  select rr.content,rr.rendering into content,r from public.workbook_draft_revisions rr where draft_id=d and revision=1;
  v:=public.finish_workbook_edit(e,l,content,r,'[]',null);
  if v->>'status'<>'refused' or (select max(revision) from public.workbook_draft_revisions where draft_id=d)<>1 then raise exception 'No-op revision saved'; end if;checks:=checks+1;
  -- A new batch changes one target and leaves its peer open.
  v:=public.save_workbook_comment(d,1,jsonb_build_object('page',3,'question',2,'x',.5,'y',.5,'note','Use clearer words'),a,'test@example.com',false);
  v:=public.send_workbook_comments(d,1,a,'test@example.com','mac');e:=(v->>'id')::uuid;l:=gen_random_uuid();perform public.claim_workbook_edit(e,l,'mac');
  content:=jsonb_set(content,'{pages,2,questions,0,package,text}','"Read this digit."');
  content:=jsonb_set(content,'{quality}','{"ready":true,"failedRate":0,"dropped":0,"days":[{"day":1,"minutes":10,"formats":1,"largestNumber":2}],"issues":[]}');
  v:=public.finish_workbook_edit(e,l,content,r,'[]',null);
  if v->>'status'<>'done' then raise exception 'Real target edit refused %',v; end if;
  if (select count(*) from public.workbook_comments where batch_id=e and status='done')<>1 or (select count(*) from public.workbook_comments where batch_id=e and status='failed')<>1 then raise exception 'Unchanged peer falsely completed'; end if;checks:=checks+1;
  if (select revision from public.workbook_comments where id=c1)<>2 then raise exception 'Open layout location did not follow revision'; end if;checks:=checks+1;
  -- Queue a reviewed layout correction. Old workers cannot claim it.
  plan:=jsonb_build_object('reviewed',true,'build',repeat('a',40),'pages',jsonb_build_array(1),'results',jsonb_build_array(jsonb_build_object('id',c1,'page',1,'status','partial','note','Case fixed; the remaining request stays open.')));
  v:=public.queue_workbook_layout_edit(d,2,plan,a,'test@example.com');e:=(v->>'id')::uuid;l:=gen_random_uuid();
  if v->>'status'<>'queued' or public.claim_workbook_edit(e,l,'mac') then raise exception 'Legacy worker can claim layout'; end if;checks:=checks+1;
  if not public.claim_workbook_layout_edit(e,l) then raise exception 'Layout claim failed'; end if;checks:=checks+1;
  update public.workbook_edits set frame=jsonb_build_object('calls',1,'build',repeat('a',40),'model',null,'solveModel','layout-no-model','layoutPages',jsonb_build_array(1)) where id=e;
  select rendering into r from public.workbook_draft_revisions where draft_id=d and revision=2;
  r:=jsonb_set(r,'{pages,0,printContract,fingerprints,image}',to_jsonb(repeat('b',64)));
  v:=public.finish_workbook_layout_edit(e,l,r,plan->'results',null);
  if v->>'status'<>'done' then raise exception 'Layout finish refused %',v; end if;
  if (select rr.content from public.workbook_draft_revisions rr where draft_id=d and revision=3) is distinct from content then raise exception 'Saved question or schedule changed'; end if;checks:=checks+1;
  if (select status from public.workbook_comments where id=c1)<>'failed' or (select revision from public.workbook_comments where id=c1)<>3 then raise exception 'Partial comment closed'; end if;checks:=checks+1;
  if public.finish_workbook_layout_edit(e,l,r,plan->'results',null)->>'status'<>'refused' or (select max(revision) from public.workbook_draft_revisions where draft_id=d)<>3 then raise exception 'Duplicate finish saved'; end if;checks:=checks+1;
  plan:=jsonb_set(plan,'{results,0,status}','"unsupported"');
  v:=public.queue_workbook_layout_edit(d,3,plan,a,'test@example.com');
  if v->>'status'<>'layout-review' or (select max(revision) from public.workbook_draft_revisions where draft_id=d)<>3
    or (select result_note from public.workbook_comments where id=c1) is distinct from plan->'results'->0->>'note'
    or exists(select 1 from public.workbook_edits where draft_id=d and status in ('queued','running')) then raise exception 'Unsupported result was lost or rendered'; end if;checks:=checks+1;
  if public.queue_workbook_layout_edit(d,3,plan-'reviewed',a,'test@example.com')->>'status'<>'refused' then raise exception 'Unreviewed request admitted'; end if;checks:=checks+1;
  if public.queue_workbook_layout_edit(d,2,plan,a,'test@example.com')->>'status'<>'refused' then raise exception 'Stale request admitted'; end if;checks:=checks+1;
  -- Failure paths use independent books and never move their revisions.
  for v in select jsonb_build_object('case',n) from generate_series(1,7) n loop
    d:=public.qa_seed_book();l:=gen_random_uuid();
    c1:=(public.save_workbook_comment(d,1,jsonb_build_object('page',1,'x',.5,'y',.5,'note','Fix the cover'),a,'test@example.com',false)->>'id')::uuid;
    plan:=jsonb_build_object('reviewed',true,'build',repeat('a',40),'pages',jsonb_build_array(1),'results',jsonb_build_array(jsonb_build_object('id',c1,'page',1,'status','applied','note','Reviewed cover correction.')));
    e:=(public.queue_workbook_layout_edit(d,1,plan,a,'test@example.com')->>'id')::uuid;perform public.claim_workbook_layout_edit(e,l);
    update public.workbook_edits set frame=jsonb_build_object('calls',1,'build',repeat('a',40),'model',null,'solveModel','layout-no-model','layoutPages',jsonb_build_array(1)) where id=e;
    select rendering into r from public.workbook_draft_revisions where draft_id=d and revision=1;
    r:=jsonb_set(r,'{pages,0,printContract,fingerprints,image}',to_jsonb(repeat('b',64)));
    case (v->>'case')::int
      when 1 then r:=jsonb_set(r,'{pages,1,image,path}','"changed-unselected.png"');
      when 2 then r:=jsonb_set(r,'{pages,0,printContract,fingerprints,content}',to_jsonb(repeat('d',64)));
      when 3 then update public.workbook_edits set heartbeat_at=now()-interval '7 minutes' where id=e;
      when 4 then update public.workbook_edits set lease=gen_random_uuid() where id=e;
      when 5 then update public.workbook_edits set frame=jsonb_set(frame,'{build}',to_jsonb(repeat('b',40))) where id=e;
      when 6 then r:=r-'pdfPath';
      when 7 then r:=jsonb_set(r,'{pages,0,printContract,fingerprints,image}',to_jsonb(repeat('a',64)));
    end case;
    if public.finish_workbook_layout_edit(e,l,r,plan->'results',null)->>'status'<>'refused' then raise exception 'Failure case accepted %',v; end if;
    if (select max(revision) from public.workbook_draft_revisions where draft_id=d)<>1 or (select status from public.workbook_comments where id=c1)='done' then raise exception 'Failure created a revision or closed a comment %',v; end if;
    checks:=checks+1;
  end loop;
  raise notice 'WORKBOOK_COMMENT_ROUTING_OK %',checks;
end $$;
