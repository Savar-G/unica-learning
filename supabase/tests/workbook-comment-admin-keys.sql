-- #435: public RPC checks. All fixture writes roll back. No AI calls.
begin;
do $$
declare source public.workbook_drafts%rowtype; d uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
  actor uuid; other_actor uuid:=gen_random_uuid(); first_comment jsonb; second_comment jsonb; retry jsonb; fields jsonb;
  page_number int; n int;
begin
  select wd.* into source from public.workbook_drafts wd
    where exists(select 1 from public.test_accounts t where t.parent_id=wd.parent_id)
      and exists(select 1 from public.workbook_runs r where r.draft_id=wd.id and r.started_by is not null)
    order by wd.created_at desc limit 1;
  if source.id is null then raise exception 'This probe requires a test-family workbook draft'; end if;
  select started_by into actor from public.workbook_runs where draft_id=source.id limit 1;
  insert into public.workbook_drafts
    select (jsonb_populate_record(null::public.workbook_drafts,to_jsonb(source)||jsonb_build_object('id',d,'draft',jsonb_set(source.draft,'{id}',to_jsonb(d))))).*;
  insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,content,rendering,render_problems)
    select d,1,source.parent_id,source.child_id,'generated',null,rendering,'[]'::jsonb
      from public.workbook_draft_revisions where draft_id=source.id order by revision desc limit 1;
  page_number:=(source.draft->'pages'->0->>'number')::int;
  fields:=jsonb_build_object('requestKey',request,'page',page_number,'x',0.5,'y',0.5,'note','First admin note');
  first_comment:=public.save_workbook_comment(d,1,fields,actor,'first@example.com',false);
  second_comment:=public.save_workbook_comment(d,1,fields||'{"note":"Second admin note"}',other_actor,'second@example.com',false);
  if first_comment->>'status' is distinct from 'saved' or second_comment->>'status' is distinct from 'saved'
    or first_comment->>'id' is not distinct from second_comment->>'id' then
    raise exception 'Two admins collided on one request key: %, %',first_comment,second_comment;
  end if;
  -- Retry lookup must precede revision validation and retain the original actor's row.
  retry:=public.save_workbook_comment(d,99,fields,actor,'changed@example.com',false);
  if retry is distinct from first_comment then raise exception 'First admin retry changed identity: %',retry; end if;
  retry:=public.save_workbook_comment(d,99,fields,other_actor,'second@example.com',false);
  if retry is distinct from second_comment then raise exception 'Second admin retry changed identity: %',retry; end if;
  select count(*) into n from public.workbook_comments where draft_id=d;
  if n<>2 then raise exception 'Expected two comments, found %',n; end if;
  if not exists(select 1 from public.workbook_comments where id=(first_comment->>'id')::uuid and actor_id=actor and note='First admin note')
    or not exists(select 1 from public.workbook_comments where id=(second_comment->>'id')::uuid and actor_id=other_actor and note='Second admin note') then
    raise exception 'A retry replaced another admin note';
  end if;
  -- Requests without a client key remain separate creations.
  perform public.save_workbook_comment(d,1,fields-'requestKey',actor,'first@example.com',false);
  perform public.save_workbook_comment(d,1,fields-'requestKey',actor,'first@example.com',false);
  select count(*) into n from public.workbook_comments where draft_id=d;
  if n<>4 then raise exception 'Requests without keys were combined: %',n; end if;
  if has_function_privilege('anon','public.save_workbook_comment(uuid,int,jsonb,uuid,text,boolean)','execute')
    or has_function_privilege('authenticated','public.save_workbook_comment(uuid,int,jsonb,uuid,text,boolean)','execute')
    or not has_function_privilege('service_role','public.save_workbook_comment(uuid,int,jsonb,uuid,text,boolean)','execute') then
    raise exception 'Comment RPC privileges changed';
  end if;
end $$;
rollback;
select 'PASS: two admin keys, stable retries across revision changes, note ownership, requests without keys, service-only RPC; all fixture writes rolled back' as result;
