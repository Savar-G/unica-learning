-- Apply after 20261011_add_family_deletion.sql. No claims, deletions or operator-hold releases.
create function public.renew_family_deletion_work(p uuid, token uuid) returns boolean
language sql security definer set search_path = '' as $$
  with renewed as (
    update public.family_deletions d set lease_until = now() + interval '5 minutes'
    where d.parent_id = p and d.lease_token = token and d.lease_until > now()
      and d.phase in ('checking','deleting')
      and (d.phase = 'deleting' or not exists(select 1 from public.family_card_operations c where c.parent_id = p))
    returning 1
  ) select exists(select 1 from renewed);
$$;
revoke all on function public.renew_family_deletion_work(uuid,uuid) from public, anon, authenticated;
grant execute on function public.renew_family_deletion_work(uuid,uuid) to service_role;
