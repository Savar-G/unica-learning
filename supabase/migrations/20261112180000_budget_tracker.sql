-- Budget tracker (D-333): the team's money in and out, on /admin/budget. It replaces the Google Sheet "Unica Learning -
-- Money Tracker". One row for each expense or payment received: date, type, category, description, vendor or customer,
-- amount and currency (CAD or USD, with the USD to CAD rate used for that row), who paid, and for an expense the split
-- between Savar and Cedric (50/50 unless a row says otherwise) and whether the split is settled. Revenue is never split.
--
-- Admins only: no parent, no anon and no service-role grant, and no family data (no parent_id). Every change goes through
-- the admin's own session, so row-level security decides. A row is never deleted: a delete sets deleted_at, and every
-- insert, change, delete and restore is kept in budget_entry_changes (who, when, the row before and after).
-- Additive: new tables and two functions only.
create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense', 'revenue')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, kind)
);
create unique index budget_categories_name_key on public.budget_categories (kind, lower(name));

-- One row: the USD to CAD rate that a new USD entry starts from. Each entry keeps its own rate, so a change here never
-- moves an old amount.
create table public.budget_settings (
  id boolean primary key default true check (id),
  usd_to_cad numeric(8, 4) not null check (usd_to_cad > 0 and usd_to_cad < 100),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.budget_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null check (entry_date between date '2020-01-01' and date '2100-01-01'),
  kind text not null check (kind in ('expense', 'revenue')),
  category_id uuid not null,
  description text not null check (char_length(description) between 1 and 300),
  party text check (party is null or char_length(party) between 1 and 200),
  -- The amount of the bill, in `currency`. The amount paid is the same number (decided 2026-11-12).
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  currency text not null check (currency in ('CAD', 'USD')),
  -- CAD per USD for this row; null for a CAD row.
  usd_to_cad numeric(8, 4) check (usd_to_cad > 0 and usd_to_cad < 100),
  amount_cad numeric(12, 2) generated always as (case when currency = 'CAD' then amount else round(amount * usd_to_cad, 2) end) stored,
  -- Who paid an expense. For revenue it is who received the money, and it may be empty.
  paid_by text check (paid_by in ('savar', 'cedric')),
  -- Savar's share of an expense, in percent; Cedric's is the rest. Revenue is not split.
  savar_share_pct numeric(5, 2) not null default 50 check (savar_share_pct between 0 and 100),
  -- True once the other partner has paid their share of this expense back.
  split_settled boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  constraint budget_entries_category_fkey foreign key (category_id, kind) references public.budget_categories (id, kind) on delete restrict,
  check ((currency = 'USD') = (usd_to_cad is not null)),
  check (kind = 'revenue' or paid_by is not null),
  check (kind = 'expense' or not split_settled)
);
create index budget_entries_date_idx on public.budget_entries (entry_date desc, created_at desc) where deleted_at is null;
create index budget_entries_category_idx on public.budget_entries (category_id);

create table public.budget_entry_changes (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.budget_entries (id) on delete restrict,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'restore')),
  before jsonb,
  after jsonb
);
create index budget_entry_changes_entry_idx on public.budget_entry_changes (entry_id, changed_at);

alter table public.budget_categories enable row level security;
alter table public.budget_settings enable row level security;
alter table public.budget_entries enable row level security;
alter table public.budget_entry_changes enable row level security;
revoke all on table public.budget_categories, public.budget_settings, public.budget_entries, public.budget_entry_changes from anon, authenticated, service_role;
grant select, insert, update on table public.budget_categories, public.budget_entries to authenticated;
grant select, update on table public.budget_settings to authenticated;
grant select on table public.budget_entry_changes to authenticated;
create policy "Admins read budget categories" on public.budget_categories for select to authenticated using ((select public.is_admin()));
create policy "Admins add budget categories" on public.budget_categories for insert to authenticated with check ((select public.is_admin()));
create policy "Admins change budget categories" on public.budget_categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins read budget settings" on public.budget_settings for select to authenticated using ((select public.is_admin()));
create policy "Admins change budget settings" on public.budget_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins read budget entries" on public.budget_entries for select to authenticated using ((select public.is_admin()));
create policy "Admins add budget entries" on public.budget_entries for insert to authenticated with check ((select public.is_admin()));
create policy "Admins change budget entries" on public.budget_entries for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins read budget changes" on public.budget_entry_changes for select to authenticated using ((select public.is_admin()));

-- Before every update: the row keeps its id and its creator, and records who changed it and when.
create function public.budget_entry_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger budget_entry_touch before update on public.budget_entries
  for each row execute function public.budget_entry_touch();

-- After every insert or real change: one line in the change log. Security definer, because nobody else may write the log.
create function public.budget_entry_log() returns trigger language plpgsql security definer set search_path = '' as $$
declare what text;
begin
  if tg_op = 'INSERT' then
    insert into public.budget_entry_changes (entry_id, changed_by, action, before, after) values (new.id, auth.uid(), 'insert', null, to_jsonb(new));
    return null;
  end if;
  if (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then return null; end if;
  what := case when old.deleted_at is null and new.deleted_at is not null then 'delete'
    when old.deleted_at is not null and new.deleted_at is null then 'restore' else 'update' end;
  insert into public.budget_entry_changes (entry_id, changed_by, action, before, after) values (new.id, auth.uid(), what, to_jsonb(old), to_jsonb(new));
  return null;
end $$;
revoke all on function public.budget_entry_log() from public, anon, authenticated;
create trigger budget_entry_log after insert or update on public.budget_entries
  for each row execute function public.budget_entry_log();

insert into public.budget_categories (kind, name, sort_order) values
  ('expense', 'Meta ads', 1), ('expense', 'Google ads', 2), ('expense', 'Website and software', 3), ('expense', 'Printing', 4),
  ('expense', 'Shipping and postage', 5), ('expense', 'Supplies', 6), ('expense', 'Other expenses', 7),
  ('revenue', 'Subscriptions', 1), ('revenue', 'Other revenue', 2);
-- Bank of Canada rate of 2026-10-08, the one the Sheet used.
insert into public.budget_settings (usd_to_cad) values (1.4240);
