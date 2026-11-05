-- Only the service RPCs change the queue. Reading it permits scheduled retries.
revoke all on public.child_deletions from service_role;
grant select on public.child_deletions to service_role;
-- An attempted request goes behind requests not yet attempted on the next scheduled run.
create or replace function public.release_child_deletion(p uuid,c uuid,token uuid) returns void
language sql security definer set search_path = '' as $$
  update public.child_deletions set lease_until=clock_timestamp() where parent_id=p and child_id=c and lease_token=token;
$$;
