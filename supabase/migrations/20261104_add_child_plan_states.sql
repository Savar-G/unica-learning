-- Plan state store (#548, spec #544): one row per child with what parents see about the plan, so a page load does not
-- call Stripe per child. The Stripe webhook (src/app/api/stripe-webhook/route.ts) writes a row after each event, from a
-- fresh read of the customer's subscriptions; src/lib/plan-state.ts holds the rules. A missing row reads as `unknown`,
-- which is never stored: a read that cannot answer must not replace a known plan.
--
-- event_at and event_id are the Stripe event that wrote the row; both are null on a row filled from Stripe with no
-- event. read_at is when the server started the Stripe read. kind is a ParentPlan kind; next_charge_at is its first or
-- next charge; ends_at is the end of an ending plan or the end of an ended one; ending_free means no charge was made.
--
-- Only the server writes, through save_child_plan_state, with the secret key: the service role may read the table and
-- call the function, and has no direct insert, update or delete grant. Admins read. Parents and anon read nothing: no
-- policy for them, so the parent view module reads with the secret key. A family deletion removes the row through the
-- foreign keys (on delete cascade from the parent and the child); there are no files. The family write fence covers
-- new rows and updates.
-- Additive: one new table and one new service-only function that the code on main does not use.
create table public.child_plan_states (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  kind text not null check (kind in ('not_started', 'free_month', 'paying', 'payment_failed', 'ending', 'ended')),
  next_charge_at timestamptz,
  ends_at timestamptz,
  monthly_cents integer check (monthly_cents >= 0),
  ending_free boolean not null default false,
  event_at timestamptz,
  event_id text check (char_length(event_id) between 1 and 255),
  read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint child_plan_states_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint child_plan_states_first_charge check (kind <> 'free_month' or next_charge_at is not null),
  constraint child_plan_states_event check ((event_at is null) = (event_id is null))
);
create index child_plan_states_parent_idx on public.child_plan_states (parent_id);

alter table public.child_plan_states enable row level security;
revoke all on table public.child_plan_states from anon, authenticated, service_role;
grant select on table public.child_plan_states to service_role;
grant select on table public.child_plan_states to authenticated;
create policy "Admins read child plan states" on public.child_plan_states
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.child_plan_states
  for each row execute function public.fence_family_write();

-- One atomic write for one Stripe customer. The customer's card setup names the child; with none it writes nothing and
-- answers 'no_match'. With no event (p_event_at null) it only fills a missing row. With an event it replaces a row
-- with no event, a row from an older event, or a row from another event of the same second whose Stripe read started
-- no later (Stripe's event times are whole seconds). It answers 'stored' when it wrote, 'duplicate' when the row is
-- from this same event, and 'older' otherwise.
create function public.save_child_plan_state(p_customer text, p_kind text, p_next_charge_at timestamptz, p_ends_at timestamptz,
  p_monthly_cents integer, p_ending_free boolean, p_event_at timestamptz, p_event_id text, p_read_at timestamptz)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_child uuid;
begin
  select c.parent_id, c.child_id into v_parent, v_child from public.card_setups c where c.stripe_customer_id = p_customer;
  if not found then
    return 'no_match';
  end if;
  if p_event_at is null then
    insert into public.child_plan_states (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, null, p_event_id, p_read_at)
      on conflict (child_id) do nothing;
  else
    insert into public.child_plan_states as t (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, p_event_at, p_event_id, p_read_at)
      on conflict (child_id) do update set
        kind = excluded.kind, next_charge_at = excluded.next_charge_at, ends_at = excluded.ends_at, monthly_cents = excluded.monthly_cents,
        ending_free = excluded.ending_free, event_at = excluded.event_at, event_id = excluded.event_id, read_at = excluded.read_at, updated_at = now()
      where t.event_at is null
        or excluded.event_at > t.event_at
        or (excluded.event_at = t.event_at and excluded.event_id <> t.event_id and excluded.read_at >= t.read_at);
  end if;
  if found then
    return 'stored';
  end if;
  return case when p_event_id is not null and exists (select 1 from public.child_plan_states s where s.child_id = v_child and s.event_id = p_event_id)
    then 'duplicate' else 'older' end;
end $$;
revoke all on function public.save_child_plan_state(text, text, timestamptz, timestamptz, integer, boolean, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.save_child_plan_state(text, text, timestamptz, timestamptz, integer, boolean, timestamptz, text, timestamptz) to service_role;
