# S8 fixed-head independent review

VERDICT: REJECT 7fe942bc2923ab9b51247c23463e8302e251499c

One P2 privacy defect is reproducible. The Spec review fails on malformed encoded URL redaction. The Standards review fails on the same privacy boundary. No other reproducible defect was found within the permitted checks.

## Source and authority

- Computer: Savars-MacBook-Pro-5.local.
- Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc`.
- Resolved worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc`.
- Branch: `site/scan-page-history`.
- Candidate: `7fe942bc2923ab9b51247c23463e8302e251499c`.
- Base: `6acaa2637ad88f88462800a056cdeddcc90678e2`.
- Implementation: `80141a50e65be08658428900c50cc6526d31e923`. Both the base and implementation are candidate ancestors.
- The branch, candidate and clean tracked/untracked state were checked before and after the review.
- Authority: cached `pd470-current-issue.json`, `pd470-build-brief.md`, `pd470-review-brief.md`, applicable AGENTS.md, DESIGN.md and documented scan contracts. The Unica evidence review procedure was applied.
- The accepted hidden-release limit and the D-235 sample-approval exception remain in force. Maya must remain disabled until S9 and #337. This review grants no merge or release approval.

## Falsifiers stated before checks

Duplicate or missing canonical pages, incomplete cursor traversal, lost finalized results, altered original readings, wrong filtered counts or costs, foreign-family access, failed deletion fences, omitted unknown cost reservations, forbidden analytics fields, analytics after consent withdrawal, or delayed work applied to a replacement account would disprove the related claim.

For the added adversarial check, a private encoded URL retained by a public analytics callback would disprove URL redaction. This check reached that result.

## Finding F1

**P2: Reject malformed encoded private URLs before analytics.**

Location: `src/lib/url-tokens.ts:7`. Related consumers: `src/lib/analytics.ts` and `src/components/site-analytics.tsx`.

`decodedRoute` applies `decodeURIComponent` to the entire input. A malformed escape or invalid UTF-8 byte makes it return the original input. If route separators are still encoded, `scanRoute` and `adminRoute` do not recognize the private route. The analytics callbacks then retain its identifiers.

Reproduction input A:

```text
https://unicalearning.com/account%2Fscan%2Fresults%2FPRIVATE_PHOTO%ZZ?child=PRIVATE_CHILD
```

Reproduction input B:

```text
https://unicalearning.com/error%2Fapi%2Faccount%2Fscans%2FPRIVATE_PHOTO%FF%2Fimage?token=PRIVATE_TOKEN
```

Observed results on the exact candidate:

| Public callback | Input A | Input B |
| --- | --- | --- |
| PostHog configured `before_send` | Returns a pageview with `PRIVATE_PHOTO` in `$current_url` | Returns a pageview with `PRIVATE_PHOTO` in `$current_url` |
| `scrubAnalyticsEvent` | Returns the full URL with `PRIVATE_PHOTO` and `PRIVATE_CHILD` | Returns the full URL with `PRIVATE_PHOTO` and `PRIVATE_TOKEN` |
| `scrubSpeedEvent` | Returns a URL with `PRIVATE_PHOTO` | Returns a URL with `PRIVATE_PHOTO` |

Scenario: an encoded scan address with a malformed escape reaches an error-page URL or a later public telemetry callback. The application callback permits the private address to leave. This violates the explicit encoded/error-path redaction requirement. The fixed anonymous scan-event transport does not cause this defect and does not protect these other telemetry callbacks.

Likelihood: low in ordinary navigation. It requires malformed external input or a damaged encoded address. Disclosure is deterministic once either input reaches these callbacks. This is a specific privacy failure, not a claim that normal scan URLs leak.

Smallest complete fix: make route decoding fail closed when it cannot safely classify the input. Apply that decision to the shared route predicates and all analytics consumers. Add public-interface regression cases for malformed percent escapes and invalid UTF-8, including nested/error paths. Keep valid public-page controls to protect existing non-scan behavior. Do not return an undecoded private candidate as safe.

Proof class: local, in-memory compilation of the exact candidate and calls to public module interfaces. The PostHog check uses the actual callback produced by `createAnalytics`, with a fake client. The Vercel checks call the actual exported callbacks. No browser, service, SDK network transmission or external ingestion ran. Two positive controls passed. Six privacy assertions failed across two inputs and three consumers.

The following read-only command reproduces the eight assertions. It writes no file and makes no network request. Run it in the frozen worktree:

```sh
node <<'JS'
const { build } = require('esbuild');
const { Module } = require('node:module');
const path = require('node:path');
(async () => {
  const r = await build({
    stdin: { contents: "export { createAnalytics } from './src/lib/analytics'; export { scrubAnalyticsEvent, scrubSpeedEvent } from './src/components/site-analytics';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external'
  });
  const m = new Module(path.join(process.cwd(), 'review-memory.cjs'), module);
  m.filename = path.join(process.cwd(), 'review-memory.cjs');
  m.paths = module.paths;
  m._compile(r.outputFiles[0].text, m.filename);
  const a = m.exports;
  let before;
  const client = { init(k, c) { before = c.before_send; }, capture() {}, reset() {}, opt_in_capturing() {}, opt_out_capturing() {} };
  a.createAnalytics({ key: 'synthetic', load: async () => client, getConsent: () => 'granted', subscribe: () => () => {}, clearStorage() {}, whenIdle: f => f(), path: () => '/' }).begin();
  await new Promise(r => setImmediate(r));
  let total = 0, passed = 0;
  const check = (name, ok) => { total++; passed += Number(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
  const consumers = {
    posthog: url => before({ event: '$pageview', properties: { $current_url: url } }),
    vercel: url => a.scrubAnalyticsEvent({ type: 'pageview', url }),
    speed: url => a.scrubSpeedEvent({ type: 'vital', url })
  };
  check('valid private URL blocked', Object.values(consumers).every(f => f('https://unicalearning.com/account/scan/results/PRIVATE_PHOTO?child=PRIVATE_CHILD') === null));
  check('public control retained', Object.values(consumers).every(f => f('https://unicalearning.com/resources') !== null));
  for (const url of [
    'https://unicalearning.com/account%2Fscan%2Fresults%2FPRIVATE_PHOTO%ZZ?child=PRIVATE_CHILD',
    'https://unicalearning.com/error%2Fapi%2Faccount%2Fscans%2FPRIVATE_PHOTO%FF%2Fimage?token=PRIVATE_TOKEN'
  ]) for (const [name, f] of Object.entries(consumers)) {
    const out = f(url);
    check(name + ' removes private values', !JSON.stringify(out).includes('PRIVATE'));
    console.log(JSON.stringify(out));
  }
  console.log({ total, passed, failures: total - passed });
  process.exitCode = total === passed ? 0 : 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
JS
```

## Independent checks

All counts below come from the executed local set on the computer named above. Supplied root/worker results are excluded from these counts.

| Check | Actual result |
| --- | --- |
| Focused Vitest run | 71 passed, 11 files passed, exit 0 |
| ESLint on changed TS/TSX files, excluding generated types | 27 files, exit 0, no diagnostics |
| `scan_marking.cjs --bootstrap` | 48 passed, 0 failures, exit 0 |
| `scan_mark_changes.cjs` | 36 passed, 0 failures, exit 0 |
| `scan_history.cjs` | 9 passed, 0 failures, exit 0 |
| Added URL privacy assertions | 8 assertions, 2 passed, 6 failed, exit 1 |

The focused run selected these existing files: `scan-history`, `scan-analytics`, `scan-sdk-boundary`, `scan-track`, `analytics` and `url-tokens` under `src/lib`; `scan-history`, `scan-pages`, `scan-mark-change` and `scan-marking-results` under `src/components`; and `src/app/api/account/scans/history/route.test.ts`. The command also supplied a `src/components/site-analytics.test.ts` filter. That file does not exist and contributes zero tests. Its exported callbacks are covered through the existing URL/scan tests and the added assertions.

SQL ran in the required order on a new owned cluster at `/tmp/pd457-pg-s5-pd470-review-7fe942bc`, database `pd457_s8_review`. Runtime settings confirmed an empty `listen_addresses` value and the exact Unix socket directory. The database contains only disposable synthetic fixtures. All 93 SQL cases passed. No existing database or service was used.

The S8 runner also proved that the old command lacks the history projection, the saved S4/S5 command body is unchanged, and the Send body is unchanged. This is a binding old-state control. No independent fixed-base run of the new Vitest files was made. Some new modules do not exist at the base. The local SQL fixture tests have the reduced dependency limits documented in `docs/scan-marking.md`.

## Spec and Standards coverage

| Subsystem | Independent result and limit |
| --- | --- |
| Canonical results and retention | SQL and public projections passed concurrent changes, stale responses, retakes, retained original readings, expiry, parent-change history and more than 100 records. Synthetic dependency tables and transport seams do not prove hosted contention or Storage delivery. |
| Parent/Admin history | The shared adapter passed full cursor traversal, sparse status filters, one canonical page, filtered counts, parent/Admin parity, foreign-family refusal and fake-Admin refusal. Component checks passed grouping and links to existing review. These are local SQL/DOM checks, not independent browser proof. |
| Cost monitoring | Displayed-record sums, failed/uncertain spend, logical calls, dispatch attempts, unknown reservations, per-accepted cost and the separate global budget passed. Orphan holds survived link deletion. Synthetic amounts do not prove provider billing or prices. Splits use saved job outcomes and do not claim per-request outcomes absent from the ledger. |
| Deletion and authorization | Local browser-role refusal, family/child freezes, cascades and late-write fences passed. No new table or bucket was added. Local roles do not prove hosted effective privileges. |
| Consent and account changes | Existing tests passed all 13 fixed pairs, no replay, unset/denied consent, withdrawal/abort, replacement-account work, and the installed SDK boundary. The separate anonymous packet has only fixed status and protocol fields. No actual ingestion or signed-in browser was independently checked. |
| URL privacy | Normal encoded, nested and error-path tests passed. The additional malformed-encoding cases failed as F1 records. This fails the Spec privacy criterion and the Standards privacy boundary. |
| Existing operations and release | Command/Send controls and S4/S5 tests passed. Source review found no scoring, model, controller, release flag, price or CI workflow change. The generated type diff adds only the saved command signature. No query type override was added. |
| Product controls and copy | Existing result and Admin detail views are reused. The Maya control remains disabled. Results-only navigation passed the component check. Public native-app copy was changed to browser scanning. Layout, physical hit targets and human screen approval were not independently checked. |

I read `.design/experiments/r470/checks.json`, `hosted.json`, `browser.json`, `evidence.md`, `scenarios.md`, `manifest.json` and `root-verification.md`. The supplied hosted migration/rollback results, generated-type command, full suite, full lint, build and browser checks remain supplied evidence. They are not independent passes in this review. The first hosted probe's stale-version failure and the screenshot's earlier singular grammar are documented corrections, not current findings.

No full suite or build ran in this review. No source edit, package install, credential read, hosted/browser/provider/email/paid call, agent, push, merge or PR comment ran. Only this report, the brief completion marker and the authorized disposable SQL fixture were written.

## Final state

The PostgreSQL cluster stopped successfully. `pg_ctl status` then reported no server running. The owned Vitest, ESLint, SQL and in-memory probe commands completed. No owned background test or application process remains. The frozen source remains clean on `site/scan-page-history` at `7fe942bc2923ab9b51247c23463e8302e251499c`.

Required action: correct F1 and review a new fixed candidate. Keep the existing merge reservation and family-release limits.

VERDICT: REJECT 7fe942bc2923ab9b51247c23463e8302e251499c
