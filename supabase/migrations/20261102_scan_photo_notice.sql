-- Per-parent acknowledgement survives photo deletion and expiry, but not family deletion.
create table public.scan_photo_notices (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);
alter table public.scan_photo_notices enable row level security;
revoke all on public.scan_photo_notices from anon,authenticated;
grant all on public.scan_photo_notices to service_role;
grant select on public.scan_photo_notices to authenticated;
create policy scan_notice_family_read on public.scan_photo_notices for select to authenticated
  using (parent_id=(select auth.uid()));
create trigger fence_family_write before insert or update on public.scan_photo_notices
  for each row execute function public.fence_family_write();

create function public.acknowledge_scan_photo_notice(p_parent uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_family_writable(p_parent);
  insert into public.scan_photo_notices(parent_id) values(p_parent) on conflict(parent_id) do nothing;
  return true;
end $$;
revoke all on function public.acknowledge_scan_photo_notice(uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_scan_photo_notice(uuid) to service_role;

create function public.remember_saved_scan_photo_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state='saved' then perform public.acknowledge_scan_photo_notice(new.parent_id); end if;
  return new;
end $$;
revoke all on function public.remember_saved_scan_photo_notice() from public,anon,authenticated;
create trigger remember_saved_scan_photo_notice after insert or update of state on public.scan_photos
  for each row execute function public.remember_saved_scan_photo_notice();
