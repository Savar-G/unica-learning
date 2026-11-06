-- A previous Send is history, not a current sheet check (#456, PR637 review).
-- The return value must use the same active-photo, revision and numeric check-version rules as the update.
-- Keep sent_at unchanged when an earlier sent page passes its recheck. No stored history is removed.
create or replace function public.send_scan_photos(p_parent uuid, p_child uuid, p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare sent uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  perform 1 from public.scan_photos where parent_id = p_parent and id = any(p_ids) order by id for update;
  update public.scan_photos s set sent_at = now()
    from public.scan_calibrations c
    where s.parent_id = p_parent and s.child_id = p_child and s.id = any(p_ids) and s.sent_at is null and s.state = 'saved'
      and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.photo_id = s.id and c.parent_id = s.parent_id and c.state = 'ready' and c.printed_revision = s.printed_revision
      and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1;
  select coalesce(array_agg(s.id order by s.id), '{}') into sent
    from public.scan_photos s join public.scan_calibrations c on c.photo_id = s.id and c.parent_id = s.parent_id
    where s.parent_id = p_parent and s.child_id = p_child and s.id = any(p_ids) and s.sent_at is not null and s.state = 'saved'
      and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.state = 'ready' and c.printed_revision = s.printed_revision
      and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1;
  return sent;
end $$;

revoke all on function public.send_scan_photos(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.send_scan_photos(uuid, uuid, uuid[]) to service_role;
