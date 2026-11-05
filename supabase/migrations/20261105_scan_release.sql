-- Scan pages stack: letting go of an upload slot is not deleting a photo. The browser releases a reservation when the
-- parent gives up on a photo whose answer was lost, but the photo may have reached the server after all. So the server
-- decides, under the family lock that admission and upload start also take: only a reservation whose upload has not
-- started is released. A photo that is processing, pending or saved is answered with its state and left whole. The
-- parent's own Delete stays change_scan_photo. Additive: the live code does not call this function yet.
-- No object can exist for a reservation (upload starts only after start_scan_photo moves it to processing), so the
-- bytes are freed here with no Storage call.
create function public.release_scan_photo(p_parent uuid, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare current_state text;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  select state into current_state from public.scan_photos where id = p_id and parent_id = p_parent for update;
  if not found then return 'refused'; end if;
  if current_state <> 'reserved' then return current_state; end if;
  update public.scan_photos set state = 'rejected', terminal_at = now(), reserved_bytes = 0 where id = p_id;
  return 'released';
end $$;
revoke all on function public.release_scan_photo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_scan_photo(uuid, uuid) to service_role;
