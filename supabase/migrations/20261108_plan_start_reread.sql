-- The daily re-read also takes a child whose newest plan start is `started` while the plan state does not show it (#713). An admin's
-- start or a parent's Restart writes the plan state at once (applyPlanStart). When that write fails and the webhook is lost too, the
-- row stays `not_started` or `ended`, or there is no row, while Stripe runs the plan: the gate stays closed on a paying family.
--
-- A child is due here when all of these hold:
--   - The newest plan start of its card setup is `started`, and it finished in the last 40 days. The bound keeps former customers out:
--     ended rows never leave the table. 40 days covers the 30-day free month, so the next Stripe event (the day-30 invoice) is due
--     before the bound ends.
--   - It has no plan row, or its row is `not_started` or `ended` and either was not read since the start finished (the start's own
--     write failed, so the next run reads it) or was not read for 24 hours (a read that began before the start and saved after it).
--   - Its card has a Stripe customer, and its family is not being deleted.
-- Ordered as due_plan_reads is: the row looked at longest ago first, a child with no row before any row.
--
-- A new function, not a change to due_plan_reads: the deployed site reads every due_plan_reads row as one of the five kinds it knows
-- and fails the whole re-read on any other. This function has the same columns. kind is null for a child with no row. What a read may
-- store on these rows is the site's rule (planReadMayStore, src/lib/plan-state.ts).
--
-- Additive: one service-only function that the live code does not call yet. No table, column or stored row changes.
create function public.due_plan_start_reads(p_limit integer default 200)
returns table (child_id uuid, parent_id uuid, customer text, kind text, event_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.child_id, c.parent_id, c.stripe_customer_id, s.kind, s.event_at
  from public.plan_starts l
  join public.card_setups c on c.id = l.card_setup_id
  join public.parents p on p.id = c.parent_id
  left join public.child_plan_states s on s.child_id = c.child_id and s.parent_id = c.parent_id
  where l.state = 'started'
    and l.finished_at > now() - interval '40 days'
    and not exists (select 1 from public.plan_starts n where n.card_setup_id = l.card_setup_id and n.generation > l.generation)
    and c.stripe_customer_id is not null
    and p.deletion_requested_at is null
    and (s.child_id is null
      or (s.kind in ('not_started', 'ended') and (s.read_at < l.finished_at or s.read_at < now() - interval '24 hours')))
  order by greatest(s.read_at, s.read_tried_at) asc nulls first, c.child_id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.due_plan_start_reads(integer) from public, anon, authenticated;
grant execute on function public.due_plan_start_reads(integer) to service_role;
