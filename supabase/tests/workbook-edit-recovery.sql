-- Run through the Management API as postgres. All fixture writes roll back.
-- Public RPC regression checks for R428-2, R428-4, R428-5 and R428-7.
begin;
do $$
declare source public.workbook_drafts%rowtype; d uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); actor uuid; c1 jsonb; c2 jsonb; batch jsonb; recovered jsonb; e uuid; old_lease uuid:=gen_random_uuid(); new_lease uuid:=gen_random_uuid(); frame jsonb; n int;
begin
 select d.* into source from public.workbook_drafts d where exists(select 1 from public.test_accounts t where t.parent_id=d.parent_id) and exists(select 1 from public.workbook_runs r where r.draft_id=d.id and r.started_by is not null) order by d.created_at desc limit 1;
 if source.id is null then raise exception 'This probe requires a test-family workbook draft'; end if;
 select started_by into actor from public.workbook_runs where draft_id=source.id;
 insert into public.workbook_drafts select (jsonb_populate_record(null::public.workbook_drafts,to_jsonb(source)||jsonb_build_object('id',d,'draft',jsonb_set(source.draft,'{id}',to_jsonb(d))))).*;
 insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,content,rendering,render_problems)
 select d,1,source.parent_id,source.child_id,'generated',null,rendering,'[]'::jsonb from public.workbook_draft_revisions where draft_id=source.id order by revision desc limit 1;
 c1:=public.save_workbook_comment(d,1,jsonb_build_object('requestKey',request,'page',3,'question',1,'x',0.5,'y',0.5,'note','Probe apples'),actor,'probe@example.com',false);
 c2:=public.save_workbook_comment(d,1,jsonb_build_object('requestKey',request,'page',3,'question',1,'x',0.5,'y',0.5,'note','Probe apples'),actor,'probe@example.com',false);
 if c1->>'status'<>'saved' or c1<>c2 then raise exception 'Duplicate retry failed: %, %',c1,c2; end if;
 select count(*) into n from public.workbook_comments where draft_id=d;
 if n<>1 then raise exception 'Duplicate row count %',n; end if;
 batch:=public.send_workbook_comments(d,1,actor,'probe@example.com','server'); e:=(batch->>'id')::uuid;
 if not public.claim_workbook_edit(e,old_lease,'server') then raise exception 'Claim failed'; end if;
 frame:=public.frame_workbook_edit(e,old_lease,'{"build":"first","model":"fake","solveModel":"fake"}');
 if frame->>'build'<>'first' then raise exception 'Frame not stored'; end if;
 if not public.checkpoint_workbook_edit(e,old_lease,3,'{"responses":[{"items":[]}]}') then raise exception 'Writer response not saved'; end if;
 if not public.checkpoint_workbook_edit(e,old_lease,3,'{"page":{"number":3}}') then raise exception 'Page checkpoint failed'; end if;
 if not exists(select 1 from public.workbook_edits where id=e and checkpoints->'3'->'responses' is not null) then raise exception 'Writer response lost'; end if;
 update public.workbook_edits set heartbeat_at=now()-interval '7 minutes' where id=e;
 if public.checkpoint_workbook_edit(e,old_lease,3,'{"error":"late"}') then raise exception 'Expired checkpoint accepted'; end if;
 if public.release_workbook_edit(e,old_lease) then raise exception 'Expired release accepted'; end if;
 if public.finish_workbook_edit(e,old_lease,null,null,'[]','late')->>'status'<>'refused' then raise exception 'Expired finish accepted'; end if;
 recovered:=public.send_workbook_comments(d,1,actor,'probe@example.com','mac');
 if recovered->>'id' is distinct from e::text or recovered->>'runner'<>'server' then raise exception 'Server retry lost batch or runner %',recovered; end if;
 if not public.claim_workbook_edit(e,new_lease,'server') then raise exception 'Expired claim failed'; end if;
 if public.checkpoint_workbook_edit(e,old_lease,3,'{"error":"late"}') then raise exception 'Replaced lease accepted'; end if;
 frame:=public.frame_workbook_edit(e,new_lease,'{"build":"changed","model":"fake","solveModel":"fake"}');
 if frame->>'build'<>'first' then raise exception 'Frame overwritten'; end if;
 perform public.finish_workbook_edit(e,new_lease,null,null,'[]','The code or model changed. Try again to start a new edit.');
 if not exists(select 1 from public.workbook_comments where draft_id=d and status='pending') then raise exception 'Version mismatch did not return comments to pending'; end if;
 -- A lost save response can be retried after the revision changes without creating a row.
 update public.workbook_comments set revision=2 where draft_id=d;
 c2:=public.save_workbook_comment(d,99,jsonb_build_object('requestKey',request),actor,'probe@example.com',false);
 if c2<>c1 then raise exception 'Retry identity changed across revision'; end if;
 -- Partial results from old code have no version evidence and must fail closed.
 update public.workbook_edits set status='running',lease=new_lease,heartbeat_at=now(),frame=null where id=e;
 frame:=public.frame_workbook_edit(e,new_lease,'{"build":"current","model":"fake","solveModel":"fake"}');
 if frame->>'build'<>'unframed-edit' then raise exception 'Legacy partial results accepted'; end if;
 if has_function_privilege('authenticated','public.frame_workbook_edit(uuid,uuid,jsonb)','execute') then raise exception 'Frame RPC exposed'; end if;
end $$;
rollback;
select 'PASS: duplicate retry, response merge, server recovery, expired and replaced leases, frame retention, pending comments, service-only frame; all probe writes rolled back' as result;
