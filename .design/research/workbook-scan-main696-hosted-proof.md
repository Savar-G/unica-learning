# #475 main696 and hosted SQL proof

MAIN696_INTEGRATED_HOSTED_SQL_PROOF_PASSED

Computer: Savars-MacBook-Pro-5.local. Branch: site/workbook-scan-receipts-475. Reviewed repair pin: da2020cda65058af37e08e2cc3d311d5cfdf8a41. Actual incoming main: de1512717bd297a891069605cefab88d7ad13a54. Local merge: 7756237ff972bff204568cb4fd80445090f5316d

## Main integration

The source manifest checked 61 owned paths and 137 incoming paths. All 59 owned-only and 135 incoming-only blobs were preserved exactly, with 0 failures. Shared paths are database.ts and database.types.ts. Compared with actual main, database.ts has 4 additions and 0 deletions and official generated types have 327 additions and 0 deletions. Both lanes' declarations remain. No query type bypass or hand-written generated declaration was used.

The combined selection passed 446 tests in 19 files, exit 0. It included #475, parent Schedule and marking-server public tests. Scoped TypeScript exited 0 with no diagnostics. This is a different explicit test selection from the 461 builder and 462 reviewer checks; do not add or substitute the counts. No full suite/build/browser/Chromium ran. The source/supabase staged whitespace check passed. One unchanged incoming main proof document had an extra final blank line; that peer evidence file was preserved.

## Hosted positive SQL and role checks

A bounded probe used only synthetic rows inside an exception subtransaction. statement_timeout was 5 seconds; lock_timeout was 500 ms. It created no schema, provider request or storage object. Its UTC dates were computed offline by the actual deliveryDeadlines/scanInactivityCandidate/family-time code: delivery 2026-10-01T12:00Z, inactivity 2026-10-05T12:00Z, backstop 2026-10-22T12:00Z. The actual runtime clock version is in the SQL. The fixture has 3 unrendered pages and 3 minimal question records; it is not a real printed book or complete question-package acceptance proof. Fixture status is not a customer print/approval/shipment action.

The first probe passed at 09:07:10Z. It was extended to assert actual copy and retained ledger rows, then passed at 2026-11-07T09:10:33.989002+00:00 . The executed final query SHA256 is ee870a2387d984f4832e7804c165afc640d007438ca14f1edb0f643f5a1c5c8b . Reproducible source: supabase/tests/workbook_scan_reminder_hosted_rollback.sql. It contains only synthetic UUIDs/example.invalid addresses and deliberately rolls back all row writes.

Final machine-filtered results:

- Identical delivery confirmation returned the same receipt.
- Zero accepted scans produced 1 backstop HOLD and 0 next-book trigger claims. No advance/repeat or book queue ran.
- Service-role context and canonical inactivity proposal returned recorded; due contained the exact one episode.
- Claim returned claimed; dispatch admission returned admitted. No transport was invoked.
- One guarded email-copy row existed. The supplied synthetic outcome was unknown. The message stayed unknown, its episode consumed exactly one dispatch, and its email log stayed claimed with no provider ID and its original hash.
- Retry returned set-changed, not claimed. A late sent finish returned stale. Exactly 1 attempt remained.
- Authenticated owner identity was checked. The owner read 1 own shipped workbook but 0 private episode rows, and service-only RPC execution was denied.
- Another authenticated family read 0 target books. An authenticated admin read 1 episode as a positive control.
- Anonymous table and service-RPC calls were denied.
- Provider calls 0; storage objects 0.

The nested rollback removed all synthetic users, parents, role rows, books, facts, messages, copies and audit rows. The final independent readonly check at 2026-11-07T09:11:58.38422+00:00 found 0 in every scoped category. No family deletion command ran. Database sequence values can advance across a rolled-back insert; no claim of a completely unchanged sequence is made. The original and final proof results are retained in overnight/475-hosted-proof-v1.json and overnight/475-hosted-proof.json.

## Limits and holds

This proves hosted table constraints, grants/RLS under actual SQL roles, canonical stored deadlines, HOLD, reservation/admission/copy/unknown retention and rollback. It does not prove an HTTP Auth session, PostgREST row cap, browser UI, concurrent hosted sessions, recognized handwriting, provider delivery, RFC8058 inbox behavior or family deletion/retention. Earlier real local PostgreSQL concurrency and fakeHTTP adapter proof remain separate.

No customer R2/comment closure, real-parent email, setting change, charge, plan start, family deletion or print approval ran. The work is not whole #475/release acceptance. Safe hosted recipient, Schedule design/UI approval, endpoint/browser proof, the final combined full gate and exact-head remote checks remain. Maya owns the current heavy window.
