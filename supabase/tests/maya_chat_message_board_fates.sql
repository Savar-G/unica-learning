-- #1084: run after maya_chat_message_board_fates through Supabase execute_sql as the database owner.
-- Requires one marked test family. Synthetic writes roll back; this is not a migration bootstrap.
begin;
do $probe$
declare
 p uuid; ch uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 original uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); r jsonb; n integer;
 wstart timestamptz:=clock_timestamp()-interval '1 hour'; wend timestamptz:=clock_timestamp()+interval '23 hours';
 fates jsonb:='[{"batchId":"held-batch","fate":"skipped"}]';
 bad jsonb; many jsonb; role_name text; statement text;
begin
 select t.parent_id into p from public.test_accounts t join public.parents x on x.id=t.parent_id
 where x.deletion_requested_at is null order by t.parent_id limit 1;
 if p is null then raise exception 'Needs an existing marked test family'; end if;
 insert into public.children(id,parent_id,first_name,grade,province) values(ch,p,'Synthetic recovery probe',3,'BC');
 insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live)
 select x,p,ch,'chat','text','workbook',gen_random_uuid(),1,1,'synthetic-recovery','sha256:'||repeat('0',64),'fake','probe','{}','{}' from unnest(array[a,b]) x;
 execute 'set local role service_role';
 if current_user<>'service_role' then raise exception 'Service impersonation failed'; end if;
 if not public.maya_chat_fates_valid('[]') or not public.maya_chat_fates_valid(fates)
 or not public.maya_chat_fates_valid('[{"batchId":"a","fate":"shown"},{"batchId":"b","fate":"cancelled"}]')
 then raise exception 'Valid report rejected'; end if;
 foreach bad in array array['null'::jsonb,'{}'::jsonb,'1'::jsonb,'[null]'::jsonb,'[{}]'::jsonb,
 '[{"batchId":"a","fate":"hidden"}]'::jsonb,'[{"batchId":"","fate":"shown"}]'::jsonb,
 '[{"batchId":1,"fate":"shown"}]'::jsonb,'[{"batchId":"a","fate":null}]'::jsonb,
 '[{"batchId":"a","fate":"shown","extra":1}]'::jsonb,
 '[{"batchId":"a","fate":"shown"},{"batchId":"a","fate":"skipped"}]'::jsonb,
 jsonb_build_array(jsonb_build_object('batchId',repeat('a',65),'fate','shown'))] loop
   if public.maya_chat_fates_valid(bad) then raise exception 'Malformed report accepted'; end if;
 end loop;
 if public.maya_chat_fates_valid(null) then raise exception 'SQL null report accepted'; end if;
 select jsonb_agg(jsonb_build_object('batchId','batch-'||x,'fate','shown')) into many from generate_series(1,32) x;
 if not public.maya_chat_fates_valid(many) or public.maya_chat_fates_valid(many||jsonb_build_array(jsonb_build_object('batchId','batch-33','fate','shown'))) then raise exception 'Report bound failed'; end if;
 r:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),wstart,wend,'Original child words','{}');
 if r->>'status'<>'invalid' or (select revision from public.maya_calls where id=a)<>0 then raise exception 'Invalid report changed admission'; end if;
 r:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),wstart,wend,'Original child words',fates);
 if r->>'status'<>'accepted' or r->>'text'<>'Original child words' or r->'fates'<>fates then raise exception 'New admission lost payload'; end if;
 r:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),wstart,wend,'Changed child words','[]');
 if r->>'status'<>'busy' then raise exception 'Retry did not retain its lease'; end if;
 update public.maya_chat_messages set lease_until=clock_timestamp()-interval '1 minute' where id=original;
 r:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),wstart,wend,'Changed child words','[]');
 if r->>'status'<>'accepted' or r->>'text'<>'Original child words' or r->'fates'<>fates then raise exception 'Expired retry replaced the first payload'; end if;
 if (select count(*) from public.maya_chat_messages where child_id=ch)<>1 then raise exception 'Retry created a second receipt'; end if;
 update public.maya_chat_messages set lease_until=clock_timestamp()-interval '1 minute' where id=original;
 r:=public.recover_maya_chat_message(p,ch);
 if r->>'status'<>'accepted' or r->>'id'<>original::text or r->>'text'<>'Original child words' or r->'fates'<>fates then raise exception 'Recovery lost payload'; end if;
 if public.recover_maya_chat_message(p,ch)->>'status'<>'busy' then raise exception 'Recovery lease was not exclusive'; end if;
 update public.maya_calls set revision=revision+1 where id=a and revision=2;get diagnostics n=row_count;
 if n<>0 then raise exception 'Old owner wrote after recovery'; end if;
 if public.recover_maya_chat_message(gen_random_uuid(),ch)->>'status'<>'not_found' then raise exception 'Cross-family recovery accepted'; end if;
 update public.maya_calls set revision=revision+1 where id=a;
 if public.recover_maya_chat_message(p,ch)->>'status'<>'none' then raise exception 'Committed call still pending'; end if;
 r:=public.take_maya_chat_message(legacy,p,ch,b,0,repeat('b',64),wstart,wend,'Legacy child words');
 if r->>'status'<>'accepted' or r->'fates'<>'[]'::jsonb then raise exception 'Old signature failed'; end if;
 update public.maya_chat_messages set board_fates=null,lease_until=clock_timestamp()-interval '1 minute' where id=legacy;
 r:=public.recover_maya_chat_message(p,ch);
 if r->>'status'<>'accepted' or r->>'text'<>'Legacy child words' or r->'fates'<>'[]'::jsonb then raise exception 'Legacy null report failed'; end if;
 begin
   update public.maya_chat_messages set board_fates='{}' where id=legacy;
   raise exception 'Malformed stored report accepted';
 exception when check_violation then null;
 end;
 execute 'reset role';
 foreach role_name in array array['anon','authenticated'] loop
   execute format('set local role %I',role_name);
   if current_user<>role_name then raise exception 'Browser impersonation failed'; end if;
   foreach statement in array array[
     'select public.maya_chat_fates_valid(''[]''::jsonb)',
     format('select public.take_maya_chat_message(%L,%L,%L,%L,0,%L,now(),now()+interval ''1 day'',%L)',original,p,ch,a,repeat('a',64),'Probe'),
     format('select public.take_maya_chat_message(%L,%L,%L,%L,0,%L,now(),now()+interval ''1 day'',%L,''[]''::jsonb)',original,p,ch,a,repeat('a',64),'Probe'),
     format('select public.recover_maya_chat_message(%L,%L)',p,ch)
   ] loop
     begin execute statement;raise exception 'Browser function accepted';exception when insufficient_privilege then null;end;
   end loop;
   execute 'reset role';
 end loop;
end;
$probe$;
rollback;
select json_build_object('validator_bounds','passed','original_payload_and_retry','passed','recovery_and_fence','passed','legacy_signature_and_null','passed','browser_calls_refused',8) as proof;
