SPEC FAIL. One P2 finding. No release or merge approval.

Computer: Savars-MacBook-Pro-5.local. Model: gpt-6.1-sol, high effort. Provider account identity was not independently queried.

Logical path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-3a2db250`.
Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-3a2db250`.
Final branch: `t3/pause-provider-spec-review`; initial branch: `t3/3a2db250`.
HEAD: `2c3ce6bb200f42e3b75c34b8b0f328794a01439c`.
Base: `f3133376535b3c96f4c81f62f1f8d1cc80322a23`.
Initial and final status: clean.

P2 SPEC-1: Validate pause billing settings during recovery.
Source: `src/lib/plan-pause-stripe.ts:90-94`; effect: `src/lib/plan-pause.ts:91`.
Requirement: `docs/plan-controls.md:52`, “Recovery requires that exact key, subscription, dates and settings.”
The matcher checks resume settings but omits pause settings. After a lost create response, change `pause.settings.bill_for.unused_time_from.type` to `item_current_period_start`. Recovery returns true. Public `confirmPause` then marks the operation applied and removes its hold. The credit terms differ from the admitted no-credit request. Changing pause usage or invoice settings also passes. Likelihood: low; requires changed provider settings during recovery. Smallest fix: compare all pause settings sent at lines 74-75 before accepting proof. This omission also exists in the base. It is an unmet assigned invariant, not a new regression.

Independent checks:
- 62 existing tests passed across five files. Exact command: [checks](/tmp/pd-pause-provider-spec-checks.json). [Log](/tmp/pd-pause-provider-spec-focused.log).
- 33 public-interface controls: 29 passed; four controls failed for SPEC-1. UUID, metadata restriction, lost-response, key/date/subscription/resume-setting refusal, active/detached schedules, HTTP uncertainty, trial metadata, ownership, concurrency and API-version checks ran. [Results](/tmp/pd-pause-provider-spec-probe-results-r2.json).
- Two refined credit checks failed. [Hold evidence](/tmp/pd-pause-provider-spec-hold-observation.json).
- Five webhook controls passed. Both earlier-source repair controls failed as expected.

Webhook plan: source/config PASS. Preserve endpoint `we_1UYU6EGTsggtqumUYLBZuh4k`, its URL, API `2026-09-30.endive`, secret and five events. Add only paused/resumed. `plan-state.ts:21` and the existing route support both. No hosted change ran.

Supplied proof: recorded Stripe trial plus five paid scenarios; cleanup of nine clocks/customers; 16,613 tests passed, one skipped, lint/build passed. These were not independently repeated.

Limits: synthetic transport and memory-store evidence only. No issue fetch, credentials, provider, hosted, browser, paid calls or children. Source stayed unchanged. The temporary dependency link was removed. All commands stopped. Evidence remains in `/tmp`.

SPEC FAIL.
