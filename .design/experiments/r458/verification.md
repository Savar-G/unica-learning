# S5 local implementation evidence

Computer: Savars-MacBook-Pro-5.local.
App path: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc.
Resolved path: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc.
Branch: t3/s5-marking-corrections.
Base: f3133376535b3c96f4c81f62f1f8d1cc80322a23.
The starting index and working tree were clean.
Merged S4: 96620ed4. Merged Send repair: b22a7ad6.
Model: gpt-6.1-sol, high. No delegates or provider changes.

## Candidate and contracts

The candidate implements the public parent PATCH action, the existing result screen, the Admin scan history, the canonical SQL version check, append-only changes, and effective profile evidence. It does not implement S6 #470 or the final dashboard #565. It changes no release switch. It adds no bucket or paid request.

The migration preserves the deployed automatic command by renaming it. A service-only wrapper adds explicit parent changes and history reads. Automatic frame, claim, dispatch, extraction and application still use the original whole-sheet, photo and lease checks. The local migration control compared the complete automatic and Send function bodies before and after application. They were identical. The inherited S4 cases passed after the wrapper was installed.

The public action accepts Right, Wrong or Blank against the current canonical version. It binds ownership and immutable print identity through the photo and canonical item. It does not require a live image. A conflict returns the current page. The parent cannot supply an actor, step, reading, model, evidence reference or mastery claim. The original reading and typed values stay intact. A history record retains the prior full canonical record and the new observation with version links and server time.

The review crop uses the canonical observation's evidence photo. A later retake can preserve a mark without supplying the crop for the original reading. The server checks each evidence photo's lifecycle. The image route checks access again when the browser requests bytes.

Event publication keeps one append-only original event. The effective projection replaces its judgment once. Parent changes clear effective mistake and stuck-step causes. Trusted print eligibility still excludes Try first and unscored observations. Profile facts and skill states use the same effective set. The profile store compares both marking revision and build token. A failed skill-history read or write saves a retry flag in the same transaction as the fallback facts. Later AI findings keep this flag. The persisted recovery cursor can finish publication and profile/skill work after image expiry.

## Checks and falsifiers

The result fails if both devices can save one version, if a stale write wins, if an original reading changes, if a retake supplies the wrong crop, if a parent change creates another attempt, or if image expiry disables an explicit choice. Recovery fails if a committed change or failed skill-history step disappears from the retry set. Security fails if browser roles can mutate the store, if a different family can change a result, or if a family or child freeze permits a new write.

- UI and route: 171 tests passed in 12 affected files. These prove public action payloads, explicit choices, no default score, conflict handling, prior parent decisions, desk restrictions, retained text, evidence-photo selection and existing image delivery behavior with local seams. They do not prove rendered browser layout or live authentication.
- Canonical SQL and action: 36 cases passed. These execute the public PATCH, production service action/store/projection/profile rebuild, and production SQL. Authentication and transport seams are synthetic. The tests cover all six result transitions under active, deleted and clock-expired photos; simultaneous devices; parent changes during marking; retakes; original publication failure; profile failure; failed canonical save rollback; stale profile/AI saves; failed skill-history reads and writes; a history longer than 100 changes; service-only privileges; append-only updates; and child/family cascades. They do not prove hosted role or worker behavior.
- Automatic marking and image lifecycle: 48 inherited S4 cases passed before S5 and 48 passed after S5. These prove local admission, version, terminal-photo, late derivative, Storage policy and current sheet-check behavior. They do not prove hosted Storage HTTP calls, provider privacy or recognition accuracy.
- Old-candidate control: loading the base public route fails with `Old public route has no explicit current-version parent correction action`. Exit 1 is the required red result.
- Static checks: `npx eslint src` and `npm run build` passed. Build includes TypeScript. The exact full repository test gate remains with root.

The first standalone TypeScript run lacked Next-generated route declarations. `npx next typegen` supplied them. An early test run found a changed skill-evidence time assumption; the final projection keeps the existing skill-time contract. An early local fixture passed a PostgreSQL array where JSON was required; the fixture now serializes the JSON payload. A repeated inherited suite initially reused enabled synthetic prices from its own prior run. Fresh database setup and a documented local price reset restored the expected disabled-price precondition. These are corrected check attempts, not release proof.

## Exact commands

The dedicated local PostgreSQL cluster used no TCP listener:

```bash
initdb -D /tmp/pd457-pg-s5-dSauCK/data -A trust --no-locale --encoding=UTF8
pg_ctl -D /tmp/pd457-pg-s5-dSauCK/data -l /tmp/pd457-pg-s5-dSauCK/server.log -o "-k /tmp/pd457-pg-s5-dSauCK -h ''" start
createdb -h /tmp/pd457-pg-s5-dSauCK pd457_s5_round2
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-dSauCK SCAN_MARKING_DATABASE=pd457_s5_round2 node supabase/tests/scan_marking.cjs --bootstrap
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-dSauCK SCAN_MARKING_DATABASE=pd457_s5_round2 node supabase/tests/scan_mark_changes.cjs
```

The final S5 rerun used `--installed` after the evidence-photo checks were added. It passed all 36 cases. Before rerunning the inherited S4 suite, the fixture reset its synthetic ledger and disabled its test prices:

```bash
psql -h /tmp/pd457-pg-s5-dSauCK -d pd457_s5_round2 -v ON_ERROR_STOP=1 -c "delete from scan_marking_dispatches; delete from scan_marking_spend; update scan_marking_prices set enabled=false,maximum_micros=null,verified_at=null,evidence=null;"
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-dSauCK SCAN_MARKING_DATABASE=pd457_s5_round2 node supabase/tests/scan_marking.cjs
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-dSauCK SCAN_MARKING_DATABASE=pd457_s5_round2 node supabase/tests/scan_mark_changes.cjs --old-code
npx vitest run src/lib/scan-marking.test.ts src/lib/scan-marking-publication.test.ts src/lib/scan-observation.test.ts src/lib/child-profile-store.test.ts src/lib/child-profile-rebuild.test.ts src/lib/child-profile-skill-states.test.ts src/components/scan-marking-results.test.ts src/components/scan-mark-change.test.ts src/components/scan-preview.test.ts 'src/app/api/account/scans/[id]/marking/route.test.ts' src/proxy-scan-release.test.ts src/lib/scan-image-delivery.test.ts
npx eslint src
npm run build
```

Every command above exited 0 except the required old-route control, which exited 1. Logs are beside this file. Stored logs omit terminal carriage returns and trailing blank space. The local PostgreSQL dependency fixture is reduced. Its tests do not certify every production table or family-retention deadline.

## Root integration order and remaining proof

1. Confirm the merged S4 schema and the existing profile/deletion dependencies.
2. Confirm `20261106_scan_marking_sheet_check.sql` and `20261106_scan_recheck_admission.sql` are installed.
3. Apply `supabase/migrations/20261106_scan_mark_changes.sql` with the authorized hosted tool before deploying the dependent code.
4. Verify the migration catalog, role grants, RLS, both write fences, history cascades, current effective projection, terminal-photo corrections and profile retry flags with hosted rollback probes.
5. Run `npm run db:types`. Commit generated output. No generated type was edited by this child.
6. Run the exact full done gate. Use Aside at phone, tablet and laptop sizes. Check the parent review and Admin pagination with synthetic data. Obtain Savar's visual approval.
7. Keep family marking, scanning and dashboard release closed until the remaining acceptance and sample-approval requirements pass.

Hosted direct download/single signed URL/batch signed URL denial, authenticated route delivery, real QA-family deletion with actual worker credentials, retention deadlines, deployed cron recovery, provider retention/no-training settings, added real-photo uncertainty evidence, recognition accuracy and physical workbook scans remain unverified here. Frozen future-book snapshots were not changed. Existing copied profile values remain unchanged in the local probes. No S6 snapshot/second-try feature was built.

## Cleanup

Cleanup would fail if the dedicated cluster remained running. `pg_ctl -D /tmp/pd457-pg-s5-dSauCK/data -m fast stop` exited 0. The final status check returned `pg_ctl: no server running` with exit 3. Every test pool and build process exited. No browser or development server was started. Disposable fixture data remains on local disk for review. No hosted process or data was changed.
