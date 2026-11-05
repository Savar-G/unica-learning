-- Additive corrections to the earlier attempt's plan_start_holds_deletion migration.
-- Keep every worker phase out while a plan start is unresolved. Preserve older confirmation claims during deployment.
-- No deletion runs, and no stored row changes in this migration.

create or replace function public.claim_family_deletion(p uuid, token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions; exists_parent boolean;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  if public.family_plan_start_open(p) then return jsonb_build_object('state','plan_start'); end if;
  select * into q from public.family_deletions where parent_id = p for update;
  if not found then
    if not exists_parent or not coalesce(public.family_retention_due(p),false) then return jsonb_build_object('state','excluded'); end if;
    update public.parents set deletion_requested_at = now() where id = p;
    insert into public.family_deletions(parent_id,reason) values(p,'retention') returning * into q;
  end if;
  if q.lease_until > now() and q.lease_token is distinct from token then return jsonb_build_object('state','busy'); end if;
  update public.family_deletions set lease_token = token, lease_until = now() + interval '5 minutes' where parent_id = p;
  return jsonb_build_object('state','ready','reason',q.reason,'phase',q.phase);
end $$;

create or replace function public.claim_plan_start_email(p_card uuid, p_generation integer, p_token uuid, p_message jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  -- A deployed older head stored generation one's claim in workbook_emails at number zero.
  if p_generation = 1 and exists(
    select 1 from public.workbook_emails e where e.card_setup_id = p_card and e.kind = 'plan_start'
      and e.workbook_number = 0 and e.status in ('sending', 'sent', 'unknown', 'skipped')
  ) then return false; end if;
  update public.plan_starts s set
    email_send_status = 'sending', email_claim_token = p_token, email_claimed_at = now(), email_attempts = s.email_attempts + 1, email_error = null,
    email_to = p_message->>'to', email_subject = p_message->>'subject', email_text = p_message->>'text', email_html = p_message->>'html'
    where s.card_setup_id = p_card and s.generation = p_generation and s.state = 'started' and s.email_state = 'pending'
      and (s.email_send_status is null or s.email_send_status = 'failed');
  return found;
end $$;
