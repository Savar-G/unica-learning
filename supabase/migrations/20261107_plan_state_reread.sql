-- Daily re-read of open plan rows. The plan gate (src/lib/plan-access.ts) trusts public.child_plan_states, and a lost webhook event
-- would leave a stopped plan open with no limit. So the sweep in the /api/reminders run reads each row of kind free_month, paying or
-- ending again when it has not been read for 24 hours (sweepPlanReads, src/lib/card-reconcile.ts).
--
-- read_at says when Stripe was last read: save_child_plan_state sets it from the database's clock on every write, and a write that
-- answers 'older' means that a later read already wrote. So no new "last read" column is needed. (Migration
-- child_plan_state_read_order said read_at could go after that code shipped: it now has a reader, so it stays.)
--
-- read_tried_at is the sweep's place in the list between runs: the row goes behind the others before its work starts. A read that
-- fails or hangs changes nothing else, so that row stays due but cannot hold up the rows behind it.
--
-- Additive: one nullable column, one partial index, two service-only functions that the live code does not call yet. No stored row
-- changes when this is applied.
alter table public.child_plan_states add column read_tried_at timestamptz;

create index child_plan_states_due_read_idx on public.child_plan_states (read_at) where kind in ('free_month', 'paying', 'ending');

-- The database decides what is due, by its own clock, as read_at comes from that clock. A family being deleted is left out: its write
-- fence refuses the save, and the deletion cancels its plans.
create function public.due_plan_reads(p_limit integer default 200)
returns table (child_id uuid, parent_id uuid, customer text, kind text, event_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.child_id, s.parent_id, c.stripe_customer_id, s.kind, s.event_at
  from public.child_plan_states s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  join public.parents p on p.id = s.parent_id
  where s.kind in ('free_month', 'paying', 'ending')
    and s.read_at < now() - interval '24 hours'
    and c.stripe_customer_id is not null
    and p.deletion_requested_at is null
  order by greatest(s.read_at, s.read_tried_at) asc, s.child_id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.due_plan_reads(integer) from public, anon, authenticated;
grant execute on function public.due_plan_reads(integer) to service_role;

-- Writes only the time. updated_at and read_at stay: nothing was read yet. The family write fence refuses a family being deleted.
create function public.note_plan_read_tried(p_child uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.child_plan_states set read_tried_at = now() where child_id = p_child;
$$;
revoke all on function public.note_plan_read_tried(uuid) from public, anon, authenticated;
grant execute on function public.note_plan_read_tried(uuid) to service_role;
