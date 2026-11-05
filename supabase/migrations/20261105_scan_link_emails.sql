-- "Email me the link" on the Scan pages tab (#564, spec #544, D-246): one row per email a parent asked for, so the
-- server can send at most a few an hour to one parent (src/lib/scan-link.ts). The email holds only the page's address
-- (no token), so a row is a send record, not a credential.
-- Only the server touches this table: the secret key (service_role skips row-level security) reads and writes it. Row-
-- level security is on with no policy and no grant for anon or authenticated. A family deletion removes the rows with
-- the parent and the child (on delete cascade), and the family write fence covers new rows.
-- Additive: a new table and one new service-only function that the code on main does not use.
--
-- status: 'claimed' when counted, before the send; 'sent' with Resend's email id; 'failed' when Resend refused it. A row
-- left 'claimed' belongs to a send with no known outcome. Every row counts toward the limit, whatever its status.
create table public.scan_link_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  email_id text check (char_length(email_id) <= 100),
  error text check (char_length(error) <= 500)
);
create index scan_link_emails_parent_idx on public.scan_link_emails (parent_id, created_at);
create index scan_link_emails_child_idx on public.scan_link_emails (child_id);

alter table public.scan_link_emails enable row level security;
revoke all on table public.scan_link_emails from anon, authenticated;

create trigger fence_family_write before insert or update on public.scan_link_emails
  for each row execute function public.fence_family_write();

-- Counts one email for the parent under a per-parent lock, so requests sent together cannot all pass the limit.
-- Returns the new row's id, or null when the child is not the parent's or the parent already has p_max rows in the
-- last p_window_seconds.
create function public.claim_scan_link_email(p_parent uuid, p_child uuid, p_max int, p_window_seconds int)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('scan_link_emails:' || p_parent::text, 0));
  if not exists (select 1 from public.children where id = p_child and parent_id = p_parent) then return null; end if;
  if (select count(*) from public.scan_link_emails
      where parent_id = p_parent and created_at > now() - make_interval(secs => p_window_seconds)) >= p_max then
    return null;
  end if;
  insert into public.scan_link_emails (parent_id, child_id) values (p_parent, p_child) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.claim_scan_link_email(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.claim_scan_link_email(uuid, uuid, int, int) to service_role;
