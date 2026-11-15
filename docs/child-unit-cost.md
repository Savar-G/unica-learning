# Cost per child per month

`/admin/ai/children` answers "does each family make money?". For each real child and each family's own calendar month, it shows the total cost against what the child's plan charged, and the margin. Open it from the "Cost per child" link on `/admin/ai`. Admins only (others get the site's 404).

Code: `src/lib/child-unit-cost.ts` (pure, money in whole cents, as in `src/lib/budget.ts`), the reader seam `UnitCostReader` with the Supabase reader `src/lib/child-unit-cost-store.ts` and the in-memory reader `src/lib/child-unit-cost-memory.ts` (tests: `src/lib/child-unit-cost.test.ts`). Page: `src/app/(product)/admin/ai/children/page.tsx`, `src/components/admin-child-unit-cost.tsx`. Migration: `admin_child_unit_cost`.

## The month

The month pills are "This month", "Last month" and "Two months ago": a calendar month named by Vancouver time. Each family reads that month in its own zone (`familyZone` in `src/lib/family-time.ts`: a valid `parents.time_zone`, else the postal mapping, else the oldest child's province, else Pacific), from midnight on the 1st to midnight on the 1st of the next month.

## What counts as cost

| Part | Source | Rule |
|---|---|---|
| AI calls | `ai_usage_events`, and `workbook_run_ai_calls` for older runs | US dollars, turned into CAD with the one rate `MAYA_USD_TO_CAD` (`docs/maya-spend.md`). For one call the new ledger wins, as on `/admin/ai` (`docs/ai-usage.md`). Older Maya model rows of `maya_spend` (CAD) count when the call has no new row. |
| Maya speech and voice | `maya_spend`, `what` = `speech_to_text` and `voice` | An estimate (the providers report no cost per call). Always counted. |
| Print and postage | workbooks with `shipped_at` in the month | An estimate: `WORKBOOK_PHYSICAL_COST_CAD` in `src/lib/child-unit-cost.ts` (CAD 30) for each workbook shipped. No table records the real cost of one workbook. |
| Subscription calls | `provider = 'subscription'` (`claude -p` on the Mac) | Counted, never priced: "subscription, not in the total". |

The parts are added exactly in integers (nano US dollars times the rate in millionths, and CAD micros) and each total is rounded to cents once, half up. Each column is also rounded on its own, so the columns of a row can differ from its total by a cent; the page says so.

Beside the estimate, the page shows the budget tracker's actual printing and postage expenses (`budget_entries` in categories whose name holds "print", "postage" or "shipping") dated in the calendar month. They can hold test prints, so they are a comparison, not a per-child cost.

Calls a family made with no child named (for example a photo check) show on their own "No child named" line.

## What counts as paid

From the child's stored plan state (`child_plan_states`): `paying` charges its price; `ending` charges its price until its end date, unless it was a free month; a free month and every other state is 0. The price is the stored `monthly_cents`, else the agreed price of the child's newest started plan start (`plan_starts.monthly_cents`; when that newest start has no price, the price is unknown, never an older start's, migration `admin_child_unit_cost_newest_start`). A cancelled plan's stored row has no price, and a sibling pays CAD 59.99 (`docs/plan-controls.md`), so the plan price is never assumed. With neither price, the paid and margin columns say "unknown", and that child is left out of the paid and margin totals and the average. The table holds only today's state, so for an earlier month the paid column shows today's plan. The page says so.

The summary line gives the average total cost of the children whose plan charged in the month, against the plan price, CAD 79.99 (`PLAN_PRICE_CENTS`, from `src/lib/subscription-plan.ts`).

## Families left out

Test families and admin families are left out unless the sidebar's "Show test families" switch is on, as on the admin dashboard.

## The reads

Two admin-only database functions with the admin's own session (`security definer`, `is_admin()` check, no anon grant), two calls a page load, no polling:

- `admin_child_unit_cost_families()`: every family with a child, its zone inputs, whether it is a test or admin family, and each child's plan state.
- `admin_child_unit_cost(p_bounds, p_month)`: `p_bounds` is `[{parent_id, from, to}]`, each family's month (at most 32 days). It returns the sums per family and child (US dollars and CAD micros, not rounded) and the budget lines of `p_month` (`YYYY-MM`, read by an `entry_date` range, so the date index is used). The page calls it even with no family left (all excluded), so the budget lines still show. Migration `admin_child_unit_cost_fixes` replaced both functions (agreed price, empty bounds, date range).
