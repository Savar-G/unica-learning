-- S8. Read-only history. No new retained table, bucket, release switch or paid work.
create index scan_history_jobs_page on public.scan_marking_jobs(page_id,printed_revision);
create index scan_history_photos_page on public.scan_photos(page_id,printed_revision,created_at,id);
-- The existing RPC name preserves generated-type checking and all S4/S5 mutations.
alter function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) rename to scan_marking_saved_command;
revoke all on function public.scan_marking_saved_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.scan_marking_command(p_action text,p_parent uuid,p_photo uuid,p_token uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb; monitoring boolean;
begin
  if p_action not in ('history','monitor') then
    return public.scan_marking_saved_command(p_action,p_parent,p_photo,p_token,p_data);
  end if;
  monitoring:=p_action='monitor';
  if monitoring then
    if p_parent is not null or not exists(select 1 from public.admin_users where user_id=(p_data->>'admin')::uuid) then return 'null'; end if;
  else
    perform public.assert_family_writable(p_parent);
    if p_data->>'child' is null or not exists(select 1 from public.children where id=(p_data->>'child')::uuid and parent_id=p_parent)
      or exists(select 1 from public.child_deletions where child_id=(p_data->>'child')::uuid) then return 'null'; end if;
  end if;
  -- Each page, its canonical marks and all linked spend share one SQL statement snapshot.
  with pages as materialized (
    select p.id,p.workbook_id,p.page_number,p.day_label,w.printed_revision,w.number,w.child_id,c.first_name
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id and w.parent_id=p.parent_id
      join public.children c on c.id=w.child_id and c.parent_id=w.parent_id
      join public.parents f on f.id=w.parent_id
    where w.status='shipped' and w.printed_revision is not null and p.day_label is not null
      and f.deletion_requested_at is null and not exists(select 1 from public.child_deletions d where d.child_id=c.id)
      and (monitoring or w.parent_id=p_parent)
      and (p_data->>'child' is null or w.child_id=(p_data->>'child')::uuid)
      and (p_data->>'workbook' is null or w.id=(p_data->>'workbook')::uuid)
      and p.id>coalesce((p_data->>'after')::uuid,'00000000-0000-0000-0000-000000000000')
    order by p.id limit 100
  ), records as (
    select p.id,p.workbook_id as "workbookId",p.number as book,p.child_id as "childId",p.first_name as "childName",
      p.printed_revision as revision,p.day_label as day,p.page_number as "pageNumber",
      (select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from public.scan_marking_items m
        where m.page_id=p.id and m.workbook_id=p.workbook_id and m.child_id=p.child_id and m.printed_revision=p.printed_revision) as marks,
      (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'state',s.state,'expiresAt',s.expires_at,'sentAt',s.sent_at,'at',s.created_at) order by s.created_at,s.id),'[]')
        from public.scan_photos s where s.page_id=p.id and s.workbook_id=p.workbook_id and s.child_id=p.child_id and s.printed_revision=p.printed_revision) as photos,
      (select coalesce(jsonb_agg(jsonb_build_object('photo',j.photo_id,'state',j.state,'blocked',j.blocked_reason,'dispatches',j.dispatches) order by j.photo_id),'[]')
        from public.scan_marking_jobs j where j.page_id=p.id and j.workbook_id=p.workbook_id and j.child_id=p.child_id and j.printed_revision=p.printed_revision) as jobs,
      case when monitoring then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'model',x.model,'at',x.created_at,'reserved',x.reserved_micros,'charged',x.charged_micros,'outcome',case when j.blocked_reason in ('pending','attempts') then 'failed' when exists(select 1 from jsonb_array_elements(case when jsonb_typeof(j.extraction)='array' then j.extraction else '[]'::jsonb end) o where o->>'state'='pending') then 'uncertain' when j.state='finished' then 'finished' else 'pending' end) order by x.id),'[]')
        from public.scan_marking_jobs j join public.scan_marking_dispatches d on d.photo_id=j.photo_id join public.scan_marking_spend x on x.id=d.id
        where j.page_id=p.id and j.workbook_id=p.workbook_id and j.child_id=p.child_id and j.printed_revision=p.printed_revision) else '[]'::jsonb end as spend
    from pages p
  ) select jsonb_build_object('pages',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from records r),
    'budget',case when monitoring then (select jsonb_build_object('period',date_trunc('month',now() at time zone 'UTC')::date,
      'cap',50000000,'reported',coalesce(sum(charged_micros),0),'held',coalesce(sum(coalesce(charged_micros,reserved_micros)),0),
      'unknown',count(*) filter(where charged_micros is null),'reserved',coalesce(sum(reserved_micros) filter(where charged_micros is null),0))
      from public.scan_marking_spend where period=date_trunc('month',now() at time zone 'UTC')::date) else null end) into answer;
  return answer;
end $$;
revoke all on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) to service_role;
