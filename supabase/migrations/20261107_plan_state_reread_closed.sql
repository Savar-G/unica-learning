-- The daily re-read also takes rows of kind payment_failed and paused. A parent who paid and stays locked out after a lost invoice.paid
-- or a lost resume is the worse failure. ended and not_started stay out: nothing a read could find would change them, as a restart or a
-- start writes its own row. What a read may store on these rows is the site's rule (planReadMayStore, src/lib/plan-state.ts).
--
-- Same signature, return type and grants as migration plan_state_reread, so the live code keeps working. These rows are few, so there is
-- no new index. The partial index child_plan_states_due_read_idx lists only the three open kinds, so it no longer serves this query. It
-- stays for now: dropping it waits for a later cleanup that a person confirms.
--
-- No stored row changes when this is applied.
create or replace function public.due_plan_reads(p_limit integer default 200)
returns table (child_id uuid, parent_id uuid, customer text, kind text, event_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.child_id, s.parent_id, c.stripe_customer_id, s.kind, s.event_at
  from public.child_plan_states s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  join public.parents p on p.id = s.parent_id
  where s.kind in ('free_month', 'paying', 'ending', 'payment_failed', 'paused')
    and s.read_at < now() - interval '24 hours'
    and c.stripe_customer_id is not null
    and p.deletion_requested_at is null
  order by greatest(s.read_at, s.read_tried_at) asc, s.child_id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.due_plan_reads(integer) from public, anon, authenticated;
grant execute on function public.due_plan_reads(integer) to service_role;
