-- Keep the existing Send result for recovery. Count only new transitions for notifications.
create function public.send_scan_photos_receipt(p_parent uuid, p_child uuid, p_ids uuid[])
returns table (sent uuid[], newly_sent uuid[])
language plpgsql security invoker set search_path = '' as $$
declare unsent uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  perform 1 from public.scan_photos where parent_id = p_parent and id = any(p_ids) order by id for update;
  select coalesce(array_agg(id), '{}') into unsent from public.scan_photos
    where parent_id = p_parent and child_id = p_child and id = any(p_ids) and sent_at is null;
  sent := public.send_scan_photos(p_parent, p_child, p_ids);
  select coalesce(array_agg(id order by id), '{}') into newly_sent
    from unnest(sent) as ids(id) where id = any(unsent);
  return next;
end $$;
revoke all on function public.send_scan_photos_receipt(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.send_scan_photos_receipt(uuid, uuid, uuid[]) to service_role;
