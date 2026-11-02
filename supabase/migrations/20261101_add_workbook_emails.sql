-- Welcome after card confirmation, and one dispatch notice per numbered workbook.
-- Existing card setups need an explicit welcome action; do not email old families on deployment.
alter table public.card_setups add column workbook_welcome_enabled boolean not null default false;
alter table public.card_setups alter column workbook_welcome_enabled set default true;
alter table public.card_setups add column workbook_email_checked_at timestamptz;
create index card_setups_workbook_check_idx on public.card_setups(workbook_email_checked_at nulls first, id)
  where workbook_welcome_enabled and card_saved_at is null and stripe_customer_id is not null;

create table public.workbook_emails (
  id uuid primary key default gen_random_uuid(),
  card_setup_id uuid not null references public.card_setups(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  kind text not null check (kind in ('welcome', 'dispatch')),
  workbook_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped')),
  delivery jsonb not null default '{}'::jsonb,
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  email_id text check (char_length(email_id) <= 100),
  error text check (char_length(error) <= 500),
  to_address text check (char_length(to_address) <= 320),
  subject text check (char_length(subject) <= 500),
  text_body text check (char_length(text_body) <= 200000),
  html_body text check (char_length(html_body) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'welcome' and workbook_number = 0) or (kind = 'dispatch' and workbook_number between 1 and 10000)),
  unique (card_setup_id, kind, workbook_number)
);
create index workbook_emails_parent_idx on public.workbook_emails(parent_id);
create index workbook_emails_pending_idx on public.workbook_emails(created_at) where kind = 'welcome' and status in ('pending', 'failed');
alter table public.workbook_emails enable row level security;
revoke all on public.workbook_emails from anon, authenticated;
grant all on public.workbook_emails to service_role;
grant select on public.workbook_emails to authenticated;
create policy "Admins read workbook emails" on public.workbook_emails for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_emails
  for each row execute function public.fence_family_write();

create function public.queue_workbook_welcome() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workbook_welcome_enabled and new.card_saved_at is not null then
    if tg_op = 'INSERT' or old.card_saved_at is null then
      insert into public.workbook_emails(card_setup_id, parent_id, child_id, kind, workbook_number)
      values (new.id, new.parent_id, new.child_id, 'welcome', 0) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_workbook_welcome() from public, anon, authenticated;
grant execute on function public.queue_workbook_welcome() to service_role;
create trigger queue_workbook_welcome after insert or update of card_saved_at on public.card_setups
  for each row execute function public.queue_workbook_welcome();

-- Lock the child's card while deciding which email may start. Unknown/sending/sent are never reclaimed.
create function public.claim_workbook_email(p_card_setup_id uuid, p_kind text, p_workbook_number integer,
  p_delivery jsonb, p_message jsonb, p_token uuid)
returns table(id uuid, claim_token uuid) language plpgsql set search_path = '' as $$
declare c public.card_setups; e public.workbook_emails;
begin
  select * into c from public.card_setups where card_setups.id = p_card_setup_id for update;
  if not found or c.card_saved_at is null then raise exception 'card_not_saved'; end if;
  perform public.assert_family_writable(c.parent_id);
  if p_kind not in ('welcome', 'dispatch') or p_kind is null then raise exception 'invalid_kind'; end if;
  if p_kind = 'welcome' and exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind = 'dispatch') then
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status in ('pending', 'failed');
    return;
  end if;
  if p_kind = 'dispatch' then
    update public.workbook_emails set status = 'unknown', error = 'The welcome send stopped without a confirmed outcome.', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status = 'sending' and claimed_at < now() - interval '10 minutes';
    if exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind = 'welcome' and status = 'sending') then
      raise exception 'welcome_sending';
    end if;
    if p_delivery->>'method' = 'mail' then
      if coalesce(length(trim(p_delivery->>'carrier')), 0) = 0 or coalesce(length(trim(p_delivery->>'trackingNumber')), 0) = 0 then
        raise exception 'tracking_required';
      end if;
    elsif p_delivery->>'method' is distinct from 'hand' then raise exception 'invalid_delivery';
    end if;
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status in ('pending', 'failed');
  end if;
  insert into public.workbook_emails(card_setup_id, parent_id, child_id, kind, workbook_number)
    values (c.id, c.parent_id, c.child_id, p_kind, p_workbook_number) on conflict do nothing;
  select * into e from public.workbook_emails where card_setup_id = c.id and kind = p_kind and workbook_number = p_workbook_number for update;
  if e.status not in ('pending', 'failed') then return; end if;
  update public.workbook_emails set status = 'sending', claim_token = p_token, claimed_at = now(),
    attempts = attempts + 1, error = null, delivery = p_delivery, to_address = p_message->>'to',
    subject = p_message->>'subject', text_body = p_message->>'text', html_body = p_message->>'html', updated_at = now()
    where workbook_emails.id = e.id;
  return query select e.id, p_token;
end;
$$;
revoke all on function public.claim_workbook_email(uuid, text, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.claim_workbook_email(uuid, text, integer, jsonb, jsonb, uuid) to service_role;

-- Reuse the existing protected cron destination and secret. Offset from assessment reminders.
select cron.schedule('workbook-welcome-emails', '7,22,37,52 * * * *', $job$
  select net.http_post(
    url := regexp_replace(s.url, '/api/reminders$', '/api/workbook-emails'),
    headers := jsonb_strip_nulls(jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.secret, 'x-vercel-protection-bypass', s.bypass)),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  from (select
    (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url') as url,
    (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret') as secret,
    (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vercel_bypass') as bypass) s
  where s.url ~ '/api/reminders$' and s.secret is not null;
$job$);
