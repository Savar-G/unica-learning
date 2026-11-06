# Root integration verification

Computer: Savars-MacBook-Pro-5.local. Branch: site/scan-mark-corrections.
Original implementation: f1635c1e57cdc96629218956aec4802bd5829017.

Falsifiers: an unauthorized session reads or changes results; a stale parent choice replaces a newer version; a correction loses the original reading or creates a second event; an expired image blocks numeric correction; a pending profile revision disappears; automatic guards or Send change; owned QA records survive deletion.

## Hosted schema

Applied scan_mark_changes as 20261106034512 after checking all installed S4 and PR637 dependencies. Generated database.types.ts with the normal npm run db:types command. It adds the history table and renamed automatic function declarations. No generated type was edited by hand.

The hosted catalog confirms RLS, no anon/authenticated history read or RPC execution, no direct service-role writes, service-role wrapper execution and denied direct automatic-function execution. The automatic body retains hash cce0b2166a053a0528b79d942554dbc4. Send retains hash 1438117e149da92e49eaa4584d43da78. The family fence, child fence, immutable trigger and cascades are installed. Security advisors added no warning. The new RLS-without-policy INFO is intentional for a service-only table. Existing unrelated warnings did not change.

supabase/tests/scan_mark_changes_hosted.sql reached SCAN_MARK_CHANGES_HOSTED_PROBE_OK. It exercises the deployed role boundary, active/expired/deleted changes, cross-family refusal, stale versions, immutable history, original reading/event/model/prompt retention, profile-token refusal, durable pending history, terminal recovery, both deletion fences, child cascade and sibling preservation. Every synthetic row rolls back. Two earlier runs stopped on probe errors: a fixed initial-version assumption and an ambiguous local variable. Neither needed a product change. The final probe and catalog report zero probe families and zero enabled prices.

Platform checks used the documented empty search path and explicit grants. Current Supabase docs confirm these requirements: https://supabase.com/docs/guides/database/functions. The CLI v3 changelog was checked; the normal type script used the installed v2 CLI with its explicit hosted project. No CLI upgrade or login ran.

## Browser and real sessions

One dedicated synthetic family was created with a unique source/run marker. The local production routes used hosted Auth, a live session, service role and the applied database functions. Only local SCAN_MARKING_ENABLED=test-only was set. No family release flag, provider key or price was enabled.

The browser changed a scored Wrong to Right, completed a required parent check as Blank, changed the earlier parent judgment to Wrong, then used a second stale tab. The stale tab received 409 and showed the current Wrong with the instruction to check before choosing again. An explicit Enter on Blank then saved at the new version with 200. Successful replies had recoveryPending=false. The original reading 56 stayed visible after every correction, although the photo was deleted. The unscored item had no mark control. The pending check had no selected default.

Actual HTTP checks: owner 200; signed out 404; foreign origin 403; extra ownership field 400; missing version 400; desk lock 423; unknown photo 404; original cookie after session revocation 404. Counts and byte sizes are in root-api.json. Four successful corrections left four history rows, three canonical items and one original learning event. Marking and profile revisions both reached five.

Desktop width 1280 had scroll width 1265. Tablet width 820 had scroll width 805. Phone width 390 had scroll width 375. The long child name and all three choices fit. The phone conflict text stayed visible after the server refresh. Screenshots are real shared-browser captures. No alternate preview route or browser mock was used.

The browser found questions in canonical row order rather than printed order. ROOT-ORDER-1: resolved with one copy-and-sort before projection. The public regression failed before the fix and passed after it. It also checks completion order and unchanged caller input. The first build caught a missing null photo-reference argument in that new test fixture. The fixture was corrected. Production behavior was unchanged by that correction.

## Cleanup and limits

The session was revoked. Both owned browser tabs were closed and the development server stopped. After checking the source/run marker, root directly queued this synthetic family for deletion. The real runFamilyDeletion function ran with the existing dedicated retention_worker credential and returned deleted. Auth, parents, children, photos, canonical marks, mark history, marking revisions and learning events all have zero remaining rows for this family. No Storage object or billing record was created. The worker made no provider call. The private Auth ledger and local service environment were removed.

This proves the new hosted schema, local app behavior against hosted sessions and durable state, and worker cascades for a family with no Storage objects. It does not prove image download or signed-URL boundaries with physical objects, camera behavior, handwriting accuracy, provider privacy, paid model acceptance, deployed cron timing or family-release readiness. Those remain in the shared launch checks. The original local review remains valid for unchanged behavior. A scoped recheck covers ROOT-ORDER-1, generated declarations and this integration evidence before push.

Full-gate records before current-main integration: 16,624 tests with one optional skip passed on the implementation plus generated types. After the ordering correction, 16,625 tests with one optional skip passed in 442 files. Source lint passed. The final current-main gate is recorded separately before the PR is pushed.
