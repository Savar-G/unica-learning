VERDICT: APPROVE 9b30dda230e2d1414049009f476edf437173f93a

No integration defect was reproduced. This approval covers the bounded integration review. The root must complete the frozen candidate full gate separately. This report gives no merge, print, family activation or delivery-email approval.

## Source and scope

Computer: Savars-MacBook-Pro-5.local.
Source: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-bda8c699.
Physical source: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-bda8c699.
Verified branch: site/parent-workbook-access.
Frozen candidate: 9b30dda230e2d1414049009f476edf437173f93a.
Prior published answer-key head: 89b5c074d00df044c703769424a84712d88d49cc.
Approved answer-key runtime: f0e2129cb8624c59b9502e39dfdc03954c90a41a.
Actual merged marking dependency: cfab81916a5e81d075f355c3f6c54cca646b6000.
Previous common main: de9404ee545517387a241d79f19f1d70ab1e3201.

The machine, branch, exact HEAD and clean status passed before review. The final source checks passed again. The controlling billing checkout was not used as source. No worker was started.

I read pr685-integration-review-brief.md and found HANDOFF_PR686_PR685_INTEGRATION_REVIEW with rg at line 1. I read the committed independent-spec-final.md, independent-standards.md and root-verification.md in .design/experiments/r-parent-workbook-access. I read the incoming r459 verification record, the applicable source instructions, and D-246, D-247 and D-293. I used the Unica evidence-review procedure within the brief's limits.

Before checks, I stated these failure conditions: changed approved answer-key source; a delivered key blocked by marking policy; a key released before delivery; weaker family ownership or PDF controls; or a failed focused public-interface check.

## Source equality

The candidate has the two stated merge parents: 89b5c074 and cfab8191.

The incoming diff contains exactly 15 files. All 14 files outside .design/decisions.md match the actual cfab8191 marking merge by Git content comparison. The decision diff adds only D-293. D-246 and D-247 remain intact.

The approved answer-key change contains 38 changed paths under src, supabase and package manifests relative to de9404ee. All 38 paths match the approved f0e2129c runtime in the frozen candidate. The published 89b5c074 head has no runtime delta from f0e2129c.

There are 12 incoming paths under the runtime and test roots: nine src paths and three supabase paths. No answer-key, package validator, generator, template, renderer, print engine, print-contract or package-manifest path changed in this integration. This equality supports the bounded review scope. It does not repeat the previous feature or print review.

These source counts were calculated again immediately before the report. There were zero content mismatches in the compared sets.

## Combined behavior

| Requirement | Result and evidence |
| --- | --- |
| Immutable stored packages | Eight synthetic packages passed checkQuestionPackage and the JSON storedQuestion reader. The same stored objects supplied marking and readParentWorkbookAnswers. Their complete serialized book and key stayed unchanged after every scalar reading and after simulated parent judgments. The local SQL probe also compared the complete package JSON before and after the production trigger. |
| Two-ways review plus available key | expectedItems selected parent review. readMarkingOutput left the item parent-pending with no automatic result. cropPlan included both method regions and the final answer. Parent right, wrong and blank judgments completed the marking view without publishing mastery. The delivered answer key retained the stored final answer in all three cases. Source: src/lib/scan-observation.ts:175, src/lib/scan-marking-regions.ts:20 and src/lib/parent-workbook-answers.ts:76. |
| Fraction and decimal answers | The shared stored inputs covered 3/11, -3/11, 2 1/5, 6.25, -0.75, zero and an integer. Equivalent forms passed. Opposite signs and clear zero denominators were wrong. Mixed numbers with signed denominators and decimal strings that would lose precision remained pending. The key continued to show the stored answer. Source: src/lib/scan-marking-fractions.ts:11, src/lib/scan-marking-numbers.ts:2 and src/lib/scan-marking.ts:107. |
| Whole keys without marking | The answer reader returned all eight questions from two pages before any marking result existed. It sorted the shuffled pages and questions. The same key opened with printedRevision set to null. The output contained no raw package, image, private path or marking data. |
| Delivery and ownership | Missing and future receipts, wrong parent, sibling, wrong workbook and wrong book number returned no key before content reads. A receipt retracted or changed to a future date during content loading returned no key on the second check. Source: src/lib/parent-workbook-answers.ts:108. |
| Restrictive answer policy plus trigger | Both production migrations ran in a disposable local PostgreSQL fixture. The marking migration corrected an existing canonical expected record before delivery and advanced its revision. An old service writer could not restore automatic expected policy. Parent reads remained empty before delivery. A valid receipt exposed the complete unchanged package with no marking result. Parent marking changes did not remove it. A later future correction or receipt removal denied it again. |
| Trigger identity and privilege limits | Local controls changed parent, workbook, page and item identity separately. None matched the two-ways rule. Authenticated direct marking updates failed. anon, authenticated and service_role lacked direct EXECUTE permission on the trigger function. Service table writes still invoked the trigger. Source: supabase/migrations/20261106192851_scan_two_ways_review_policy.sql:3. |
| PDF and desk controls | The unchanged parent PDF GET passed its 410 and no-signing tests. The desk tests passed. Independent missing/future-receipt controls returned awaiting-delivery with zero package reads. Source: src/app/api/account/workbooks/[id]/pdf/route.ts:4 and src/lib/desk.ts:130. |

The trigger reads workbook_questions and changes only new.expected on scan_marking_items. Its backfill updates marking expected policy and marking revisions. It does not update workbook packages, delivery receipts, delivery corrections, question SELECT policies or Storage policies. The marking command remains a service-only SECURITY DEFINER interface. Its trigger lookup therefore does not depend on a parent's pre-delivery question visibility. The local bypass-role control supports that source trace. The reduced fixture does not exercise the complete hosted marking RPC.

## Executed checks

Focused tests passed: 10 files, 290 tests, zero failures, exit 0.

```sh
./node_modules/.bin/vitest run --maxWorkers=1 --no-cache src/lib/parent-workbook-answers.test.ts src/lib/parent-workbook-answers-server.test.ts src/lib/workbook-delivery-access.test.ts src/lib/desk.test.ts src/lib/scan-marking.test.ts src/lib/scan-observation.test.ts src/lib/scan-calibration.test.ts src/lib/scan-crops.test.ts 'src/app/api/account/workbooks/[id]/pdf/route.test.ts' 'src/app/(product)/account/(dashboard)/workbooks/[child]/answers/[workbook]/page.test.ts'
```

The independent public-interface probe passed 41 controls, zero failures, exit 0. It compiled in memory with esbuild. It called checkQuestionPackage, storedQuestion, readParentWorkbookAnswers, expectedItems, readMarkingOutput, observationProblem, markingEvent, markingPageView, cropPlan and deskView. It used eight accepted packages. The distribution was 25 scalar-reading controls, one initial whole-key control, one two-ways review control, six receipt controls, two receipt-change controls, three request-identity controls, one legacy no-revision control and two desk controls. These counts total 41. Several assertions occur inside one control and are not counted as separate controls.

The SQL probe passed 17 cases, zero failures, exit 0. It loaded supabase/tests/workbook_answers_delivery.cjs in memory and added five integration cases. The unchanged 12 baseline cases include the old-policy leak control, delivery identity and latest-correction checks, family and role checks, PNG/PDF metadata checks, and an extra permissive policy that cannot bypass the restrictive delivery policy. The five added cases cover migration/backfill, an old service writer, trigger identity limits, a delivered key across marking choices, and later receipt denial. The role and package fixtures are reduced local models. The probe used the actual production SQL for both policies. Its database cluster stopped and its data directory was removed.

One SQL wrapper attempt failed on JavaScript quotation before product code or the database ran. One interface probe setup failed because the synthetic work regions had null labels. The real package checker refused that invalid fixture. I corrected the wrapper and fixture. The completed runs above passed. These setup failures are not product defects or passing checks.

The counts above are separate evidence sets. They must not be added as independent feature coverage. The SQL baseline demonstrates the former pre-delivery leak. This integration review makes no new fail-before-fix claim for the already-approved answer-layout repair or marking implementation.

## Proof limits

Answer reader: local public-interface controls proved stored key content, ownership checks and receipt checks. They did not prove a current hosted session.

Marking: local public-interface controls proved result typing and parent-review behavior with synthetic readings and measured boxes. They did not prove handwriting recognition, camera geometry, printed geometry or a real customer book.

Database: disposable PostgreSQL proved both production policy predicates and the trigger together under reduced roles and tables. It did not prove current hosted grants, deployed migration state, the complete marking command, concurrent hosted sessions, PostgREST or Storage signing APIs.

PDF and desk: local route and fake-store tests proved the denial and pre-delivery branches. They did not exercise a current browser, PIN flow or real file request.

The committed answer-key and marking reports supply earlier hosted and browser evidence. I read those records. I did not repeat or independently refresh that evidence. The root brief supplies earlier required CI and Vercel results. I did not query remote PR checks or review state.

The combined full suite, lint and build are the root's separate gate. This reviewer did not run them and does not claim they passed at 9b30dda. The prior runtime full gate is historical evidence only.

No full suite, lint, build, Chromium, browser, hosted query/write, paid/provider call, migration against a hosted project, install, source edit, commit, push, PR comment, email or family/price switch ran. No stored book was rendered again. D-267 recognition proof, human print approval and family release approval remain separate requirements. No integration defect or separate Standards defect was reproduced. No unproved concern is reported as a finding.

## Cleanup

All owned test and probe processes exited. No background process was started. The temporary interface and SQL probe files were removed after their results were recorded. The local database helper stopped its cluster and removed its data directory. The final process check found no owned test, probe or database process. The source checkout stayed clean at the exact frozen candidate. The only persistent review writes are this report and the required marker change in the external brief.

VERDICT: APPROVE 9b30dda230e2d1414049009f476edf437173f93a

PR https://github.com/Savar-G/unica-learning/pull/686, head 9b30dda230e2d1414049009f476edf437173f93a, checks and reviews focused checks passed; independent integration review APPROVE; root full gate not verified by this reviewer; remote checks and reviews not queried.
