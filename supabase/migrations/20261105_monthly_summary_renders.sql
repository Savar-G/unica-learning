-- The monthly summary PDF (#562, D-248): one row per summary a parent asked for, so every function instance shares one
-- count of a parent's tries (src/lib/monthly-summary.ts: 5 in 10 minutes). Before this, each instance counted in its
-- own memory, so two instances allowed twice the limit. A row holds only the parent and the time: no child, no month,
-- nothing of the summary itself.
-- Only the server touches this table: the secret key (service_role skips row-level security) reaches it through
-- claim_monthly_summary_render. Row-level security is on with no policy and no grant for anon or authenticated. A family
-- deletion removes the rows with the parent (on delete cascade), and the family write fence covers new rows.
-- Additive: a new table and one new service-only function that the code on main does not use.
create table public.monthly_summary_renders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade
);
create index monthly_summary_renders_parent_idx on public.monthly_summary_renders (parent_id, created_at);

alter table public.monthly_summary_renders enable row level security;
revoke all on table public.monthly_summary_renders from anon, authenticated;

create trigger fence_family_write before insert or update on public.monthly_summary_renders
  for each row execute function public.fence_family_write();

-- Counts one try for the parent under a per-parent lock, so tries sent together cannot all pass the limit. Returns true
-- when counted, false (and counts nothing) when the parent already has p_max tries in the last p_window_seconds. The
-- parent's tries older than the window are deleted first, so the table stays small.
create function public.claim_monthly_summary_render(p_parent uuid, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('monthly_summary_renders:' || p_parent::text, 0));
  delete from public.monthly_summary_renders
    where parent_id = p_parent and created_at <= now() - make_interval(secs => p_window_seconds);
  if (select count(*) from public.monthly_summary_renders where parent_id = p_parent) >= p_max then
    return false;
  end if;
  insert into public.monthly_summary_renders (parent_id) values (p_parent);
  return true;
end $$;
revoke all on function public.claim_monthly_summary_render(uuid, int, int) from public, anon, authenticated;
grant execute on function public.claim_monthly_summary_render(uuid, int, int) to service_role;
