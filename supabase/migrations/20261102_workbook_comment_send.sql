-- A concurrent or stale send must ask the admin to reload.
create or replace function public.send_workbook_comments(p_draft uuid,p_revision int,p_by uuid,p_email text,p_runner text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb; v_page int;
begin
  perform 1 from public.workbook_drafts where id=p_draft for no key update;
  if exists(select 1 from public.workbook_edits where draft_id=p_draft and status in ('queued','running'))
    or p_revision is distinct from (select max(revision) from public.workbook_draft_revisions where draft_id=p_draft) then
    return jsonb_build_object('status','refused','reason','This workbook changed or has comments in progress. Reload the page.');
  end if;
  select min(page_number) into v_page from public.workbook_comments where draft_id=p_draft and revision=p_revision and status in ('pending','failed');
  if v_page is null then return jsonb_build_object('status','refused','reason','Add a comment first.'); end if;
  v_result:=public.queue_workbook_edit(p_draft,p_revision,v_page,null,'redo-page','Review comments',null,p_by,p_email,p_runner);
  if v_result->>'status'<>'queued' then return v_result; end if;
  v_id:=(v_result->>'id')::uuid;
  update public.workbook_comments set batch_id=v_id,status='sent',error=null where draft_id=p_draft and revision=p_revision and status in ('pending','failed');
  return v_result;
end $$;
