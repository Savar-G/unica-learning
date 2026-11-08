-- Management API probe. All fixture writes and family deletion roll back.
begin;
do $$
declare source public.workbook_drafts%rowtype; d uuid:=gen_random_uuid(); actor uuid; batch jsonb; e uuid; l uuid:=gen_random_uuid(); newer uuid:=gen_random_uuid(); row jsonb; n int; k text; q text;
begin
 select x.* into source from public.workbook_drafts x where exists(select 1 from public.test_accounts t where t.parent_id=x.parent_id) and exists(select 1 from public.workbook_runs r where r.draft_id=x.id and r.started_by is not null) order by x.created_at desc limit 1;
 if source.id is null then raise exception 'A test-family draft is required'; end if;
 select started_by into actor from public.workbook_runs where draft_id=source.id;
 insert into public.workbook_drafts select (jsonb_populate_record(null::public.workbook_drafts,to_jsonb(source)||jsonb_build_object('id',d,'draft',jsonb_set(source.draft,'{id}',to_jsonb(d))))).*;
 insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,content,rendering,render_problems)
 select d,1,source.parent_id,source.child_id,'generated',null,rendering,'[]' from public.workbook_draft_revisions where draft_id=source.id order by revision desc limit 1;
 perform public.save_workbook_comment(d,1,'{"page":3,"question":1,"x":0.5,"y":0.5,"note":"Ledger probe"}',actor,'probe@example.com');
 batch:=public.send_workbook_comments(d,1,actor,'probe@example.com','server'); e:=(batch->>'id')::uuid;
 if not public.claim_workbook_edit(e,l,'server') then raise exception 'Claim failed'; end if;
 foreach k in array array['write','solve'] loop
   q:=case when k='write' then '' else 'question-1' end;
   row:=public.reserve_workbook_edit_call(e,l,3,q,k,repeat('a',64));
   if row<> '{"status":"dispatch","attempt":1}'::jsonb then raise exception 'Dispatch not recorded %',row; end if;
   if not public.complete_workbook_edit_call(e,l,3,q,k,repeat('a',64),1,'{"value":{"answer":"saved"}}') then raise exception 'Result not saved'; end if;
   -- A lost completion response is safe to retry and cannot replace the first result.
   perform public.complete_workbook_edit_call(e,l,3,q,k,repeat('a',64),1,'{"value":"replacement"}');
   row:=public.reserve_workbook_edit_call(e,l,3,q,k,repeat('a',64));
   if row->>'status'<>'saved' or row->'result'<> '{"value":{"answer":"saved"}}'::jsonb then raise exception 'Completed result not reused %',row; end if;
   for n in 2..5 loop
     row:=public.reserve_workbook_edit_call(e,l,3,q,k,repeat('b',64));
     if row->>'attempt'<>n::text then raise exception 'Uncertain attempt lost %',row; end if;
   end loop;
   if public.reserve_workbook_edit_call(e,l,3,q,k,repeat('b',64))->>'status'<>'limit' then raise exception 'Sixth dispatch allowed'; end if;
 end loop;
 update public.workbook_edits set heartbeat_at=now()-interval '7 minutes' where id=e;
 if public.complete_workbook_edit_call(e,l,3,'','write',repeat('b',64),5,'{"value":"late"}') then raise exception 'Expired result accepted'; end if;
 if not public.claim_workbook_edit(e,newer,'server') then raise exception 'Recovery claim failed'; end if;
 if public.complete_workbook_edit_call(e,l,3,'','write',repeat('b',64),5,'{"value":"late"}') then raise exception 'Replaced result accepted'; end if;
 if public.reserve_workbook_edit_call(e,newer,3,'','write',repeat('b',64))->>'status'<>'limit' then raise exception 'Recovery reset budget'; end if;
 if public.reserve_workbook_edit_call(e,newer,3,'','write',repeat('a',64))->>'status'<>'saved' then raise exception 'Recovery lost completed result'; end if;
 perform public.checkpoint_workbook_edit(e,newer,3,'{"error":"The AI call limit of 5 was reached. Edit the comment and try again.","pending":true}');
 perform public.finish_workbook_edit(e,newer,null,null,'[]','No comments could be applied. The workbook is unchanged.');
 if not exists(select 1 from public.workbook_comments where batch_id=e and status='pending') then raise exception 'Exhausted comment did not return to pending'; end if;
 if (select count(*) from public.workbook_edit_calls where batch_id=e)<>10 then raise exception 'Ledger count incorrect'; end if;
 if not (select relrowsecurity from pg_class where oid='public.workbook_edit_calls'::regclass) then raise exception 'RLS disabled'; end if;
 if has_table_privilege('authenticated','public.workbook_edit_calls','insert') then raise exception 'Authenticated ledger writes allowed'; end if;
 if has_function_privilege('authenticated','public.reserve_workbook_edit_call(uuid,uuid,int,text,text,text)','execute') then raise exception 'Dispatch RPC exposed'; end if;
 if has_function_privilege('anon','public.complete_workbook_edit_call(uuid,uuid,int,text,text,text,int,jsonb)','execute') then raise exception 'Completion RPC exposed'; end if;
 -- This family's existing database records return on rollback. No external provider or storage action runs.
 delete from public.parents where id=source.parent_id;
 if exists(select 1 from public.workbook_edit_calls where batch_id=e) then raise exception 'Family deletion left ledger rows'; end if;
end $$;
rollback;
select 'PASS: writer and solve dispatches, immutable results, uncertain attempts, five-call cap, lease checks, pending comment, RLS, RPC grants, family cascade; all writes rolled back' as result;
