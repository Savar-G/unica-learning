-- Allow the scheduled physical cleanup to finish before the 24-hour abandonment limit.
create or replace function public.expire_scan_photos() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.scan_photos s set state='expired',terminal_at=now()
    where state not in ('deleted','expired','rejected') and
      (expires_at<=now() or (state<>'saved' and created_at<=now()-interval '23 hours 30 minutes') or (state in ('reserved','processing') and lease_until<=now()))
      and exists(select 1 from public.parents p where p.id=s.parent_id and p.deletion_requested_at is null);
end $$;
