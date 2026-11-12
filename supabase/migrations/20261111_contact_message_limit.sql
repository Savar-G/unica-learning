-- A server-side limit on the contact form (/api/contact, D-130): one row per accepted message, so every function
-- instance shares one count for the whole site (20 an hour, src/lib/contact-limit.ts). Before this, only a hidden field
-- and a fill time that the browser sends guarded the route, and each accepted POST emails the support address.
-- A row holds only a time: no IP address, no cookie, no name, no email, nothing of the message.
-- Only the server touches this table: the secret key (service_role skips row-level security) reaches it through
-- claim_contact_message. Row-level security is on with no policy and no grant for anon or authenticated.
-- Additive: a new table and one new service-only function that the code on main does not use.
create table public.contact_message_claims (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index contact_message_claims_created_idx on public.contact_message_claims (created_at);

alter table public.contact_message_claims enable row level security;
revoke all on table public.contact_message_claims from anon, authenticated;

-- Counts one message under a site-wide lock, so messages sent together cannot all pass the limit. Returns true when
-- counted, false (and counts nothing) when the site already has p_max in the last p_window_seconds. Rows older than a
-- day are deleted first, so the table stays small.
create function public.claim_contact_message(p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('contact_message_claims', 0));
  delete from public.contact_message_claims where created_at <= now() - interval '1 day';
  if (select count(*) from public.contact_message_claims
        where created_at > now() - make_interval(secs => p_window_seconds)) >= p_max then
    return false;
  end if;
  insert into public.contact_message_claims default values;
  return true;
end $$;
revoke all on function public.claim_contact_message(int, int) from public, anon, authenticated;
grant execute on function public.claim_contact_message(int, int) to service_role;
