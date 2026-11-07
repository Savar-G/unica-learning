-- Add ready notices without changing old welcome, dispatch, or plan-start keys.
alter table public.workbook_emails drop constraint workbook_emails_kind_check;
alter table public.workbook_emails add constraint workbook_emails_kind_check check (kind in ('welcome', 'ready', 'dispatch', 'plan_start'));
alter table public.workbook_emails drop constraint workbook_emails_check;
alter table public.workbook_emails add constraint workbook_emails_check
  check ((kind in ('welcome', 'plan_start') and workbook_number = 0) or (kind in ('ready', 'dispatch') and workbook_number between 1 and 10000));

create or replace function public.claim_workbook_email(p_card_setup_id uuid, p_kind text, p_workbook_number integer,
  p_delivery jsonb, p_message jsonb, p_token uuid)
returns table(id uuid, claim_token uuid) language plpgsql set search_path = '' as $$
declare c public.card_setups; e public.workbook_emails;
begin
  select * into c from public.card_setups where card_setups.id = p_card_setup_id for update;
  if not found or c.card_saved_at is null then raise exception 'card_not_saved'; end if;
  perform public.assert_family_writable(c.parent_id);
  if p_kind not in ('welcome', 'ready', 'dispatch', 'plan_start') or p_kind is null then raise exception 'invalid_kind'; end if;
  if p_workbook_number is null or not (
    (p_kind in ('welcome', 'plan_start') and p_workbook_number = 0)
    or (p_kind in ('ready', 'dispatch') and p_workbook_number between 1 and 10000)
  ) then raise check_violation using message = 'invalid_workbook_number'; end if;

  if p_kind = 'welcome' and exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind in ('ready', 'dispatch')) then
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status in ('pending', 'failed');
    return;
  end if;
  if p_kind = 'ready' and exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind = 'dispatch' and workbook_number = p_workbook_number) then
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'ready' and workbook_number = p_workbook_number and status in ('pending', 'failed');
    return;
  end if;

  if p_kind in ('ready', 'dispatch') then
    update public.workbook_emails set status = 'unknown', error = 'The welcome send stopped without a confirmed outcome.', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status = 'sending' and claimed_at < now() - interval '10 minutes';
    if exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind = 'welcome' and status = 'sending') then
      raise exception 'welcome_sending';
    end if;
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'welcome' and status in ('pending', 'failed');
  end if;
  if p_kind = 'dispatch' then
    update public.workbook_emails set status = 'unknown', error = 'The ready send stopped without a confirmed outcome.', updated_at = now()
      where card_setup_id = c.id and kind = 'ready' and workbook_number = p_workbook_number and status = 'sending' and claimed_at < now() - interval '10 minutes';
    if exists (select 1 from public.workbook_emails where card_setup_id = c.id and kind = 'ready' and workbook_number = p_workbook_number and status = 'sending') then
      raise exception 'ready_sending';
    end if;
    if p_delivery->>'method' = 'mail' then
      if coalesce(length(trim(p_delivery->>'carrier')), 0) = 0 or coalesce(length(trim(p_delivery->>'trackingNumber')), 0) = 0 then
        raise exception 'tracking_required';
      end if;
    elsif p_delivery->>'method' is distinct from 'hand' then raise exception 'invalid_delivery';
    end if;
    update public.workbook_emails set status = 'skipped', updated_at = now()
      where card_setup_id = c.id and kind = 'ready' and workbook_number = p_workbook_number and status in ('pending', 'failed');
  end if;
  if p_kind = 'ready' then p_delivery := '{}'::jsonb; end if;
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
