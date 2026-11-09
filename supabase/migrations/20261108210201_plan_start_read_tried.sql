-- The start reads of the daily re-read (#713, migration plan_start_reread) get their own place in the list between runs. The site
-- reads at most a few of them per run, beside the ordinary re-read, so a start whose Stripe read keeps failing cannot hold up the
-- reads that close stopped plans. A child with no plan row has no read_tried_at, so the try time goes on the plan start record:
-- plan_starts.read_tried_at, set by note_plan_start_read_tried before each read.
--
-- due_plan_start_reads keeps its signature, return type and grants, and its rule for who is due. Only its order changes: the start
-- tried longest ago first, a start never tried before any other. The deployed site does not call it yet, so no live caller changes.
--
-- The note writes only read_tried_at, on the child's newest started record. For a family not being deleted the fence trigger
-- (fence_plan_start_write) lets it through, and record_paid_restart acts only when a record leaves 'open', so the note changes
-- nothing else.
--
-- Additive: one nullable column, one replaced function with the same signature, one new service-only function. No stored row
-- changes when this is applied.
alter table public.plan_starts add column read_tried_at timestamptz;

create or replace function public.due_plan_start_reads(p_limit integer default 200)
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
  order by l.read_tried_at asc nulls first, c.child_id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.due_plan_start_reads(integer) from public, anon, authenticated;
grant execute on function public.due_plan_start_reads(integer) to service_role;

-- Writes only the time, on the newest record of the child's card when it is started. clock_timestamp, so two notes in one transaction
-- keep their order. The family write fence refuses a family being deleted, and due_plan_start_reads leaves such a family out.
create function public.note_plan_start_read_tried(p_child uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.plan_starts l set read_tried_at = clock_timestamp()
  from public.card_setups c
  where c.child_id = p_child and l.card_setup_id = c.id and l.state = 'started'
    and l.generation = (select max(n.generation) from public.plan_starts n where n.card_setup_id = c.id);
$$;
revoke all on function public.note_plan_start_read_tried(uuid) from public, anon, authenticated;
grant execute on function public.note_plan_start_read_tried(uuid) to service_role;
