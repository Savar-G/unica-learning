# Parent dashboard release

`PARENT_DASHBOARD_ENABLED` is a server release switch (spec #544, #551). Leave it unset. While it is unset, only families marked in `public.test_accounts` and users listed in `public.admin_users` get the dashboard, and every other family gets today's Parent home. The server reads those marks on each request. A browser cannot supply its own mark.

Only the exact value `on` opens the dashboard to every family. Set it in the server environment and redeploy, and do this only after Savar approves on the one review page (D-249). Remove the value and redeploy to close it again.

## What the switch controls

- `src/lib/parent-dashboard-access.ts` is the check. `parentDashboard()` in `src/lib/parent-dashboard-server.ts` calls it, once per request, for the layout and the home page.
- `src/app/(product)/account/(dashboard)/layout.tsx` adds the frame. For a family the switch does not open to, it returns the page alone. A failed read of the dashboard's facts also gives today's Parent home.
- `src/app/(product)/account/(dashboard)/parent-home.golden.html` is today's Parent home, written from the page before the dashboard existed. `page.test.ts` compares a normal family's page with it, byte for byte.
- `/account/settings` is the Account tab. Everyone else goes back to `/account`, which has the same links.

The pages in `(dashboard)` keep their addresses, because a route group is not in the URL. The test, its start screen and the first sign-in (`/account/test`, `/account/start`, `/account/finish`) stay outside the folder, so they never show the frame. The desk lock, the desk guard and the proxy's 423 apply as before: `src/proxy.ts` matches `/account/:path*`, and the guard is in the layout above.

## Billing on the Account tab (#554)

`src/lib/billing.ts` holds the rules, behind a store seam (`card_setups`, read with the secret key and filtered on the signed-in parent) and a provider seam (Stripe).

- Plans come from `child_plan_states`. A load of the Account tab fills a missing row with `fillChildPlan`. The frame reads the same rows through the parent view, so a family with no row yet shows its tabs as `unknown` for that one load.
- Invoices load live, on this page only, from every Customer of the family, on every page of each list. If any read fails, none of the list shows: a part of it would read as all of it.
- "Update card" opens Stripe Checkout in setup mode, for cards only (`allowed_payment_method_types`; Stripe refuses `payment_method_types`, checked in test mode on 5 November 2026). `/api/account/card-update/return` checks that the session names this parent's row and that row's customer, then sets the new card as the Customer's default (`invoice_settings`) and as the default of each subscription that can still charge. A plan that has not started has no subscription: `startPlan` uses the Customer's default when it is a card, else the customer's newest card, as it did before. The old card stays on the Customer.
- Only the newest update counts. `public.child_card_updates` holds one row per child with the session of the last update and its time at Stripe. Before any Stripe write, `claim_card_update` takes the row atomically for a session newer than the row's (the same second: the higher id). A return of the same session or an older one changes nothing and shows the normal page with no notice, so a browser history entry or another tab cannot bring an older card back. Until `finish_card_update` marks the write as finished, the same session can try again, so a Stripe failure does not lose the card. If a newer return took the row during a write, the older return writes the newer card again. The order is by when Stripe's page opened, not by when the parent finished it: of two pages open at once, the one opened later wins. Probe: `supabase/tests/child_card_updates.sql`, through the Management API; a run ends with `PROBE_OK` and rolls back.
- Cancel stays on `/account/plan` (D-222).
- Both card routes answer only to a family the switch opens to, and every other family keeps today's pages.
- Stored plans change only through `docs/stripe-webhook.md`. Set up that endpoint before families see this page, or a filled row goes stale.

## The Maya tab (#553)

The Maya tab is `/account/notes/<child>`, the notes page that already existed, so every note and transcript address keeps working. For a child with the tab, the page shows the child's minutes left this week (the minutes ledger, `parentMinutes`) and the chat messages (`parentChatUsage`) above the notes, and each note links to its transcript (`/account/notes/<child>/<call>`). The home page then leaves out the minutes and the latest note. For a family without the dashboard, or a child without the tab, both notes pages stay as they were: `notes.test.ts` compares them with `notes-list.golden.html` and `notes-session.golden.html`.

The tab shows for test families only, until a child can call Maya (#337); the `maya` switch in `src/lib/parent-view-server.ts` holds that. Admin test calls never appear: the database writes no note for them, `parent_maya_note_sessions` returns only family calls and chats, `withSessions` drops any other row, and they take no child minutes. There is no pattern line: no code counts a pattern across calls yet, and the tab shows only what code counted.

## Adding a tab's page

A tab with no page does not appear. When a ticket builds a tab's page, change that tab's line in `TAB_PAGE` in `src/lib/parent-shell.ts`. The stage rule (`src/lib/child-stage.ts`) still decides which tabs a child may have.

The phone layout is set 2, option A of round r544. Savar has not chosen yet. To change it, change `phoneNav` in `src/lib/parent-shell.ts` and the phone parts of `src/components/parent-shell.tsx`.
