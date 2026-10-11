-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_report_card_waitlist, 2026-10-11.
-- The next step of the report (#66, D-082): a BC family chooses a plan and saves a card on Stripe; a family in any
-- other province joins the waitlist. One row per child in each table, so a second click never makes a duplicate.
-- The server writes both tables with the secret key (service_role skips row-level security). A signed-in parent
-- reads only the listed columns of their own rows, so the report page can show "card saved" or "on the waitlist".
-- anon gets nothing. Admin reads come with the admin ticket (#77). Rows go with the child (on delete cascade).
--
-- card_setups: the plan the parent chose last and the child's Stripe customer. id is the "ref" in the Stripe
-- customer and Checkout metadata and the Checkout client_reference_id, as signups.ref is for the reserve form.
-- card_saved_at: set when /thank-you confirms the saved card with Stripe, or when Stripe already holds a card for
-- the customer. Stripe stays the record of who saved a card.
-- The signups table does not fit here: it needs a plan for every row, and it has no parent, child or report.
create table public.card_setups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null unique references public.children (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  plan text not null check (plan in ('one', 'both')),
  price smallint not null check (price between 1 and 500),
  stripe_customer_id text unique check (char_length(stripe_customer_id) <= 100),
  card_saved_at timestamptz
);
create index card_setups_parent_id_idx on public.card_setups (parent_id);

-- waitlist_joins: one click on the report. province: the curriculum the family waits for.
create table public.waitlist_joins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null unique references public.children (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  province text not null check (province in ('BC', 'AB', 'SK', 'MB', 'ON', 'other'))
);
create index waitlist_joins_parent_id_idx on public.waitlist_joins (parent_id);

alter table public.card_setups enable row level security;
alter table public.waitlist_joins enable row level security;
revoke all on table public.card_setups, public.waitlist_joins from anon, authenticated;
grant select (child_id, plan, price, card_saved_at) on table public.card_setups to authenticated;
grant select (child_id, province, created_at) on table public.waitlist_joins to authenticated;
create policy "Parents read their own card setups" on public.card_setups
  for select to authenticated using ((select auth.uid()) = parent_id);
create policy "Parents read their own waitlist joins" on public.waitlist_joins
  for select to authenticated using ((select auth.uid()) = parent_id);
