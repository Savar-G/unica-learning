# Independent review

VERDICT: CHANGES

SEO_REVIEW_DONE

Reviewed on November 1, 2026. Independence: fresh-reviewer.

Worktree: `/Users/savargupta/Github/pagewise-landing-page/.claude/worktrees/seo-priorities`.
Branch: `site/seo-priorities`.
HEAD and base: `35f27b90670e4c2872011e7ac9ec7a54a95da312`.
Candidate: the uncommitted tracked diff against the base, plus all untracked source files from `git status --short` and `git ls-files --others --exclude-standard`.
The combined SHA-256 for the 26 changed or untracked files, excluding this report, is `8039aabbe830f70d3825de871c02aae798c13558b1b107e2883ca515624928d2`. The digest uses sorted paths, each followed by a null byte, file bytes and a null byte.

Rejection conditions: wrong calculator arithmetic; a total for an invalid input; a new product claim that conflicts with the current product; a failed required destination; an indexing regression; or a design gate failure. The review used `plan.md`, `verification.md`, `DESIGN.md`, the requested rubric, the source diff, untracked source, surrounding callers and the supplied evidence.

## Findings

### S1 [blocker] `src/app/(site)/pricing/page.tsx:42` - State the current curriculum restriction before promising a plan

Claim: The new purchase page says parents can choose a plan and add a card after the report. Its lead offers delivery across Canada. Its program-limits paragraph describes incomplete curriculum coverage, but does not disclose that other curricula cannot start a plan. The new assessment guide repeats the unrestricted program choice at `src/app/(site)/math-assessment/page.tsx:42` and `:47`.

Evidence: `OPEN_CURRICULA` contains only `BC` in `src/lib/signup.ts:41`. `src/lib/assessment/report.ts:156` selects the card or waitlist from that restriction. `nextStep` returns no plans for a waitlist in `src/lib/report-view.ts:393`. The existing public-interface tests for an Ontario family passed in this review: the next step is the Ontario waitlist and `plans` is empty. The terms state the BC restriction at `src/app/(site)/terms/page.tsx:19` and `:27`. `DESIGN.md:27` records the broader launch intent, but expressly requires alignment of checkout and terms before publication. This finding concerns the two new pages. Existing national claims are outside this finding.

Reproduction: An Ontario-curriculum parent follows the new pricing page, finishes the assessment and wants the advertised plan. The report offers a waitlist instead.

Smallest fix: State on both new pages that the free assessment is available across Canada, while only BC-curriculum families can currently choose the workbook plan. State that other curricula receive a waitlist option. Keep assessment and billing behavior outside this change.

### S2 [should] `src/app/(site)/math-assessment/page.tsx:32` - Qualify the promised speed result by grade

Claim: The guide promises number-fact accuracy and speed in the parent report for the full Kindergarten-to-Grade-9 audience. Reports below Grade 5 omit speed.

Evidence: `FACT_SPEED_FROM_GRADE` is 5 in `src/lib/assessment/facts.ts:233`. `factsView` checks the school grade at `src/lib/report-view.ts:276` and returns `speed: null` below that threshold at `:289`. The existing public-interface test for Grades 1-4 passed in this review. `DESIGN.md` also specifies accuracy only for these grades in the assessment-report section.

Reproduction: A Grade 3 parent reads the guide and then receives a report with an accuracy result but no speed result.

Smallest fix: Change the bullet to "Number-fact accuracy, plus speed from Grade 5." Do not change report behavior.

### S3 [should] `src/lib/tutoring-cost.ts:8` - Reject invalid currency precision before calculating

Claim: The calculator accepts a monetary input that violates the field's `0.01` step. It rounds the hourly rate before multiplication and shows a total instead of the invalid-input message. That total can differ from the written formula.

Evidence: A fresh call to the exported `tutoringCost` function with `{ hourlyRate: 60.005, hoursPerWeek: 40, weeks: 52, extraFees: 0 }` returned CAD 124,820.80. The displayed formula gives CAD 124,810.40. The difference is CAD 10.40. The rate is not a whole number of cents. The input declares `step="0.01"` at `src/components/tutoring-cost-calculator.tsx:8`, but the change handler at `:26` passes the text to state without a validity check. Lines 16-18 calculate from it. The monetary validation in `tutoringCost` checks range and finiteness only.

Reproduction: Enter the values above in the calculator. The component's calculation path accepts the rate and selects the total branch. This review proved the function result and traced the component path. It did not run a fresh browser check of this case.

Smallest fix: Reject rate and fee values with fractional cents through the public function, consistent with the current field steps. Show the existing invalid-input message for those values. Add a public-interface case for fractional-cent money. Keep valid cent inputs unchanged.

## Verification and proof limits

Fresh checks:

- `npm test -- src/lib/tutoring-cost.test.ts src/lib/report-view.test.ts`: 2 files and 63 tests passed. The calculator tests prove the five supplied arithmetic and validation cases. The report-view tests prove the BC plan, non-BC waitlist and grade-dependent speed behavior. They do not test the new page copy.
- An in-memory TypeScript load called the exported calculator for 13,440 combinations. Rates used whole cents. Hours covered every quarter hour from 0.25 to 40. Week counts were 1, 3, 4, 5, 13, 26 and 52. Fees applied once. Every result matched an independent integer-cent formula. This proves those sampled numeric cases. It does not prove input validation or browser behavior.
- The separate fractional-cent probe reproduced S3. It proves the exported function accepts and rounds that input. The component source shows how a typed input reaches it.
- `git diff --check` passed.
- The CSV files contain 78 query rows, 19 page rows and 23 daily rows. The daily rows total 28 clicks and 2,140 impressions. The disclosed queries total 8 clicks and 741 impressions. The page rows total 28 clicks and 2,200 impressions. The plan correctly distinguishes these sets.
- The supplied `crawl.json` contains 30 rows: all have HTTP 200, a nonempty response, one H1 and the expected canonical URL. All 30 titles are unique. This is an audit of supplied local evidence, not a new crawl. The file has no robots-directive field. The noindex result is reported in `verification.md`; the metadata source retains the production/preview indexing switch.

Supplied checks: `/tmp/unica-seo-tests.log` records 177 files and 9,095 tests passed. Source lint is reported as passed and its log is empty. The build log records a completed production build with both new routes static. This review did not rerun the full test, lint or build gate.

Internal paths and anchor targets were traced through the routes, article sections and shared link components. The six new official FSA destinations have supplied Aside provenance in `verification.md`. This review did not call external services or recheck those destinations live. Provider prices that did not change remain outside scope. No result proves live deployment, Google indexing, ranking, payments or email delivery.

## Design review

REVIEW - SEO purchase pages and quote calculator - 2026-11-01

Independence: fresh-reviewer.
Route: direct. Job: audit. Surface: marketing. Constraint: existing-system.
Contract: `DESIGN.md`, especially purchase information, Resources patterns, D-151 and responsive/accessibility requirements.
Rubric: `/Users/savargupta/.codex/skills/design/references/rubric.md`.

Inspected these viewport images under `/Users/savargupta/.aside/u/0/sessions/2026-11-01_TP9iwHjySlNcKapy/artifacts/`:

- `calculator-mobile.png`: four stacked labelled controls, visible focus on weekly hours and a readable result.
- `pricing-mobile-viewport.png`: the monthly price, trial deadline and sibling-price table fit the phone width.
- `assessment-mobile-viewport.png`: the main statement, lead and Key facts panel use the existing type and corner-square pattern.

The review excludes the repeated full-page captures.

Gates: FAIL.

| Gate | Result | Evidence |
|---|---|---|
| Current product and contract fidelity | FAIL | S1 conflicts with the current purchase path and the D-151 publication condition. S2 promises a report field outside its grade range. |
| Invalid-input state | FAIL | S3 produces a total when the currency input violates its step. |
| Layout in the supplied phone views | PASS | No visible clipping or page-width break in the three viewport images. The supplied browser report also records no horizontal overflow at 390 px. |
| Required viewport and accessibility evidence | FAIL | Evidence is incomplete. `DESIGN.md` requires rendered evidence at 375, 768 and 1440 px, a keyboard pass and a reduced-motion pass. The supplied images cover 390 px. The supplied focus check covers one Tab transition. This is an evidence limit, not a demonstrated layout defect. |
| Existing visual system | PASS | The pages reuse ResourcesShell, Section, DataTable and KeyFacts. The calculator reuses the card, fields, 6 px controls and existing tokens. |
| Visible text and required controls in supplied images | PASS | Dark text on white or soft grey is readable. Each calculator input has a visible label. The focused input has a visible outline. Source connects labels and inputs and provides a polite status region. This does not establish full WCAG conformance. |
| Invented metrics, testimonials or affiliation | PASS | The changed material makes no outcome, partnership or ranking claim. Calculator examples are identified as examples. |
| Destructive-action confirmation | PASS | Not applicable to these information pages and the local calculator. |

Marketing weights from the rubric:

| Dimension | Score | Weight | Evidence |
|---|---:|---:|---|
| Task fit | 6 | 15 | Price and assessment details support a purchase decision, but S1 gives a non-BC parent an unavailable next step. |
| Content and hierarchy | 7 | 20 | The price and sibling table appear early. The guide separates process, report and next step. S1 and S2 limit accuracy. |
| System coherence | 9 | 10 | The supplied views retain the existing wordmark, Geist type, mono labels, soft grey panels and corner squares. |
| Interaction and states | 6 | 5 | Controls, live output and the no-JavaScript formula are present. S3 leaves one invalid state untreated. |
| Accessibility and responsiveness | 6 | 10 | Labels, status semantics and phone focus are supported. Required viewport, full keyboard, text-scale and reduced-motion evidence is incomplete. |
| Visual expression | 8 | 20 | The pages extend the established Resources appearance with real price and process content. |
| Craft | 8 | 15 | The phone views show aligned fields, clear type and a price table without clipped text. |
| Evidence and fidelity | 6 | 5 | Three useful viewport images and specific local checks exist. Product fidelity and required viewport coverage remain incomplete. |

Weighted score: 72/100.
Weakest limiting dimensions: task fit and product fidelity.
Recommendation: revise.

Spec result: CHANGES for S1-S3.
Standards result: CHANGES for product-fact fidelity and incomplete required design evidence.
No separate style findings.

## Parent correction record

All three findings were accepted and corrected. The original review above remains the result for its original candidate.

| ID | Status | Correction and fresh proof |
|---|---|---|
| S1 | Resolved by parent | Added BC-curriculum eligibility and the other-curriculum waitlist to both new pages. Compared with `OPEN_CURRICULA`, the report next step and terms. Aside rendered the corrected text. |
| S2 | Resolved by parent | Changed the report bullet to accuracy, plus speed from Grade 5. The existing report-view tests verify that condition. |
| S3 | Resolved by parent | Added a failing public-interface regression, then rejected fractional-cent rates and fees. Also matched the quarter-hour input step. The focused check passed 64 tests. Aside showed invalid-input messages and the unchanged valid total. |
| Design evidence | Completed by parent | Captured all three surfaces at 375, 768 and 1440 px. Nine overflow checks passed. Keyboard checks reached all new content links and calculator fields. Reduced-motion emulation was active and the calculator still worked. See `verification.md`. |

Parent disposition: no open finding from this review. The source changes after review are limited to these corrections. The design evidence now covers the required widths, changed-content keyboard paths and reduced motion. The parent performed the correction checks; they are not a second independent review. The governing T3 instruction says to fix small findings without starting another delegate. Review usage was not returned.
