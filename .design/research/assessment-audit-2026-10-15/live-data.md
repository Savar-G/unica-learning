# Live data pull: Unica Learning assessment (read-only, 2026-10-15)
Supabase project cdjobwsyzndtltzfpyqa. SELECT only. No personal data. IDs are 6-char md5 hashes.

## Headline
Real-family data is ZERO. The whole database holds 1 assessment, and it belongs to an admin account (excluded as team).
Data volume is far below 20 finished tests. That is the key finding: no empirical calibration is possible from live data yet.

## Row counts (public schema)
parents 2, children 2, admin_users 2 (1 admin is also a parent), test_accounts 0, assessments 1, answers 36, assessment_facts 1,
fact_answers 45, reports 1, work_reviews 0, card_setups 1, waitlist_joins 0, email_log 0, signups 0 (old reservation flow).

## Exclusion logic
Copied from migration 20261012_add_test_accounts.sql: exclude parent_id in test_accounts UNION admin_users.user_id
(admin_team_ids() itself needs an authed admin, so I read admin_users directly: same set).

## 1. Started / finished / abandoned
| | all | excl. test/team |
|---|---|---|
| started | 1 | 0 |
| completed | 1 | 0 |
| in_progress / expired | 0 | 0 |
By curriculum: BC 1 (excluded). By grade: grade 4 x1 (excluded). By week: week of 2026-10-12 x1 (excluded).

## 2. Duration / time per item (all = the single admin test; excl. = no data)
- Assessment b4e313: started 2026-10-12 18:40:20, last answer 18:48:49, completed 18:50:06. Wall clock about 9.8 min; report.minutes = 6 (stored, probably active time).
- Percentiles by grade band: not computable (n=1, grade 4).
- answers.time_ms exists and is populated on all 36 rows: min 1,567 ms, median 5,345 ms, p90 19,934 ms, max 88,255 ms.
- Share under 3 s: 11 of 36 = 31% (one admin tester, not a child; indicative of the instrument only).
- fact_answers.at_ms (quick facts, 45 rows): max 60,308 ms, 0 under 3 s (at_ms is a cumulative offset in the facts window, not per-item time; do not read it as latency).

## 3. Unfinished tests, stop index
None exist. Histogram empty. Schema support: answers.position, assessments.last_answer_at, status in_progress/completed/expired, resume_until (24 h). PostHog test_stop would be the only other source (not available, see below).

## 4. Outcomes (single admin test, grade 4, BC)
- route = stay. help = no. placement keys: stage1, workingLevel, grade, atCeiling, province, facts, flags, confidence, strands, route, scoredAgainst, levels.
- Distribution below/at/above: 0 / 1 (stay) / 0 in total; excluded from real counts, so real n = 0.
- Strand statuses: stored inside placement.strands (jsonb), not queried further; n=1 is not a distribution.
- Overall correct: 19 of 36 answers (53%); 31 distinct template_ids across 36 items.

## 5. Reports / reviews / whiteboard
- reports: 1 (admin test); questions=36, minutes=6. Report model keys: helpWarning, work, facts, callToAction, comparison, fsa, strands, howWeHelp, level.
- work_reviews: 0 (AI review off or nothing reviewable).
- Answers with whiteboard work: work_path populated on 8 of 36; work_text on 0 of 36; work_required true on 7 of 36. So 8 stored drawings, 1 of them on an optional question; no typed work.

## 6. answers null / population rates (n=36)
| column | populated |
|---|---|
| id, created_at, assessment_id, position, question_id, template_id, values, response, correct, time_ms, work_required | 36/36 (NOT NULL) |
| misconception | 7/36 (19%) |
| work_path | 8/36 (22%) |
| work_text | 0/36 (0%) |
Other: no empty values{} and no empty response. 19 correct.
assessments: help set; route set; placement set; test jsonb keys stage1, profile, seed, stage2 (stage2 is stored per test).
Note: the schema holds no item difficulty, item time limit or per-item response-change data beyond the above.

## PostHog
PostHog MCP is available but its only project (id 250953, "Default project") is Unify Social (app_urls unifysocial.ca), not Unica Learning.
60-day query for test_start, test_finish, test_stop, test_resume, test_start_click, account_created, account_form_start, cta_click, report_open, page_zoom, card_start, card_saved, test_work, test_help, test_error returned 0 rows; none of these event names exist in the taxonomy.
So no funnel (signup -> start -> finish) could be pulled. Either Unica analytics goes to a different PostHog org/project that this MCP login cannot see, or consent gating means nothing was captured. Not resolved.
Event names that exist in code (src/lib/track.ts): cta_click, account_form_start, account_created, test_start_click, test_start, test_finish, test_stop, test_resume, test_error, test_facts_done, test_break, test_work, test_work_nudge, test_help, report_open, card_start, card_saved, waitlist_join.
