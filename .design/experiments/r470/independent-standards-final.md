# PD470 final Standards review

Standards result: APPROVE. No reproduced Standards defect remains in the assigned scope. F1 is corrected at the shared decoding boundary. The scan-pages merge preserves the documented session guards and static Admin presentation input. This report gives no Spec verdict or merge/release approval.

## Source and authority

- Computer: Savars-MacBook-Pro-5.local.
- Runtime: Codex gpt-6.1-sol, high reasoning effort. No child agent ran.
- App-created checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc`.
- Resolved checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc`.
- Branch: `site/scan-page-history`.
- Candidate: `c7850f56beb10dde86b4d49b43315eacb2249992`.
- Merge parents: repaired S8 `2034c13011a3335bf9585aa4a6de5b7716a5737e` and main `bd99961874a88700ca7de2ac72609a0aaed69f75`.
- Full review range: `bd99961874a88700ca7de2ac72609a0aaed69f75...c7850f56beb10dde86b4d49b43315eacb2249992`.
- Repair range: `7fe942bc2923ab9b51247c23463e8302e251499c..2034c13011a3335bf9585aa4a6de5b7716a5737e`.
- Branch, HEAD and clean tracked/untracked status matched before and after the checks.

I read the brief first. Its literal `HANDOFF_PD470_FINAL_RECHECK` marker matched. Authority was the cached #470 issue, the original independent report, applicable AGENTS.md and DESIGN.md, docs/scan-pages.md, docs/scan-marking.md, and the cited r470 repair, integration, evidence and root-verification reports. I used the Unica evidence review procedure. The assigned narrow checks replace the general full-gate step for this review.

## Failure conditions

A changed source pin, a retained private URL value, refusal of a valid public control, a stale response/error applied after child/account replacement, a lost static preview state, or changed Send/S4/S5 code from conflict resolution would prevent approval. These conditions were stated before the related checks.

## F1 and the shared decoding boundary

Relevant source: `src/lib/url-tokens.ts:5-11`, `src/lib/analytics.ts:35-40,77-94,157-163`, and `src/components/site-analytics.tsx:13-32`.

The repair changes the decode failure result from the partially decoded input to the existing private Admin classification. Excess encoding already uses that classification. Both route predicates, the path/URL redactors, PostHog's configured before_send callback, and the Vercel callbacks use the shared module. The exported interfaces and their callers remain unchanged. This is a telemetry classification result. It does not rewrite application routes or grant authorization.

Independent controls bundled the actual public exports with esbuild `write:false` and compiled them in memory. A fake Client captured the callback configured by createAnalytics. The Vercel checks called scrubAnalyticsEvent and scrubSpeedEvent directly. No transport or hosted SDK call ran.

Candidate results: **94 assertions passed, zero failed**.

| Control | Passed |
| --- | ---: |
| 15 private inputs through each of the three public callbacks; each returns null | 45 |
| The same inputs through both redactors; no PRIVATE marker remains | 30 |
| Five valid public inputs through all three callbacks; each remains admitted | 15 |
| Encoded public space remains unchanged through both redactors | 2 |
| Malformed referrer/nested breadcrumb removes private text; previous-page duration is removed | 2 |

The private set includes all five repair inputs, canonical parent/image routes, nested query/error routes, backslashes, repeated separators, uppercase Admin, double encoding, twelve encoding layers and invalid UTF-8. Public controls are `/resources`, `/resources/math%20games?src=home`, `/blog`, `/account/scanner`, and `/resources?src=home`, with the first two supplied as full HTTPS URLs.

The original F1 inputs were:

```text
https://unicalearning.com/account%2Fscan%2Fresults%2FPRIVATE_PHOTO%ZZ?child=PRIVATE_CHILD
https://unicalearning.com/error%2Fapi%2Faccount%2Fscans%2FPRIVATE_PHOTO%FF%2Fimage?token=PRIVATE_TOKEN
```

For an independent old-state control, I replaced only the bundled url-tokens module with `git show 7fe942bc2923ab9b51247c23463e8302e251499c:src/lib/url-tokens.ts`. All six original F1 callback checks retained private text. All 15 callbacks across the five repair inputs accepted an event with the old decoder. The candidate rejects all 15.

The first old-state check required private text to survive all 15 outputs. That expectation was too broad. Thirteen outputs retained private text. PostHog and Speed already removed the query-only text in the third input. The corrected old-state check requires event acceptance for all five inputs and retained private text for the two original F1 inputs. It passed. This correction changes no candidate result.

Standards conclusion: one shared failure decision protects the existing consumers. No duplicate decoder or unused abstraction was added by the repair. The documented conservative telemetry refusal is deliberate. The smell heuristic does not establish a naming or type defect from the `/admin` sentinel alone.

## Scan-pages integration

Relevant source: `src/components/scan-pages.tsx:24,90-112,133-167,469-471`; static renderer: `src/components/admin-parent-preview.tsx:100-104,161,167-176`.

Independent Node component controls called the public ScanPages component. Static checks used renderToStaticMarkup. Mounted checks used React DOM and the installed happy-dom test dependency. Auth callbacks, fetch, photo preparation, analytics tickets and Next link/image presentation used synthetic seams. The real component, stack projection and state transitions ran.

**37 assertions passed, zero failed**:

- Twelve static presentations covered empty, ready, refused, sent, loading and unavailable states in phone and desktop modes.
- One static check confirmed zero fetches, auth subscriptions, photo preparation calls or event emissions.
- Four immediate mount checks confirmed the current child's list request.
- Six child checks confirmed a new request, visible replacement listing and preservation of that listing.
- Eight late-result checks covered success and failure after both child and account replacement. No old listing or stale load error appeared.
- Four account checks retained the account-change message and prevented a later polling request.
- One positive error control confirmed a current request failure still displays the load error.
- One cleanup check confirmed zero remaining auth subscriptions or scheduled intervals.

The requests overlapped within each child case. The replacement request completed before the held old success or error. No time delay was required to make the mount usable. The first component attempt stopped because jsdom was absent. I installed nothing. The complete repeated run used the repository's happy-dom dependency and passed.

Seven independent source comparisons also passed:

1. Starting with the repaired S8 scan-pages file, applying exactly six main presentation edits produces the candidate byte for byte. These edits export/rename ScanListing, add the optional initial prop and its type, initialize listing and loadFailed, and update the local data type. They retain all S8 guards.
2. The complete Admin static renderer is identical to main.
3. Send and the selected S4/S5 reader, publication, store, server and migration files are identical to repaired S8.
4. Those same files are identical to main.
5. The only scan source file changed during integration is scan-pages.tsx.
6. The repaired shared URL decoder is identical to repaired S8.
7. The shared history reader is identical to repaired S8.

The protected comparison set was `src/app/api/account/scans/send`, `src/lib/scan-marking.ts`, `scan-marking-store.ts`, `scan-marking-reader.ts`, `scan-marking-server.ts`, and migrations `20261105_scan_marking.sql` and `20261106_scan_mark_changes.sql`. The reader still supplies shared persisted-mark decoding through mark and markingCommand. The merge adds no second review or publication path.

## Findings and proof limits

Findings: none reproduced. I applied the supplied smell list as a heuristic under the documented source rules. I found no additional behavior failure that justifies a smell finding. Tool-enforced rules were not repeated as findings.

Analytics proof covers public callback decisions and returned data in memory. It passes through fake consent/client/transport seams. It does not prove external ingestion or a browser runtime.

Component proof covers presentation strings, effect suppression in static rendering, and controlled replacement ordering. It passes through synthetic Auth/fetch and link/image presentation. It does not prove live authentication, image delivery, physical hit targets, layout or device behavior. Source equality proves code preservation, not a new execution of S4/S5 SQL or publication recovery.

Root's final supplied logs show 456 test files passed, 16,854 tests passed and one optional skip. Full tests, source lint and build each record EXIT_STATUS=0. I read those logs. I did not repeat that gate. Hosted and browser records remain supplied evidence only. Human screen approval, shared launch acceptance and the existing family-release limits remain pending as accepted in the brief.

All independent commands completed in the foreground. React roots were unmounted. Synthetic subscriptions and intervals were cleared. The happy-dom window was stopped and closed. No server or database was started. No owned background process remains.

Only this report and `pd470-final-standards-complete.md` were written. Source, generated types, tests, packages, database, environment and Git state were not changed. No credential read, hosted write, paid call, browser work, full suite, push or PR action ran. The final source remains clean on the stated branch and SHA.

VERDICT: APPROVE c7850f56beb10dde86b4d49b43315eacb2249992
