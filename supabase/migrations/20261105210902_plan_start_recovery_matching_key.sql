-- PR #593: an unrelated subscription never closes an unresolved start.
-- Keep the original request open before and after a deletion fence.
-- Preserve matching-subscription resolution, explicit team closure and the existing grants.
create or replace function public.fence_plan_start_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- Another subscription cannot settle the outcome of the original provider request.
    if old.state = 'open' and new.state = 'other' then
      raise exception 'plan_start_unresolved' using errcode = '55000';
    end if;
    select deletion_requested_at into deleting from public.parents where id = old.parent_id for share;
    if not found then raise exception 'family_unavailable' using errcode = '55000'; end if;
    if deleting is not null then
      if old.state = 'open' and new.email_state = 'none'
        and (to_jsonb(new) - array['state', 'finished_at', 'subscription_id', 'first_charge_at', 'ended_by',
          'team_alert_state', 'team_alert_at', 'team_alert_email_id', 'team_alert_error'])
          = (to_jsonb(old) - array['state', 'finished_at', 'subscription_id', 'first_charge_at', 'ended_by',
          'team_alert_state', 'team_alert_at', 'team_alert_email_id', 'team_alert_error'])
        and (
          -- An open record can change only the alert fields.
          (new.state = 'open' and new.finished_at is not distinct from old.finished_at
            and new.subscription_id is not distinct from old.subscription_id
            and new.first_charge_at is not distinct from old.first_charge_at and new.ended_by is not distinct from old.ended_by)
          or (new.state = 'started' and new.subscription_id is not null and new.ended_by is null)
          or (new.state = 'refused' and new.subscription_id is null and new.first_charge_at is null and new.ended_by is null)
          or (new.state = 'team_ended' and new.subscription_id is null and new.first_charge_at is null
            and new.ended_by is not null and old.started_at <= now() - interval '24 hours')
        ) then return new;
      end if;
      raise exception 'family_unavailable' using errcode = '55000';
    end if;
    perform public.assert_family_writable(old.parent_id);
  end if;
  perform public.assert_family_writable(new.parent_id);
  return new;
end $$;
revoke all on function public.fence_plan_start_write() from public, anon, authenticated, service_role;
