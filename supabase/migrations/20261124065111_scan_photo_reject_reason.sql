alter table public.scan_photos
  add column reject_reason text
    constraint scan_photos_reject_reason_check check (reject_reason in (
      'qr', 'size', 'image', 'flat', 'page', 'duplicate', 'refused', 'expired', 'busy', 'unavailable', 'unexpected'
    ));

-- Keep the same family fence and terminal-state behavior as change_scan_photo.
create function public.reject_scan_photo(p_parent uuid, p_id uuid, p_reason text)
returns text
language plpgsql security invoker set search_path = '' as $$
declare current_state text;
begin
  perform public.assert_family_writable(p_parent);
  select state into current_state from public.scan_photos
    where id = p_id and parent_id = p_parent for update;
  if not found then return 'refused'; end if;
  if current_state in ('deleted', 'expired', 'rejected') then return current_state; end if;

  update public.scan_photos
    set state = 'rejected', terminal_at = now(), reject_reason = p_reason
    where id = p_id and parent_id = p_parent;
  return 'rejected';
end $$;

revoke all on function public.reject_scan_photo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_scan_photo(uuid, uuid, text) to service_role;
