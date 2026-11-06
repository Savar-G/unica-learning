-- Synthetic family only. The entire probe rolls back, including copies and Storage metadata.
begin;
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid(); card uuid:=gen_random_uuid(); res boolean;
begin
  insert into auth.users(id,email) values(p,'child-delete-probe@example.invalid');
  insert into public.parents(id,name,email) values(p,'Probe','child-delete-probe@example.invalid');
  insert into public.test_accounts(parent_id,marked_by) values(p,p);
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Remove',2,'BC'),(sibling,p,'Keep',2,'BC');
  insert into public.assessments(id,parent_id,child_id,grade,province,test,seed) values(a,p,c,2,'BC','{}',1),(sa,p,sibling,2,'BC','{}',1);
  if public.check_child_deletion(p,c)<>'ready' then raise exception 'initial check'; end if;
  if public.check_child_deletion(gen_random_uuid(),c)='ready' then raise exception 'wrong owner'; end if;
  if public.begin_family_delete_hold(p,h)<>'held' then raise exception 'hold'; end if;
  if public.request_child_deletion_held(p,c,h)<>'requested' then raise exception 'request'; end if;
  if not public.claim_child_deletion(p,c,tok) then raise exception 'claim'; end if;
  if public.claim_child_deletion(p,c,gen_random_uuid()) then raise exception 'two workers'; end if;
  begin
    update public.children set first_name='Late' where id=c;
    raise exception 'child write was allowed';
  exception when sqlstate '55000' then null; end;
  update public.children set first_name='Sibling stays' where id=sibling;
  begin
    insert into public.assessments(parent_id,child_id,grade,province,test,seed) values(p,c,2,'BC','{}',1);
    raise exception 'new test was allowed';
  exception when sqlstate '55000' then null; end;
  if public.confirm_child_copies(p,c,tok) then raise exception 'missing copy passed'; end if;
  if public.complete_child_deletion(p,c,tok) then raise exception 'removed without copy'; end if;
  perform public.save_family_test_copy(p,tok,a,jsonb_build_object('copyVersion',2,'grade',2,'province','BC','testMonth',to_char(now(),'YYYY-MM'),'testFamily',true,'questions','[]'::jsonb));
  if not public.confirm_child_copies(p,c,tok) then raise exception 'copy not saved'; end if;
  begin
  insert into storage.objects(bucket_id,name) values('shown-work',p::text||'/'||sa::text||'/keep.png');
  begin
    insert into storage.objects(bucket_id,name) values('shown-work',p::text||'/'||a::text||'/late.png');
    raise exception 'upload was allowed';
  exception when sqlstate '55000' then null; end;
  if not public.complete_child_deletion(p,c,tok) then raise exception 'complete'; end if;
  if exists(select 1 from public.children where id=c) or exists(select 1 from public.assessments where id=a) then raise exception 'child rows remain'; end if;
  if not exists(select 1 from public.children where id=sibling and first_name='Sibling stays') or not exists(select 1 from public.assessments where id=sa) then raise exception 'sibling removed'; end if;
  if not exists(select 1 from storage.objects where bucket_id='shown-work' and name=p::text||'/'||sa::text||'/keep.png') then raise exception 'sibling file removed'; end if;
  raise exception 'rollback synthetic file' using errcode='P5555';
  exception when sqlstate 'P5555' then null; end;
  if not public.complete_child_deletion(p,c,tok) then raise exception 'complete after file probe'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('shown-work',p::text||'/'||a::text||'/late-after-delete.png');
    raise exception 'late upload restored a deleted file';
  exception when sqlstate '55000' then null; end;
  -- Last child, with its test copied first.
  perform public.begin_family_delete_hold(p,h);
  perform public.request_child_deletion_held(p,sibling,h);
  perform public.claim_child_deletion(p,sibling,tok);
  perform public.save_family_test_copy(p,tok,sa,jsonb_build_object('copyVersion',2,'grade',2,'province','BC','testMonth',to_char(now(),'YYYY-MM'),'testFamily',true,'questions','[]'::jsonb));
  if not public.complete_child_deletion(p,sibling,tok) then raise exception 'last child'; end if;
  if not exists(select 1 from public.parents where id=p) or not exists(select 1 from auth.users where id=p) or exists(select 1 from public.children where parent_id=p) then raise exception 'parent not kept empty'; end if;
end $$;
select 'CHILD_DELETE_PROBE_OK' as result;
rollback;
