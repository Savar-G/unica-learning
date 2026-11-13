# Admin budget tracker (D-333)

`/admin/budget` is the team's books: money in and out, and who owes whom between Savar and Cedric. It replaces the Google Sheet "Unica Learning - Money Tracker" (16 rows imported on 2026-11-12; the Sheet is now an archive).

## What it holds

- `public.budget_entries`: one row for each expense or payment received. Date, type (expense or revenue), category, description, vendor or customer, amount and currency (CAD or USD), the USD to CAD rate of that row, who paid, Savar's share in percent (50 unless the row says otherwise), "split settled", notes. `amount_cad` is a generated column. The amount and the amount paid are one number (decided 2026-11-12): a bill that is not charged yet still counts in full.
- `public.budget_categories`: expense and revenue categories (the Sheet's seven and two). A category is created from the "Category" list of a transaction ("+ New category...") and renamed under Settings. It is never deleted.
- `public.budget_settings`: one row, the USD to CAD rate that a new USD entry starts from (1.4240, the Bank of Canada rate of 2026-10-08). Each entry keeps its own rate, so a new rate never moves an old amount.
- `public.budget_entry_changes`: the log. A trigger writes one line for each insert, change, delete and restore (who, when, the row before and after).

## Rules

- Admins only (RLS with `is_admin()`); no parent, anon or service-role grant, and no family data. Every read and write uses the admin's own session (`src/lib/budget-store.ts`), through the routes in `src/app/api/admin/budget/`.
- A delete sets `deleted_at`; the database never deletes an entry (there is no delete grant).
- Revenue is never split. Expenses split 50/50 or by the row's share. Cedric gets the odd cent of one row.
- The balance (`balanceOf` in `src/lib/budget.ts`) counts the unsettled expenses: what Cedric owes Savar for expenses Savar paid, minus what Savar owes Cedric for expenses Cedric paid. It adds the exact parts and rounds the total once, so 15 unsettled expenses of 406.57 give 203.29 (the old Sheet showed 203.28 because it halved an unrounded USD amount).
- The page reads the whole ledger in 3 queries (entries, categories, rate) and sums it in code. No polling, no prefetch.

## Changing it

Money is whole cents in `src/lib/budget.ts` (pure, tested in `src/lib/budget.test.ts`). The checks of what the page sends are in `parseEntry`; the routes and the form use the same ones.
