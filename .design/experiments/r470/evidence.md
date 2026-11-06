# S8 implementation evidence

Computer: `Savars-MacBook-Pro-5.local`. Provider/model: Unify Codex, `gpt-6.1-sol`, high. No child agent ran.

App-created path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc`.
Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc`.
Branch: `site/scan-page-history`.
Base: `6acaa2637ad88f88462800a056cdeddcc90678e2`, merged S5 PR672.
The checkout was clean before changes. The containing commit identifies the implementation candidate.

The scoped build brief and cached issue body are in `/Users/savargupta/unica-workbook-samples/parent-dashboard-remaining-20261106`. That directory also contains the durable implementation report and raw check logs. This directory contains normalized copies of the final evidence logs.

## Result

Parents and Admin use one history reader and the existing canonical mark projection. Pages have one result across retakes. History continues past the 90-day image window. Parent corrections keep their original readings and append-only history. Unfinished reviews link the existing result screen. The reader returns 25 matching pages and continues through 100-row database cursors. Counts and list costs use exactly the displayed records. The Admin global budget remains independent of list filters and retains anonymous reservations after family deletion.

The parent result screen offers Just show results. The Maya option is disabled. The public dashboard copy now refers to phone and laptop browsers. No release flag changed.

Only the 13 fixed scan event/status pairs can enter the explicit transport. The installed SDK rejects scan captures after it adds its default properties. The explicit transport has no SDK session, device, user, group, previous-page, URL or referrer fields. Its protocol fields are the public project key, a shared anonymous constant and a no-person-profile flag. Its only event property is a fixed status. No sensitive QR, image or account token is sent. Consent withdrawal aborts pending transport. No retry or replay queue exists for scan events.

## Falsifiers and local proof

| Subsystem | Result that would disprove the change | What the checks prove | What they pass through |
| --- | --- | --- | --- |
| History | Duplicate or missing canonical page; lost old reading; count differs from displayed rows | More than 100 real SQL pages, keyset continuation, fixed states, retakes, corrected nonempty marks, parent/Admin parity | Synthetic reduced database dependencies and local session seams |
| Monitoring | Failed/uncertain spend missing; unknown charge becomes zero; global hold follows a list filter | Exact displayed-record cost comparison, settlement, logical jobs versus dispatches, global anonymous holds after deletion | Synthetic ledger amounts, no bill or provider price proof |
| Concurrency and scope | A delayed correction erases a newer result; a foreign scope reads history; frozen/deleted data returns | Concurrent public readers and persisted correction; browser-role/fake-Admin refusal; family/child freeze and cascade | Local PostgreSQL roles and application transport, not hosted Auth/Storage |
| S4/S5 | An earlier guard or saved result changes through the new wrapper | Full previous command and Send bodies are identical; existing 48 S4 and 36 S5 SQL cases pass through the wrapper | Reduced fixture dependencies, fake worker/auth transport |
| Analytics | Any unknown pair or private field leaves; denied consent sends; old actions replay | All 13 pairs, malformed input, unset/denied/withdrawn consent, revoke/regrant, abort, encoded/nested/error/previous-page redaction | Captured fetch/SDK transports, not hosted ingestion |
| SDK boundary | SDK defaults restore family/device/session/group fields after sanitation | Public capture on installed `posthog-js@1.435.8` returns no scan packet; approved packets use the separate fixed transport | Memory persistence, fixed synthetic bootstrap and fake browser transports |
| Account changes | Old normalization/upload triggers a new-account save; old review updates or emits | Deferred normalization/upload/review and history responses are invalidated; no late save, refresh or event | Synthetic browser/auth events, no real sign-in |
| Post-scan choice | Disabled Maya starts work | Disabled control has no call; results choice links the existing result view | DOM component tests, no visual or device approval |

The SQL old-command control has no history projection. The migration preserves the prior S4/S5 and Send function bodies. The bundled history adapter excludes image, crop, renderer and marking-store dependencies.

## Checks

The final result file records the exact commands, exits and counts. A full test run passed before the final clock move. ESLint then found a render clock read. The clock now belongs to the server reader. Final ESLint, reader/API tests and build pass. The complete test suite was run again on the final source. No timeout, test limit, release check or acceptance criterion was weakened.

Runtime versions: Node `v22.23.1`, npm `10.9.8`, PostgreSQL `18.6`, installed PostHog SDK `1.435.8`.

## Migration order

The merged S4 prerequisites include the scan stack/crops/Send/child-deletion/profile-history migrations. Apply these command layers in this order:

1. `20261105_scan_marking.sql`
2. `20261106_scan_calibration_previous.sql`
3. `20261106_scan_marking_sheet_check.sql`
4. `20261106_scan_recheck_admission.sql`
5. `20261106_scan_mark_changes.sql` (merged S5)
6. `20261106_scan_page_history.sql` (the only new migration in S8)

Root must check the hosted migration ledger before applying step 6. Root must then verify indexes, RLS/grants, the empty search path, owner/Admin/foreign/browser refusals, deletion, and the unchanged Send and saved command bodies. Root must generate real types with `npm run db:types` and run the final build. No generated type was edited here. The existing RPC signature stays type checked.

For a fresh local cluster on a dedicated Unix socket, run `scan_marking.cjs --bootstrap`, `scan_mark_changes.cjs`, then `scan_history.cjs`, with the same `SCAN_MARKING_SOCKET` and a disposable `SCAN_MARKING_DATABASE`. The S8 runner supplies the reduced fixture's missing metadata columns. See `docs/scan-marking.md` for exact commands. All local SQL uses actual migration functions. No network connection or credential is accepted by these fixtures.

## Limits and reserved work

No hosted write, credential access, real email, paid recognition, practice, comparison or model API call ran. Task paid calls: 0. Reported root spend: USD 0. No paid acceptance waiver or family-release waiver exists. The local spend ledger contains synthetic amounts only.

Root owns hosted application and permission/Storage probes, generated types, browser checks on phone/tablet/laptop sizes, final independent review, screen approval and any later push/PR. Provider no-training/retention, handwriting accuracy, physical camera behavior and actual analytics ingestion remain unproved. An already transmitted request or received image cannot be recalled.

Family scanning, marking and dashboard release stay off. Both S9 and #337 must be released before Maya can activate. No workflow, package manifest, generated database type, instruction file or D292 record changed. The reserved merge order remains 674, then Maya642/624/667. This slice does not preempt that order.

The dedicated local database was stopped. No dev server or provider process started. The final full test, lint and build processes completed before handoff.
