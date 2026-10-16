# Unica Learning online math assessment: code audit

Repo: this repo, branch `main` at e0b25ef (read-only audit, 2026-10-15). Paths are relative to the repo. Live DB column list and row counts came from a read-only Supabase query on project cdjobwsyzndtltzfpyqa. Item CSV: /tmp/unica-assessment-audit/bank.csv (527 rows). Scripts: /tmp/unica-assessment-audit/build/.

## 1. Flow

- Entry: every CTA links to `/start` (D-093). `/start` collects parent name, email, postal code (Canadian format check, src/components/account.tsx:359), password or Google, child first name, grade 1-7 and province. Email-code proof before any account data is written (D-093, docs/assessment-signup.md).
- Curriculum: NOT BC-only. Province picker offers BC, AB, SK, MB, ON, "Another province, or not sure" (src/lib/signup.ts:16-23, account.tsx:88-98). The postal code pre-selects a province (account.tsx:362-363). Each template carries a grade tag for BC, AB, SK, MB, ON (src/lib/assessment/types.ts:39 ProvinceGrades; bank/kit.ts:6). A child in AB/SK/MB/ON is scored against that province's tags (session.ts:42-43 `levelFor`). "other" is scored against BC with no note (session.ts:39, D-083).
- Non-BC consequence: the child takes the same-length test. Only the report call to action differs: BC = add card (Stripe setup mode, no charge), every other province = waitlist (signup.ts:28-29 `OPEN_CURRICULA=["BC"]`, report.ts:131 `callToAction`). FSA line is BC-only, grades 4 and 7 (report.ts:96-100).
- Subjects: math only (D-081, D-092). Reading is out of scope in spec #54.
- Device: phones are redirected to /account with a sign-in-link email (src/app/account/test/[childId]/page.tsx:27). Test is for laptop or tablet.
- Start state (src/lib/assessment/attempt.ts): resume within 24 h of last answer (RESUME_HOURS=24, :5); retake 30 days after a completed test (RETAKE_DAYS=30, :7); expired test restarts with a new seed and new questions.
- Test screen (src/components/test.tsx): one question per screen, "split desk" (D-088): question and choices or number pad left, whiteboard right. Number pad has digits and "." only (no minus, no fraction keys; test.tsx:280). Choice questions are shuffled rows.
- Read-aloud: browser `speechSynthesis`, button hidden if no voice (components/test-read-aloud.tsx:36-50). Text built by `readAloudText` (assessment/read-aloud.ts:94-99); choices read after the question in on-screen order.
- Whiteboard (src/components/whiteboard.tsx, assessment/work.ts): required on 5 / 7 / 10 questions for bands 1-2 / 3-5 / 6-7 (constants.ts:23-25); optional elsewhere. Grades 1-2 draw only; grades 3-7 draw plus type (`whiteboardTyping`). Next is disabled until an answer exists and, on required questions, the board has work (test.tsx:303-309).
- Break: skippable screen once, before first question of stage 2 (`breakDue`, session.ts:270). Shown flag is stored in browser localStorage only (components/test-break.tsx:12-29).
- Facts section: 60 s timed number-fact drill after the break, before stage 2 (test.tsx:118-132; facts.ts:65 FACTS_SECONDS=60).
- End: "Did anyone help?" (yes / a-little / no; flags.ts:25) then end screen; report job runs after finish (lib/report-job.ts).
- No calculator, no scrap paper (D-083). Not enforced technically.

## 2. Item bank

Structure: the bank is TEMPLATES, not fixed items. A template (assessment/types.ts:61-77) is filled with a seeded RNG (rng.ts) giving numbers, prompt, choices, correct answer and coded wrong answers. 527 distinct templates. Bands overlap: 3-5 reuses the 64 grade 1-2 templates at BC levels 2-3 (bank/grades-3-5/index.ts:37-46).

Per band (BC level tags; full CSV has AB/SK/MB/ON levels):

| Band | Templates | By BC level | By reported strand | By internal strand |
|---|---|---|---|---|
| 1-2 | 125 | K:25, 1:36, 2:37, 3:27 | number 44, algebra 39, shapes 42 | N26 O18 A39 MG28 DP14 |
| 3-5 | 279 | 2:37, 3:60, 4:57, 5:68, 6:57 | number 75, fractions 56, algebra 77, shapes 71 | N29 O46 F56 A77 MG51 DP20 |
| 6-7 | 187 | 5:39, 6:60, 7:56, 8:32 | number 46, fractions 45, algebra 46, shapes 50 | N18 O28 F45 A46 MG34 DP16 |

Level x reported strand ranges from 6 (6-7, L8 number) to 21 (3-5, L5 algebra) templates; most cells hold 9-17. Answer format: 1-2: 75 number / 50 choice; 3-5: 176 / 103; 6-7: 107 / 80. Whiteboard-suited flag: 70 / 213 / 137 templates.

Metadata carried by each template (types.ts:61-77): `id`, `strand` (N,O,F,A,MG,DP), `grades` {BC,AB,SK,MB,ON}, `format` (choice|number), `whiteboard` (bool), `standard` (BC learning standard string, e.g. "4.5"; 122 distinct values, none empty), `fill()`. Each fill returns `values` (numbers drawn), `prompt`, `readAloud`, `answer`, `wrong[]` ({value, misconception}), optional `say` and `figure` (bar graph only).
- Curriculum reference: only the `standard` string (BC). AB/SK/MB/ON carry a grade number only, no outcome code. Outcome sources sit in comments and scripts/template-check/curriculum-notes.md, not in data.
- Misconceptions: coded per wrong choice, via 243 distinct IDs used (misconceptions.ts holds descriptions and evidence V/R/none). Every template yields at least one coded wrong answer in 50 sampled seeds.
- NOT present: skill id separate from template id, difficulty/IRT parameter, cognitive level, content-standard text (only the code), item version number, calibration data, response-time norms.
- Variety: 5 / 15 / 12 templates (1-2 / 3-5 / 6-7) produced exactly 1 distinct prompt over 50 seeds (effectively fixed items); 9 / 20 / 13 produced 3 or fewer.
- Province divergence: templates whose tag differs from BC: AB 33/101/97, SK 33/71/46, MB 33/72/51, ON 20/117/108 (bands 1-2 / 3-5 / 6-7). Shortfalls found by simulation over province x grade x route (script an2.cjs): grade 3 down form has no fractions in all 5 provinces (level 2 has none); ON grade 6 up / grade 7 stay / grade 7 stage 1: level-7 algebra pool of 3 (needs 5 slots); ON grade 7 up: level-8 fractions 4, shapes 2 (need 5); AB grade 6 down: shapes 4 (need 5). A short pool repeats a template with new numbers.
- CSV columns (bank.csv): id, bands, strand, reported_strand, level_BC/AB/SK/MB/ON, answer_type, whiteboard_suited, bc_standard, skill_id (= template id, no separate field), difficulty (always blank: no such field), sample_prompt_120 (seed-filled example, BC), sample_correct_answer, n_coded_wrong_sample, misconception_tags_over_50_seeds, has_figure, has_say, template_uses_randomization.

## 3. Selection and scoring

- Form: two-stage, semi-adaptive, seeded. No per-item adaptivity. `createSession` (session.ts:160-185) draws stage 1 and ALL THREE stage 2 forms (up / stay / down) at start and stores them (`assessments.test` jsonb). Deterministic from `seed`; fresh seed per attempt.
- Lengths (constants.ts:23-25): 1-2: 24 (12 stage 1); 3-5: 36 (18); 6-7: 42 (21). Spec times 20-25 / 30-36 / 40-45 min (D-083); no real timing collected (#122).
- Stage 1 = all questions at the school grade level. Stage 2 level = grade+1 (score >=80%), grade (40-79%), grade-1 (<40%) (constants.ts:42-45, session.ts:210-214). With 12/18/21 questions, 80% is first reached at 10/15/17 right and exactly 40% cannot occur (noted in #122).
- Strand rotation: `buildStage` (session.ts:90-130) walks the band's reported strands round-robin, taking the next shuffled template for that strand and level. A strand with no templates at that level yields its turns to others. A repeated template gets new numbers; dedupe on prompt+choices+figure.
- Working level (session.ts:293-297): per level, correct/total; the highest level with >=70% (WORKING_LEVEL_PERCENT). If none, level = lowest level seen minus 1 and `confidence="low"`. `atCeiling` is true only when routed up and cleared grade+1. Result is bounded to grade-2 .. grade+1.
- Strand status (session.ts:299-309): counts only questions at or below school grade (D-084, #65 decision). Secure >=80%, Developing >=50%, else Needs attention (constants.ts:49-50). Strands with zero such questions are omitted.
- Items per strand a child actually sees (simulation, 200 seeds per cell, script sim.cjs, BC): at or below grade, stage 1 only on an "up" route: grades 1-2: 4 per strand; grade 3-5: 5,5,4,4; grade 6-7: 6,5,5,5. "Stay": 8 per strand (1-2), 10/10/8/8 (3-5), 12/10/10/10 (6-7). "Down": 8 (1-2); 3-5: 10 (but grade 3 down: fractions only 5); 6-7: 12/10/10/10. D-084 itself cites research that 8-11 per strand is only "an early signal".
- Distinct templates per test: up and down routes use all-distinct templates (24/36/42). Stay route repeats templates: min 16 of 24 (g1), 25 of 36 (g3), 30 of 42 (g7); distinct BC standards per test as low as 7 (g1/g2 stay), 9 (g3, g7 stay), up to 23.
- Confidence/uncertainty: only a binary `confidence: "normal"|"low"` (low = no level cleared) and `atCeiling`. No standard error, no interval, no item calibration. Report prints the per-strand "x of y".
- Marking (session.ts:224-250): number answers parse numerically (commas as thousands, unicode minus); choices exact string. Server marks; browser never gets answers (`toPublicQuestion`, session.ts:70). No partial credit. Misconception recorded only when the response matches a coded wrong value.
- Misconception detection: exact-match of the response to `wrong[].value`; stored in `answers.misconception` (max 20 chars; one ID is aliased `compensation-dir`). Not aggregated into the report or placement (placement holds levels, strands, facts, flags only). Visible in admin per answer.
- Facts (facts.ts): families per grade (FACTS_BY_GRADE :54-62): g1 add/sub to 10; g2-3 to 20; g4 +mult 2,5,10; g5 mult 2,3,4,5,10; g6-7 mult/div to 100. 90 facts drawn, 60 s, server clock times each answer (`at_ms`). Reported: answered, correct, skipped, median ms per fact, accuracy secure if >=90% (FACTS_SECURE_PERCENT), speed "quick" if median <=3000 ms. Never changes working level (finish(), session.ts:282-320). #122 notes saves take ~0.6 s each, so speed partly reflects network.
- Help flags (flags.ts): too-fast (<3 s per answer, listed), pause-then-perfect (one answer >=3 min, then 4 right, after <70% right in prior 4), self-report "yes/a-little". `helpLikely` (flags.ts:61) = self-report, or pause pattern, or >=3 fast-and-right. Sends parent a warning; excludes the test from comparison cohort.
- Comparison (comparison.ts): latest completed test per child, same grade, excluding helpLikely, example.com/resend.dev, named test emails. Sort by working level then share correct at that level; midrank percentile. <100 takers: scale only; 100-399: lower quarter / middle half / upper quarter; >=400: numeric percentile with n (constants.ts:57-60).
- ai-checks.ts: validates AI text (length <=600, no markup/links, no first person/AI names, no he/she, every number must come from the report facts). work.ts: shown-work rules (required-work must have drawing or text; no typing in grades 1-2). read-aloud.ts: spoken text only.
- Time on item (`timeMs`) is measured in the BROWSER (`performance.now()` from mount to Next press, components/test.tsx:300,346), sent in the body, capped at 60 min (lib/test-api.ts:37). Spec #54 said "The server records times"; for main questions it does not. Facts times are server-measured.

## 4. Data captured (live DB columns, confirmed by information_schema query)

- public.assessments: id, created_at, parent_id, child_id, seed, status, started_at, completed_at, grade, province, test (jsonb: profile, seed, stage1 + stage2 up/stay/down with full question objects incl. prompt, choices, values, answer, wrong coded), route, placement (jsonb), last_answer_at, resume_until, help.
- public.answers: id, created_at, assessment_id, position, question_id, template_id, values, response, correct, misconception, time_ms, work_required, work_path (PNG in private bucket `shown-work`), work_text.
- public.assessment_facts: assessment_id, created_at, started_at, test (jsonb facts).
- public.fact_answers: id, created_at, assessment_id, position, fact_id, response, correct, at_ms.
- public.reports: id, created_at, assessment_id, parent_id, child_id, model (jsonb), questions, minutes, emailed_at, email_id, email_error, alerted_at, alert_error, unsubscribe_hash, email_first_clicked_at, email_last_clicked_at, email_clicks.
- public.work_reviews: id, created_at, assessment_id, parent_id, question_id, error_type, kind, comment, score, confidence, model.
- public.children: id, created_at, parent_id, first_name, grade, province, learning_styles, interests, learning_note, learning_updated_at.
- public.parents: id, created_at, name, email, postal, source (jsonb UTM/referrer), deletion_requested_at.
- Also: email_log, card_setups, waitlist_joins, test_accounts, admin_users, family_deletions (+ operation tables), sign_in_links, signups, signup_heard.

Captured vs not:
| Item | Status |
|---|---|
| Item shown-at time | NOT captured. Only `answers.created_at` (server insert time = effectively answered-at) |
| Answered-at | Yes, `answers.created_at`; `assessments.last_answer_at` |
| Time on item | Yes `time_ms`, client-measured, capped 1 h, not server-verified |
| Answer changes / hesitation | NOT captured. Only the final response is sent |
| Skips | Not possible on main test (Next disabled until answer). Facts: empty response = skip |
| Read-aloud uses | NOT in DB. PostHog event `read_aloud` with no question id or count (track.ts) |
| Whiteboard image | Yes: final PNG per answered question where drawn (`work_path`); 8 of 36 answers in prod |
| Whiteboard strokes / erase / timing | NOT captured (strokes rasterised client-side; `boardImage`) |
| Typed working | Yes `work_text` (<=1000 chars), grades 3-7 |
| Breaks / pauses | NOT in DB. PostHog `test_break` (shown/rested/skipped), no duration. Break "seen" flag in localStorage. A long gap shows only as a large `time_ms` or gap in `created_at` |
| Device / browser | NOT stored. Phone/desktop decided at request time via User-Agent; not persisted. `parents.source` holds marketing source only |
| Stage / route | Yes: `assessments.route`; stage derivable from position vs stage1 length; admin derives stage |
| Exact item version shown | Yes: full question objects incl. numbers and choice order are in `assessments.test`; seed too. Template code version is NOT recorded (templates can change and old tests still restore from stored jsonb) |
| Distractor chosen | Yes: `response` text; `misconception` populated only if it matches a coded wrong answer |
| Choice order shown | In `test.choices` (stored) |
| Tab blur / visibility / focus | NOT captured |
| Hint / help use mid-test | None exists. Only final "Did anyone help?" |
| Per-attempt environment (screen size, input type touch vs mouse) | NOT captured |
| Fact-level timing | Yes (`at_ms`, server clock) |
| AI review per work | `work_reviews`; prod has 0 rows (AI off; #58 open, on hold) |
| Retake linkage | Via child_id and created_at; no explicit attempt number |

## 5. Parent report

Model: src/lib/assessment/report.ts:56-140 (`reportModel`), shared by account page, email, admin read-only view, sample page.
Shows: header (child, school grade, date, curriculum); working level on K-8 ruler with verdict (behind / on-grade / ahead, `atCeiling`, low-confidence note); 4 strands (grades 1-2: 3) each Secure / Developing / Needs attention with "x of y" and meter; number facts (accuracy beside speed, seconds/fact); up to 3 pieces of child's work (REPORT_WORK_MAX, constants.ts:72; drawing, typed text, right/wrong, AI comment only if high confidence); comparison (scale / band / percentile with n); BC-only FSA line for grades 4 and 7 (figures 66.5% and 59.2%, hard-coded report.ts:96; "re-check" open in #122); "how we help" variant; help warning if `helpLikely`; call to action (card for BC, waitlist otherwise); learning-style intake (#126). Public example: /sample-report (src/app/sample-report/page.tsx), a Grade 3 child at Grade 2 level using the real model.
AI parts (#68): (1) per-work review (src/lib/work-review-claude.ts, Anthropic SDK, image + facts, JSON out): error type, slip / misunderstanding / none, comment, score; confidence "high" only if score >=0.8, text rules pass and agrees with the mark; never changes the mark. (2) AI report summary paragraph (<=600 chars) kept only if `checkReportText` passes (every number must come from the report facts; no first person; no gendered pronouns). Both off unless `ANTHROPIC_API_KEY` is set; #58 (key) is open and "on hold"; prod DB has 0 `work_reviews` rows and 1 report. So the live report currently has no AI comments and no AI summary. Default model `claude-sonnet-5-5` (AGENTS.md). Report email: src/lib/report-email.ts, same model; alert to Savar includes AI outcome and parent-email status.
Not in the report: per-misconception findings, per-skill/standard breakdown, per-item review, time per question, confidence interval.

## 6. Admin (src/app/admin/**)

Pages: `/admin` dashboard (KPIs, funnel, family list with stage; D-099), `/admin/activity` (event log, emails), `/admin/tests` (every test; filters status, grade, province, help, low-AI), `/admin/assessments/[id]` (one test), `/admin/reports/[id]`, `/admin/reviews` (AI reviews, low-confidence filter), `/admin/parents` and `[id]`, `/admin/children` and `[id]` (learning answers and book mix), `/admin/next-steps` (cards, waitlist), `/admin/emails`. Actions: mark family as test (api/admin/parents/[id]/test), delete family.
Per-child test detail (admin/assessments/[id]/page.tsx): for each answer: number, stage (1/2), level / strand, question prompt, right answer, child answer, right/wrong, time (flag under 3 s), misconception; flags text; help answer; seed, route, working level, timestamps (started, last answer, completed, resume-until); shown-work drawing (signed URL), typed text, AI review (confidence, score, kind, comment); quick facts table (fact, answer, result, time since start and since last answer); report delivery; emails.
Answer to "can an admin see each question shown, child answer, correct, time, drawing": yes for each, one test at a time. Not shown: choices offered and their order, the figure (bar graph), template id and BC standard, read-aloud use, per-question wall-clock timestamps, device. 
Export: none. grep for csv/export/download in src/app/admin, components/admin*, lib/admin-* found nothing. Lists page with LIST_MAX paging only.
Missing for a complete raw-data view: CSV/JSON export of answers; cross-test query by template or standard (item analysis: % correct, median time per template); distractor frequency per item; choices displayed; template version; per-strand/skill rollups; strand n; cohort dashboards by grade/route; the stored `test` jsonb itself; PostHog-only signals (read-aloud, breaks, stops) joined to the test.

## 7. Retention and deletion

- Policy (privacy page src/app/privacy/page.tsx:49-52; docs/assessment-deletion.md; D-085): families with no saved card are deleted 12 calendar months after the latest test activity (start, answer or finish, across all children). Families with a saved card are kept while the account is active. An account with no test has no deadline. Parent can request deletion; admin runs verified delete (api/admin/parents/[id]/delete).
- Mechanism: GitHub Action `Family retention` (.github/workflows/retention.yml), daily 15:17 UTC; `retentionDue` (assessment/deletion.ts:46-58) UTC calendar months, skips families with card state not "clear"; `runRetentionBatch` (deletion.ts:21-44); `deleteFamily` (deletion.ts:100-107) removes Storage images first, then Auth user, which cascades to parents, children, assessments, answers, facts, reports, work_reviews, email_log, sign_in_links, card_setups, waitlist_joins (migration 20261011_add_family_deletion.sql). Hosted-verified 13 Oct 2026 (#117); open defect #138 is closed.
- What survives: Stripe customers, subscriptions and payment history (explicitly not deleted; privacy page), PostHog events (no email, name, grade or score by design, track.ts), and the legacy `signups`/`signup_heard` tables (not in the family cascade). No de-identified or aggregate copy of answers, item statistics or placements is kept anywhere. Deleting a family also removes its row from the comparison cohort, so cohort n can fall.
- Consequence: item-level response data used to calibrate difficulty vanishes at 12 months for non-buyers, and there is no consent or archive path for research use.

## 8. Docs and decisions

- docs/assessment-comparison.md (#101, decision #94 option A): comparison among Unica children, same grade, latest completed test per child, excludes help-likely and test emails (`ASSESSMENT_COMPARISON_EXCLUDED_EMAILS`, default empty; no named test list supplied). Sort by level then exact share correct; midrank. <100: scale only; 100-399: lower quarter / middle half / upper quarter; >=400: percentile with n. Stored report keeps its snapshot. Production cohort behaviour "unverified".
- docs/assessment-signup.md (#82): Supabase Auth settings, email-code templates, create_family guarantees, residual risk that an earlier password can open an empty account and a 1-hour token window.
- docs/assessment-deletion.md (#78, #117): see section 7.
- Decisions (.design/decisions.md): D-042 (paper assessment, superseded by D-081); D-053 (curriculum decides signup path: BC card, others waitlist; superseded in part by D-082); D-081 (online, math first, free, before card, alone in one sitting on laptop/tablet, open to all Canada, main job accurate placement); D-082 (signup path, phone gets laptop link, report by email within minutes); D-083 (test design: template bank, K-8 level, 6 strands, 5 provinces tagged, "other" scored vs BC; lengths 24/36/42 and 20-25/30-36/40-45 min; break; 80/40 routing; working level 70%; 60-90 s facts; whiteboard 5/7/10; read-aloud on every question; resume 24 h; retake 1 month; help flags); D-084 (code marks; AI reads whiteboard and writes report only when sure; 4 reported strands Secure/Developing/Needs attention with counts; speed beside accuracy; never invent a weakness; comparison scale, FSA line grades 4 and 7, bands ~100, percentile ~400-500; "8-11 questions per strand is an early signal, not a verdict"); D-085 (admin with everything, Savar and Cedric logins, email per finished test, reminders 1 h and 24 h max 2, AI named only in privacy and terms, 12-month deletion, pilot before launch); D-086 (prototype rounds); D-087 (report design A3 "Report card + ruler"); D-088 (test design B "Split desk"); D-090 (one math plan CAD 99); D-091 (first month CAD 69.30); D-092 (copy says math only); D-093 (public launch without pilot, email code, create_family cap 20 families per 10 min); D-099 (admin dashboard, test families excluded); D-100 (learning-style intake). Decision text mismatch to note: D-083 says "all five tags done before launch"; README of grades 6-7 admits several tags are "unresolved" and use later grades.

## 9. GitHub

`gh issue list --search "assessment" | "admin" | "curriculum"` returned zero results for all three (the search index returned nothing; likely a search-API quirk). I listed all issues instead (`gh issue list --state all --limit 300`): 52 issues. Relevant:
- #54 CLOSED Spec: Online math placement assessment and parent report (the design spec)
- #55-#57 CLOSED owner setup (Supabase secret key, Resend domain, Google OAuth); #58 OPEN Anthropic API key (on hold)
- #59 core engine; #60 and #61 prototype rounds; #62 accounts and signup; #63 Google sign-in + phone link; #64 test end to end; #65 report v1; #66 card or waitlist; #67 whiteboard; #68 AI work review and report text; #69 read-aloud, break, progress; #70 timed facts; #71 help flags; #72 stop/resume/retake; #73 reminders; #74 bank grades 1-2 + AI template checker; #75 bank 3-5; #76 bank 6-7; #77 admin area; #78 deletion/privacy/terms; #79 test design; #80 report design; #81 pilot (superseded by #82); #82 public launch; #94 ranking decision; #101 bands/percentile; #117 deletion QA; #122 post-launch follow-ups; #126 learning style; #138 retention defect; #143-#152, #158, #161-#163, #165, #168 refactors (delivery module, attempt module, report loading, answer 40-char limit). All CLOSED except #58.
- #122 CLOSED (but lists unchecked items): hosted phone-link check, non-BC waitlist check, iPad pen check, Cedric admin login, FSA figure re-check, exact 80%/40% scenarios, collect real durations by band, returning parent cannot get a code from /sign-in, facts speed reflects network pace.
Spec #54 promised: fixed length 24/36/42 and 20-25/30-36/40-45 minutes (US23); 6 internal strands (number sense/place value; operations/fluency; fractions/decimals/ratio/percent; patterns/algebra; measurement/geometry; data/probability) mapped to 4 reported; BC, AB, SK, MB, ON tags with "other" vs BC; "the server records times"; admin lists "every parent, child, assessment, answer, work image, AI comment with confidence, flag and report"; AI template checker before go-live; Rasch calibration explicitly out of scope; pilot of 5-10 children (then cancelled). Data tables promised: parents, children, assessments, answers (template id, filled values, response, correct, time, whiteboard ref), work_reviews, reports, admin_users, email_log; all exist.

## Gaps and risks

1. Strand reliability: after an "up" route a strand status rests on 4 (grades 1-2), 4-5 (3-5) or 5-6 (6-7) questions; D-084's own research says 8-11 per strand is only an early signal. One wrong answer flips Secure (80%) to Developing at n=4-5. Grade 3 down route has only 5 fraction items.
2. No uncertainty measure: working level is a binary 70% threshold per level with 12-24 items; 12 items per level on up and down routes; no interval, no SE. "confidence" is 2-valued. Level range is clipped to grade-2..grade+1, so a child far from grade is floored or capped.
3. Item bank not calibrated: no difficulty parameter, no item statistics; levels are the BC grade where the standard is taught, not empirical difficulty. Rasch calibration was out of scope; and the 12-month deletion removes the data needed to do it later.
4. Curriculum references are thin: only a BC `standard` string (no standard text); AB/SK/MB/ON are bare grade numbers with no outcome id in data. Several tags are "unverified/unresolved" in comments (bank/grades-3-5/index.ts:20-31; grades-6-7/README.md). Fallback rule "later grade wins" can inflate a child's placement for non-BC provinces. Ontario grade 7 has pools of 2-4 templates for some level-8 strands.
5. Time data is weak: `time_ms` is client-reported, capped 1 h, with no shown-at timestamp; read-aloud time, tab blur and pauses are not separable from thinking time. Spec promised server-recorded times. Help flags (too-fast <3 s, pause >=3 min) rely on this client time. Speed on facts includes ~0.6 s network save per answer (#122).
6. Not captured: answer changes, whiteboard strokes (only final PNG, and only 8 of 36 answers in prod had drawings), read-aloud per item, break duration, device/browser/input type, tab visibility. Read-aloud and break exist only as PostHog events without question ids.
7. Stay route repeats templates: min 16 of 24 distinct templates (grade 1) and as few as 7 distinct standards in a test, so coverage is narrower on the most common route. Five / fifteen / twelve templates (bands 1-2 / 3-5 / 6-7) produce effectively one fixed prompt.
8. Placement exactness: 80% and 40% routing boundaries cannot occur at 12/18/21 questions (noted in #122, unanswered). All three stage 2 forms are drawn at start, so seeds can be replayed; the stored `test` holds answers (parents cannot read; RLS grant list excludes `test` and `seed`).
9. Misconceptions are detected only by exact match to a coded distractor; typed-number questions rely on guessed wrong values; no aggregation of misconceptions into the report or into book planning.
10. AI is off in production (0 work_reviews, #58 open), so the "AI reads the whiteboard" story in D-084 is not live. Handwriting accuracy is unmeasured (D-084 notes no published data).
11. Admin has no export and no item-level analytics; cannot answer "which templates mis-perform" or compare across children; choices shown and figure are not rendered.
12. Comparison cohort: prod has 1 completed test; scale-only until 100 per grade. Cohort exclusion list of test emails is empty by default. FSA percentages are hard-coded and their re-check is an open owner item.
13. Retention: no de-identified or aggregate store survives; all response-level data for non-buyers is deleted at 12 months.
14. Non-BC families get a full test but a waitlist; OPEN_CURRICULA is BC only, so effort tagging four provinces serves no product today.
15. Tests: Vitest does not typecheck the bank; "A green structural test does not establish curriculum validity" (grades-6-7/README.md). Offline AI template checker (`npm run check:templates`) results are flags kept apart from tests; scripts/template-check/triage.md lists them.
