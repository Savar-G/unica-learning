-- Two changes after review round 5 of PR #593 (#554). Additive: it adds columns and functions, and it replaces functions with the same
-- arguments. It changes no row, and it creates no deletion request.
--
-- 1. An open plan start record now refuses a family's deletion. The start route lets go of the card hold when Stripe's answer is
-- unknown, and the create can still land. A family removed in that time leaves a subscription that charges later. So while a family
-- has a plan_starts row in state 'open', no path may queue or freeze it:
--   - check_parent_family_deletion, begin_family_delete_hold and request_parent_family_deletion_held answer 'plan_start' (self-serve);
--   - request_parent_family_deletion answers the same (no caller today);
--   - request_family_deletion answers the same (an admin's request);
--   - claim_family_deletion and claim_family_retention answer the state 'plan_start', so the worker keeps the family and counts it.
-- No race: the route takes the card hold before it opens a record, and lets go of the hold only after the record is written, so each
-- path sees one or the other under the parent's row lock. A record opened under a fence is refused by the fence. A job already in
-- phase 'deleting' goes on: it holds no record that could still matter, as a fenced family cannot open one.
-- A record leaves 'open' by finish_plan_start (the plan was found) or team_end_plan_start (an admin's check). Then deletion works.
--
-- 2. The plan start email gets one send ledger per generation, on the record. Its old ledger is one row in workbook_emails per card
-- setup, so a second generation read the first one's 'sent' claim and never got an email. The check on workbook_emails holds
-- plan_start rows at workbook_number 0, so they stay one per card setup, and the ledger moves here. An old plan_start row stays as it
-- is stored, as generation 0: a start from before these records, which answers for no generation. The new columns follow that table's.

alter table public.plan_starts
  add column email_send_status text check (email_send_status in ('sending', 'sent', 'failed', 'unknown')),
  add column email_claim_token uuid,
  add column email_claimed_at timestamptz,
  add column email_attempts integer not null default 0 check (email_attempts >= 0),
  add column email_sent_at timestamptz,
  add column email_provider_id text check (char_length(email_provider_id) <= 255),
  add column email_error text check (char_length(email_error) <= 500),
  add column email_to text,
  add column email_subject text,
  add column email_text text,
  add column email_html text;

create function public.family_plan_start_open(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.plan_starts s where s.parent_id = p and s.state = 'open');
$$;
revoke all on function public.family_plan_start_open(uuid) from public, anon, authenticated, service_role;

create or replace function public.check_parent_family_deletion(p uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p)
    or exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_until > clock_timestamp()) then return 'busy'; end if;
  if public.family_plan_start_open(p) then return 'plan_start'; end if;
  return 'ready';
end $$;

create or replace function public.begin_family_delete_hold(p uuid, hold uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p)
    or exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_until > clock_timestamp() and h.lease_token <> hold) then return 'busy'; end if;
  if public.family_plan_start_open(p) then return 'plan_start'; end if;
  insert into public.family_delete_holds(parent_id, lease_token, lease_until) values (p, hold, clock_timestamp() + interval '5 minutes')
    on conflict (parent_id) do update set lease_token = excluded.lease_token, lease_until = excluded.lease_until;
  return 'held';
end $$;

create or replace function public.request_parent_family_deletion_held(p uuid, hold uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if not exists(select 1 from public.family_delete_holds h where h.parent_id = p and h.lease_token = hold and h.lease_until > clock_timestamp())
    or exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  if public.family_plan_start_open(p) then return 'plan_start'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason, plans_stopped_at) values (p, 'request', now())
    on conflict (parent_id) do update set reason = 'request', plans_stopped_at = excluded.plans_stopped_at;
  update public.family_delete_holds set lease_until = '-infinity' where parent_id = p;
  return 'requested';
end $$;

create or replace function public.request_parent_family_deletion(p uuid, check_only boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  if public.family_plan_start_open(p) then return 'plan_start'; end if;
  if check_only then return 'ready'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason) values (p, 'request')
    on conflict (parent_id) do update set reason = 'request';
  return 'requested';
end $$;

create or replace function public.request_family_deletion(p uuid, confirmation text) returns text
language plpgsql security definer set search_path = '' as $$
declare mail text;
begin
  perform 1 from public.admin_users where user_id = auth.uid() for share;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  select email into mail from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if confirmation is distinct from mail then return 'confirmation'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  if public.family_plan_start_open(p) then return 'plan_start'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason) values(p, 'request')
    on conflict(parent_id) do update set reason = 'request';
  return 'requested';
end $$;

create or replace function public.claim_family_deletion(p uuid, token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions; exists_parent boolean;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  select * into q from public.family_deletions where parent_id = p for update;
  if not found then
    if not exists_parent or not coalesce(public.family_retention_due(p),false) then return jsonb_build_object('state','excluded'); end if;
    if public.family_plan_start_open(p) then return jsonb_build_object('state','plan_start'); end if;
    update public.parents set deletion_requested_at = now() where id = p;
    insert into public.family_deletions(parent_id,reason) values(p,'retention') returning * into q;
  elsif q.phase = 'checking' and public.family_plan_start_open(p) then
    return jsonb_build_object('state','plan_start');
  end if;
  if q.lease_until > now() and q.lease_token is distinct from token then return jsonb_build_object('state','busy'); end if;
  update public.family_deletions set lease_token = token, lease_until = now() + interval '5 minutes' where parent_id = p;
  return jsonb_build_object('state','ready','reason',q.reason,'phase',q.phase);
end $$;

create or replace function public.claim_family_retention(p uuid, token uuid, subscription_ended_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare exists_parent boolean;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  if subscription_ended_at is null or exists(select 1 from public.family_deletions where parent_id = p) then
    return public.claim_family_deletion(p, token);
  end if;
  if not exists_parent
    or exists(select 1 from public.admin_users where user_id = p)
    or exists(select 1 from public.family_card_operations where parent_id = p)
    or public.family_retention_cards(p) = '[]'::jsonb
    or subscription_ended_at > now()
    or subscription_ended_at + interval '6 months' > now() then
    return jsonb_build_object('state', 'excluded');
  end if;
  if public.family_plan_start_open(p) then return jsonb_build_object('state', 'plan_start'); end if;
  update public.parents set deletion_requested_at = now() where id = p;
  insert into public.family_deletions(parent_id, reason) values (p, 'retention');
  return public.claim_family_deletion(p, token);
end $$;

-- The plan start email's send ledger. A claim needs a started record whose email is still due, with no claim held and none final.
create function public.claim_plan_start_email(p_card uuid, p_generation integer, p_token uuid, p_message jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_starts s set
    email_send_status = 'sending', email_claim_token = p_token, email_claimed_at = now(), email_attempts = s.email_attempts + 1, email_error = null,
    email_to = p_message->>'to', email_subject = p_message->>'subject', email_text = p_message->>'text', email_html = p_message->>'html'
    where s.card_setup_id = p_card and s.generation = p_generation and s.state = 'started' and s.email_state = 'pending'
      and (s.email_send_status is null or s.email_send_status = 'failed');
  return found;
end $$;

-- A claim's outcome: sent and unknown are final, and failed may be claimed again.
create function public.note_plan_start_email_send(p_card uuid, p_generation integer, p_token uuid, p_status text, p_email_id text, p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'failed', 'unknown') then
    raise exception 'plan_start_bad_email_status' using errcode = '22023';
  end if;
  update public.plan_starts s set
    email_send_status = p_status, email_provider_id = left(p_email_id, 255), email_error = left(p_error, 500),
    email_sent_at = case when p_status = 'sent' then now() else s.email_sent_at end
    where s.card_setup_id = p_card and s.generation = p_generation and s.email_claim_token = p_token and s.email_send_status = 'sending';
  return found;
end $$;

-- Nothing was sent: the claim goes back as if it was never taken.
create function public.release_plan_start_email(p_card uuid, p_generation integer, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_starts s set
    email_send_status = null, email_claim_token = null, email_claimed_at = null, email_attempts = greatest(s.email_attempts - 1, 0), email_error = null
    where s.card_setup_id = p_card and s.generation = p_generation and s.email_claim_token = p_token and s.email_send_status = 'sending';
  return found;
end $$;

revoke all on function public.claim_plan_start_email(uuid, integer, uuid, jsonb),
  public.note_plan_start_email_send(uuid, integer, uuid, text, text, text),
  public.release_plan_start_email(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_plan_start_email(uuid, integer, uuid, jsonb),
  public.note_plan_start_email_send(uuid, integer, uuid, text, text, text),
  public.release_plan_start_email(uuid, integer, uuid) to service_role;
