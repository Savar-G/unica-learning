# Saved-source preview full gate

HANDOFF_READY

Machine: Savars-MacBook-Pro-5.local.
Branch: site/workbook-preview-sources-472.
Frozen source: db335199ee73870417ec150a62a946e49b45771d.
Base: actual PR700 merge 4e07e83447750ce901e252a5ccb6f9e57b0a50c9.
Start: 2026-11-07T14:46:42Z. Finish: 2026-11-07T15:03:10Z.

| Stage | Result | Seconds |
| --- | --- | ---: |
| npm test -- --maxWorkers=1 | Exit 0. 526 files, 18,501 tests passed, one skipped. | 932.19 |
| npx eslint src | Exit 0. | 20.97 |
| npm run build | Exit 0. | 35.16 |

Runner exit: 0. Starting and final source commits match. The only untracked file at the end is the completed final binding review. All owned gate processes stopped. FULL_GATE_DONE / CHROMIUM_IDLE was sent to both owners. No following generator heavy reservation remains.

The independent base source/SQL review passed (83 tests, 19 SQL cases), and the final typed-RPC review passed (86 tests, eight adapter checks). Those are separate evidence sets. No open finding remains. The broken-adapter control failed and the exact restored source passed. Hosted migration 20261107144016, generated types, role/RLS and synthetic rollback proof are recorded separately.

The full suite proves the fixed source passes current automated checks. The build proves application types and the production build. Neither proves complete legacy sources, a successful next-plan decision, live Auth/browser behavior, recognition, UI approval or activation.

No UI, API route, active caller, generator, printed source or book queue changes in this slice. It persists unavailable source reviews only. #472 remains open; #473 remains blocked by incomplete #472 dependency evidence and UI approval. Customer R2, all 14 comments, print approval/Mark printed, email, charges, deletion, provider/key/limit and queue holds remain.

Raw logs are private at /Users/savargupta/unica-workbook-samples/overnight-20261107/472-preview-final-db335199/.
