-- R477-1: image deadlines remain independent while family deletion waits on another dependency.
-- The exemption permits only server-owned terminal transitions and confirmed byte release.
create function public.fence_scan_photo_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and current_user in ('postgres','service_role','supabase_admin')
    and (to_jsonb(new)-array['state','terminal_at','reserved_bytes','stored_bytes'])
      = (to_jsonb(old)-array['state','terminal_at','reserved_bytes','stored_bytes']) then
    if (old.state not in ('expired','deleted','rejected') and new.state in ('expired','deleted')
        and new.terminal_at is not null and new.reserved_bytes=old.reserved_bytes and new.stored_bytes=old.stored_bytes)
      or (old.state in ('expired','deleted','rejected') and new.state=old.state and new.terminal_at is not distinct from old.terminal_at
        and new.reserved_bytes=0 and new.stored_bytes=0 and not exists(
          select 1 from storage.objects o where o.bucket_id='scan-photos'
          and o.name like old.parent_id::text||'/'||old.id::text||'/%')) then
      -- The expiry/reconciliation functions acquire this lock before the photo lock, like the deletion worker.
      perform 1 from public.parents where id=new.parent_id for share;
      if not found then raise exception 'family_unavailable' using errcode='55000'; end if;
      return new;
    end if;
  end if;
  if tg_op='UPDATE' then perform public.assert_family_writable(old.parent_id); end if;
  perform public.assert_family_writable(new.parent_id);
  return new;
end $$;
revoke all on function public.fence_scan_photo_write() from public,anon,authenticated;
drop trigger fence_family_write on public.scan_photos;
create trigger fence_family_write before insert or update on public.scan_photos
  for each row execute function public.fence_scan_photo_write();

create or replace function public.expire_scan_photos() returns void
language plpgsql security definer set search_path = '' as $$
declare family uuid;
begin
  for family in select distinct parent_id from public.scan_photos
    where state not in ('deleted','expired','rejected') and
      (expires_at<=now() or (state<>'saved' and created_at<=now()-interval '23 hours 30 minutes')
        or (state in ('reserved','processing') and lease_until<=now())) order by parent_id loop
    -- Parent before photo: Auth deletion cannot hold the parent while waiting on our photo lock.
    perform 1 from public.parents where id=family for share;
    if not found then continue; end if;
    update public.scan_photos set state='expired',terminal_at=now()
      where parent_id=family and state not in ('deleted','expired','rejected') and
        (expires_at<=now() or (state<>'saved' and created_at<=now()-interval '23 hours 30 minutes')
          or (state in ('reserved','processing') and lease_until<=now()));
  end loop;
end $$;

create or replace function public.reconcile_scan_cleanup(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare family uuid;
begin
  select parent_id into family from public.scan_photos where id=p_id;
  if not found then return false; end if;
  perform 1 from public.parents where id=family for share;
  if not found then return false; end if;
  update public.scan_photos s set reserved_bytes=0,stored_bytes=0
    where id=p_id and parent_id=family and state in ('deleted','expired','rejected') and not exists
      (select 1 from storage.objects o where o.bucket_id='scan-photos' and o.name like s.parent_id::text||'/'||s.id::text||'/%');
  return found;
end $$;
