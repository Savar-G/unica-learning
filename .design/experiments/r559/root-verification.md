# Pause and paid Restart verification

Machine: `Savars-MacBook-Pro-5.local`.
Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-pd-plan-controls`.
Branch: `site/pd-plan-controls`.
Implementation base: `89ecf73965eccbf0f59e49401b69cf09a4e12579`.
Corrected implementation: `47cfae5a1ece589152f005fb3daf892676295de2`.

The root integrated the completed repair with a fast-forward. The dirty main checkout stayed untouched. The six original findings and binding before/after cases are in [the repair report](bf76-repairs-report.md).

## Checks

- Full suite: 16,403 passed, one optional skip, 427 files, exit 0. The first run found four PostgREST fixtures that still returned an array for the new ownership-filtered mailing RPC, plus an obsolete assertion that prevented card correction for an ended plan. The fixture and assertion changes passed 64 focused tests, then the complete suite passed. No product response was relaxed to make these tests pass.
- Full source ESLint: exit 0.
- Production build: exit 0 after removal of the temporary browser fixture. The first post-browser build found the deleted fixture in local generated development route declarations. Those declarations were removed before the successful final build.
- Hosted migration `plan_controls`: applied as `20261106010709` to `cdjobwsyzndtltzfpyqa`. `list_migrations` confirmed it. `npm run db:types` generated the committed snapshot. The snapshot also includes the already installed S4 schema. It was not edited by hand.
- Hosted rollback: `PLAN_CONTROLS_HOSTED_PROBE_OK`, zero probe parents. The final query also found zero probe Auth users, control operations and Restart requests. The probe creates only synthetic rows and removes them through a caught subtransaction. It creates no Storage object and makes no provider request.
- Browser: 29 synthetic cases, nine viewport screenshots, at 390, 820 and 1440 pixels. All observed control buttons were at least 44 pixels high. No horizontal overflow or duplicate dashboard frame occurred. Keyboard Enter opened the price confirmation. Its focus outline was two pixels. The fixture used the actual `ParentShell`, `SupportPage`, `AccountBilling`, `PlanControl` and `CancelPlan` components.
- Browser fallback: T3 preview evaluation worked, but its screenshot snapshot timed out twice with `Preview automation snapshot timed out after 15000ms`. Aside `u0` supplied the permitted fallback. Aside's full-page stitching repeated a viewport; the final evidence uses viewport screenshots. A draft browser check read the keyboard response while it was still pending. The final check waits for the confirmation. All 29 final cases passed. The temporary fixture, server and owned tabs were removed or stopped.

## What the checks prove

| Subsystem | Proved | Passed through or unverified |
| --- | --- | --- |
| Admission and mailing | Hosted service-role ownership checks; duplicate admission does not resend; stale year refused; pending Pause blocks deletion; preparation and shipment cannot skip a paused target | Hosted probe uses one connection. Local repair evidence covers bounded concurrent paths. No real shipment occurred. |
| Cancel and Restart | Refused cancellation preserves confirmed state. Applied cancellation retires the prior mailing effect without removing allowance use. An old initial caller cannot receive a paid Restart key. A resolved paid start creates a preparation request. A new run consumes that request. | Subscription responses are synthetic. Actual Stripe acceptance, invoice timing and card setup return are not proved. |
| Deletion and access | Hosted parent/child deletion guards refuse controls; child deletion cascades the new records and preserves its sibling. All new tables have RLS and both write fences. Browser roles cannot read the private tables. Service role has no direct insert grant. | No real family or child was deleted. The probe does not prove the deployed worker scheduler. |
| Presentation | Early/late Pause, success, stale quote, allowance refusal, unsupported plan, pending operation, reload recovery, immediate paid price, declined payment with card correction, cancellation boundary and keyboard activation | A dev-only fixture supplied responses. It does not prove real authentication or provider transport. |

The new private tables add three expected `rls_enabled_no_policy` INFO findings, bringing that count to 30. This is deliberate: no browser role receives a table grant. Existing security-definer warnings remain 24, and the existing leaked-password protection warning remains one. No grants were widened to silence advisors. See [RLS advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The deployed `send_scan_photos` body hash was `1438117e149da92e49eaa4584d43da78` before and after this controls migration. Its sheet-check guard remains present. The controls migration changes no scan function.

## Release and review limits

Dashboard release and family marking stay off. The broader Standards review passed at `581afa22`. Spec review at that head found one further no-plan cancellation defect. The corrected code at `27559f29` passed a new independent Spec recheck with 32 local tests and six expected old-source failures. The corrected full four-worker gate passed 16,403 tests across 427 files, with one optional skip; lint and build passed. See [the final correction and verification](no-plan-repair.md). Main merge and screen approval remain with Savar. Stripe test-mode acceptance, invoice timing, failed resume, release before cancellation, restricted-key permissions and unknown cancellation team procedures remain family-release requirements in [the operating notes](../../../docs/plan-controls.md).

The user's reminder choice remains unchanged: the existing seven-day reminder before the first free month ends. A paid Restart charges immediately. It has no second free month and no additional reminder or delay. Classic paid Pause is refused with the support action. No irreversible billing-mode migration ran.

Source evidence from the original builder is historical. `validation.json` records that earlier state. This file and `browser-evidence.json` record the root's later verification.
