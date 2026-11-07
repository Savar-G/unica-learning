-- Additions to workbook_scan_receipts_fixture.sql for this local disposable test only.
-- Auth/Storage metadata and plan-control dependencies are reduced. Production SQL supplies the scan, delivery,
-- marking, email constraints/copy scope, plan state and family/child fence code. No hosted parity is claimed.
alter table public.parents add column postal text, add column time_zone text, add column email text, add column name text;
alter table public.children add column province text, add column created_at timestamptz not null default clock_timestamp(),
  add column first_name text default 'Synthetic', add column former_names text[];
create table public.reports(id uuid primary key, parent_id uuid references public.parents on delete cascade,
  child_id uuid references public.children on delete cascade);
create table public.maya_calls(id uuid primary key, parent_id uuid references public.parents on delete cascade,
  child_id uuid references public.children on delete cascade);
create table public.card_setups(id uuid primary key default gen_random_uuid(), parent_id uuid references public.parents on delete cascade,
  child_id uuid references public.children on delete cascade, stripe_customer_id text, card_saved_at timestamptz);
create table public.plan_starts(card_setup_id uuid references public.card_setups on delete cascade, state text);
create table public.child_plan_controls(child_id uuid primary key references public.children on delete cascade,
  parent_id uuid references public.parents on delete cascade, cancelled boolean not null default false);
create table public.plan_control_operations(id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.parents on delete cascade, child_id uuid references public.children on delete cascade,
  state text,kind text,mailing_retired_at timestamptz);
create table public.family_delete_holds(parent_id uuid primary key, lease_until timestamptz);
create table public.family_card_operations(id uuid primary key,parent_id uuid references public.parents on delete cascade);
create table public.anonymous_test_links(assessment_id uuid,copy_id uuid);
create table public.workbook_drafts(id uuid primary key,child_id uuid);
create table public.workbook_runs(id uuid primary key,child_id uuid);
create table public.workbook_edits(id uuid primary key,child_id uuid);

-- A barrier after the normal parent SHARE fence, before an unsubscribe becomes visible.
create function public.fixture_scan_unsubscribe_barrier() returns trigger language plpgsql as $$
begin
  if new.kind='unsubscribe' and current_setting('test.unsubscribe_barrier',true)='on' then
    perform pg_advisory_xact_lock(475,42);
  end if;
  return new;
end $$;
