# S4 marking contract

Source: issue #457 and the integration checklist supplied on 5 November 2026.
Base: 89ecf73965eccbf0f59e49401b69cf09a4e12579. PR #640 and PR #657 are included.

D-235 permits implementation. Family release stays off. This change does not set SCAN_PAGES_ENABLED.
Do not release before sample approval, S3a #637, provider privacy verification, the fixed whole-page model comparison, hosted probes, visual approval and independent review.

## Ownership and states

| Record | Owner | State rule |
| --- | --- | --- |
| Photo and crops | Existing scan lifecycle | Terminal deletion or expiry prevents dispatch and application. Physical cleanup follows the terminal record. |
| Job | Family, child, evidence photo | Queued, running, extracted or finished. The photo/family lifecycle supplies terminal refusal. One active worker per family and printed page. A lease takeover invalidates the previous token. |
| Item | Workbook, immutable revision, page, item | One original. Pending items can move to a later job. Finalized items and parent versions cannot be replaced by recognition. |
| Reading | Canonical item and evidence | Bounded text, typed value, model and prompt version. Image expiry preserves it. Child or family deletion removes it. |
| Publication | Canonical item | Durable original event intent. Append-only SHA-256 event key never changes across photos and remains 72 characters for every permitted item ID. Recovery publishes an intent once. |
| Budget | Whole service, UTC month | USD 50. Reported charge or outstanding maximum, including unknown cost. Dispatch admission is atomic. The reservation survives deletion without family or image references. |

Upload processing, calibration and marking share the configured family active-job count under the same family lock. Accepted unsent photos and reservations also count toward the bounded future queue. A worker stores dispatch intent before each transport attempt. It stores validated extraction before applying observations. It resumes stored extraction without another request. Two transport attempts and two job dispatches are the same shared limit, not multiplied limits. A cost with no verified maximum stops dispatch. No enabled production price bound ships in this change.

The request contains one metadata-free whole normalized page and local item/region aliases with measured boxes. It contains no separate account, workbook, child or family identifiers, answer keys, printed examples, stored question text, or model authority to score. Code checks the one-box whole-number format against trusted packages. Other formats keep explicit pending, parent-check or unscored observations.

## Effective results and follow-on slices

All page and profile readers use the canonical effective observation. `markingEvent` owns eligibility. Raw original events stay append-only. The effective projection replaces marking events by canonical key for profile facts and AI inputs. Skill states receive the same eligible set. Future #458 must use an expected result version, append a correction link and preserve the original reading. It must not append another original event. Future #470 can page canonical results by stable keys; photo expiry is not a history filter. Second tries need separate evidence and never enter this original projection.

Parent solutions are withheld while any item is pending or needs a parent check. This slice exposes no solution content. Parent views show Right, Wrong, Blank, Not scored, Not marked yet, or "Our team is checking this answer." (#715, D-303). Admin detail includes the authenticated photo/crop routes, reading, eligibility, original event link, job state and dispatch cost. No signed image URL is created.

## Falsifiers and proof limits

- Concurrent scans fail the contract if both replace a finalized item or publish two original events.
- A version change fails the contract if an old job overwrites it.
- Deletion or expiry fails the contract if a released response creates a mark, event, derivative or later dispatch.
- Budget tests fail if charges plus outstanding reservations exceed USD 50, including at rollover and after deletion.
- Completion fails if an all-unscored page needs a score, or a parent check counts as complete.
- Privacy fails if a captured request has separate identity, keys, examples, free page text or crop-only input.
- Authorization fails if another family or anonymous caller can read images or results.
- Local tests prove only synthetic workflow and local SQL behavior. They do not prove recognition accuracy, hosted permissions, camera readiness, browser layout, provider retention or release acceptance.

## Parent integration

Apply `supabase/migrations/20261105_scan_marking.sql` after the merged scan stack, scan crops, child deletion and profile-history migrations. It creates no enabled price row. Generate `src/lib/database.types.ts` with the normal generator. The three new RPC names and their nullable arguments are intentionally checked against generated types; compilation must fail until those types exist.

`SCAN_MARKING_ENABLED=test-only` permits only server-verified test families and admins. `families` also admits a real family while its child's plan is running ([scan pages](scan-pages.md#families-mode)). Its default is off. The new cron and the parent retry route use the same worker. Existing `sent_at` photos enter the persisted recovery cursor. Neither the parent result GET nor an image GET starts model work. Keep both scanning and marking closed to ordinary families.

A price row needs a verified worst-case charge for one whole image up to its pixel limit, the bounded alias/instruction input, 4096 total output tokens and the configured model. Reserve that maximum separately for each of the two allowed transport attempts. Record the pricing source, date, calculation and provider settings in its evidence. Do not enter the USD 0.02 target as the maximum. No verified bound was supplied or invented here. The Haiku comparison still needs the same fixed synthetic whole-page set, thresholds and global ledger admission. No paid comparison ran in this task.

The job's `blocked_reason` records budget, off, unverified-price or exhausted-attempt states. A hold releases the worker lease without resetting its dispatch count. A budget hold preserves the photo and every pending answer. Reconciliation never shifts a charge to another month. The UTC month is read after the budget lock.

S5 (#458) adds `PATCH /api/account/scans/<id>/marking`. The body is `{ itemId, version, result }`, where `result` is `right`, `wrong` or `blank`. The parent session and photo bind the family, child, workbook, page and immutable print revision. The crop uses the canonical observation's evidence photo. A retake does not substitute its new writing for the original crop. The server checks that evidence photo's current expiry before it offers the crop. The service-only command locks the canonical item and checks its current version. A conflict returns HTTP 409 with the current page. A successful change increments the item and child marking revisions. It preserves the original event, reading, typed values, model and prompt. It appends `scan_mark_changes` in the same transaction. The history has both version links, the previous record, the new observation, the parent and the server time. Only family or child deletion removes these records through the existing cascades.

For #470, `MarkingStore.effective(parent, child)` reads canonical rows with keyset pagination, through the service-only RPC and current family/child checks. `effectiveMarkingEvents` projects the current result over the append-only original event. `effectiveSkillMarks` uses the same published eligible set. Read prior photo extractions as evidence, not extra originals. S5 implements the parent correction action. Second-try collection, the final marks dashboard, reminder episodes and new workbook snapshots remain outside this slice.

The new family-owned tables are `scan_marking_jobs`, `scan_marking_items`, `scan_marking_revisions` and `scan_marking_dispatches`. Each has direct child/family cascades and both write fences. No bucket or file path was added. Existing photo/crop cleanup and deleted-folder guards remain in use. The global `scan_marking_spend` table keeps only a random dispatch id, UTC period, model, amounts and times after a family is deleted. Its family-owned link is removed. It holds no child, family, workbook, photo, text or file reference. This prevents deletion from releasing an unknown provider charge. Retention clocks and anonymous test-copy serializers are unchanged.

Local reproduction uses a fresh disposable database per run. The runner refuses network addresses and non-disposable database names. Start a local PostgreSQL cluster with only a Unix socket under `/tmp/pd457-pg-*`. Create a fresh database whose name starts with `pd457_`. Run `SCAN_MARKING_SOCKET=<socket directory> SCAN_MARKING_DATABASE=<fresh database> node supabase/tests/scan_marking.cjs --bootstrap`. The runner loads actual production functions and triggers with reduced dependency tables. It also runs `supabase/tests/scan_marking.sql` and confirms rollback. This proves no hosted permission, signed-URL API, real worker credential or physical camera behavior.

## Hosted schema verification after review fixes

The private schema was applied as `20261106001050` (`scan_marking`). The calibration cleanup compatibility correction was applied as `20261106001331` (`scan_calibration_previous`). The normal type generator refreshed `database.types.ts` after both applications. No marking price is enabled.

The hosted catalog confirms RLS on all seven new tables, no browser or direct service-role writes, service-only write RPCs, empty function search paths, and both family/child fences and cascades on all four family-owned tables. The hosted rollback probe `supabase/tests/scan_marking_hosted.sql` reached `SCAN_MARKING_HOSTED_PROBE_OK`, left zero probe families, and verified the real role boundary, bounded UTF-8 item key, expired outbox recovery, prior calibration lease, child cascade and sibling preservation. Synthetic geometry in that probe is not camera or calibration acceptance.

Local SQL now has 38 passing cases, including concurrent profile-save recovery after image expiry/deletion, no dispatch/reservation after a budget-lock wait crosses a deadline, and calibration/normalization/marking sharing the active count in both orders and concurrent calls. Review-page mastery uses the frozen Friday 5, Mixed and Show what you know parts.

S4 does not replace `send_scan_photos`. The other controller's `scan_sent_check` migration (`20261106001155`) stays installed. The post-change Send definition hash is `ed3be6821e4bec1d105dd5b68da78321`.

Browser evidence uses synthetic result props in the actual dashboard frame and result component at 390, 820 and 1280 pixels. It verifies layout, state text, wrapping, focus and native refresh behavior. It does not verify real authentication, Storage HTTP endpoints, admin image delivery, camera inputs, provider recognition or deployed scheduling. Those release holds remain.

The S4 sheet-check guard was applied as `20261106003403` (`scan_marking_sheet_check`). An earlier Send and a `ready` label are insufficient. New work discovery, frame loading, claim, dispatch, extraction and application require numeric `result.sheetCheck >= 1`. The function share-locks the current calibration after the photo lock, so a recheck/refusal cannot change it during a fenced operation. Existing committed publication/profile recovery remains independent of image availability. The application frame reader checks the numeric version as well. Legacy absent/null/string/zero/fractional-below-one/malformed values are refused; versions 1 and 2 are positive controls. No Send function is replaced.

PR637 is integrated from main b22a7ad640506c62327b744fcf4a809983959ada. Its recheck path now shares S4 admission through scan_recheck_admission (20261106005438), without changing Send. The combined local SQL suite has 48 passing cases. See .design/experiments/r457/integration-pr637.md for the failing-before cases, hosted rollback proof and remaining release limits.

## S5 migration and verification

Apply `20261106_scan_mark_changes.sql` after `20261106_scan_marking_sheet_check.sql` and the merged `20261106_scan_recheck_admission.sql`. S4 and its profile and deletion dependencies must already exist. Then run `npm run db:types`. The implementation child did not apply hosted migrations or change generated types. Root owns these steps before deployment.

The migration renames the deployed automatic command and puts a service-only wrapper at its existing name. All automatic operations still run the same photo, lease and sheet-version guards. The parent change branch does not read Storage or require an active photo. It cannot restore an image or dispatch AI. It accepts scored or pending required items. It refuses unscored or unavailable items. Trusted print eligibility still decides mastery. Parent judgment never records a child's second try.

Page results, profile facts, skill states and future planner inputs use the existing effective-result projection. That projection counts the canonical original once. Parent changes clear effective mistake and stuck-step causes. Raw original events and previous profile inputs remain unchanged. The existing profile save compares the marking revision and build token. A late save cannot replace facts from a newer change. Event publication and the profile rebuild use durable outbox and revision records. The existing recovery cursor retries them after a process failure, including after photo expiry. A facts-only save keeps the marking revision pending when skill-history reads or writes fail. That retry flag commits with the facts and stays on any later AI findings save. The parent receives a saved status with `recoveryPending` when these later steps fail.

Admin scan detail reads correction history in pages of 100 rows. Follow More changes until the page is empty. No image expiry filter applies. This history is service-only. Browser roles have no direct table or RPC access. The new table has RLS, family and child write fences, and cascading family and child foreign keys. No bucket, provider call, retention deadline or anonymous-copy field was added.

For local proof, use a fresh disposable database on a dedicated Unix socket under `/tmp/pd457-pg-s5-*`. Run the S4 fixture first, then the S5 runner:

```bash
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-EXAMPLE SCAN_MARKING_DATABASE=pd457_s5 node supabase/tests/scan_marking.cjs --bootstrap
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-EXAMPLE SCAN_MARKING_DATABASE=pd457_s5 node supabase/tests/scan_mark_changes.cjs
```

The S5 runner uses the public PATCH handler, production service action, canonical store, effective projection and public profile rebuild. It replaces authentication and persistence transports with local synthetic seams. Production SQL owns versions, history, publication acknowledgment, profile compare-and-set and deletion fences. It sends no network request. `--installed` repeats the S5 cases without applying its migration again. `--old-code` loads the base route from `f3133376535b3c96f4c81f62f1f8d1cc80322a23` and must fail because that route has no parent correction action.

Local evidence does not prove hosted RLS, Storage APIs, actual worker credentials, provider retention, recognition accuracy, camera behavior, rendered layout or human approval. Keep marking and dashboard family release off. Root owns the exact full done gate and these release checks.

## S8 history migration and local proof

Apply `20261106_scan_page_history.sql` after the merged S5 `20261106_scan_mark_changes.sql`. The earlier S4, sheet-check and recheck-admission migrations must already exist in that order. The new migration adds two lookup indexes. It renames the complete S4/S5 command to `scan_marking_saved_command`, revokes its direct execution, and adds service-only history/monitor branches at the existing RPC name. All other actions delegate to the saved function. It does not replace Send, automatic marking, publication, profile recovery, the correction action or their write guards. There is no new retained table or bucket.

Root applies and verifies the migration on the hosted project, then runs `npm run db:types` and checks the final build. The implementation child does not access hosted services or edit generated types. The existing RPC signature lets the local build retain generated-type checks without a type override.

Local reproduction uses one disposable PostgreSQL cluster with only a Unix socket under `/tmp/pd457-pg-s5-pd470-*`. Run S4 bootstrap and S5 first. Then run the new probe:

```bash
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-pd470-EXAMPLE SCAN_MARKING_DATABASE=pd457_s8 node supabase/tests/scan_marking.cjs --bootstrap
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-pd470-EXAMPLE SCAN_MARKING_DATABASE=pd457_s8 node supabase/tests/scan_mark_changes.cjs
SCAN_MARKING_SOCKET=/tmp/pd457-pg-s5-pd470-EXAMPLE SCAN_MARKING_DATABASE=pd457_s8 node supabase/tests/scan_history.cjs
```

The S8 probe adds only the reduced fixture's missing metadata columns. It applies the real migration and runs the real lean history adapter and public projection against synthetic canonical marks, retakes, jobs and cost records. It compares the complete prior command and Send function bodies. It exercises more than 100 pages, correction races, image expiry, scoped parent/Admin reads, browser-role refusal, family/child freezes and deletion. No image or model dependency enters the history reader. No paid dispatch or hosted request runs.

The monitor's spend outcome is the saved job outcome for each linked dispatch. It is not a provider attempt log. Reported cost, unknown reservations, logical jobs and adapter attempts stay separate. After family deletion, the anonymous global ledger continues to hold unknown charges. Local SQL proves these calculations and refusals on reduced dependency tables. It does not prove the hosted catalog, Storage policy enforcement or real worker permissions.

## No parent judging: team marks (#715, D-303)

The AI marks every answer and no screen asks a parent to judge one. A parent only corrects a finished mark with "Change this mark".

- Not read yet: the item says "Not marked yet" and has no control. Page history says "Not marked yet".
- Unsure: the AI read the item (the row has a model, or the observation holds a reading) without a sure result, or the item is an old format a person marks. The item says exactly "Our team is checking this answer." Only a reading the AI marked blurry or cut off adds that reason and "You can also send a new photo of this page." Page history says "Our team is checking". One rule: `waitsForTeam` in `src/lib/scan-marking.ts`, and the same condition in `admin_scan_team_queue` and `admin_set_scan_mark`.
- The PATCH route refuses a parent's change of an item whose current version has no result.
- `/admin/scans` lists the answers waiting for our team, oldest first, with the total and a link to each scan. A waiting answer with no saved photo says so and has Right, Wrong and Blank in its row, except one rule (`teamMarkNeedsPhoto`, the same in `admin_set_scan_mark`): an answer that counts toward progress and has no learning event yet needs a photo, because its event must name the photo it came from. Its row says it cannot be marked here and to ask the family for a new photo of the page, and the function answers `no_photo` and saves nothing. `/admin/scans/<photo>` has "Answers for our team to mark" with Right, Wrong and Blank. `POST /api/admin/scans/marks` (body `{ item, version, result }`) calls `admin_set_scan_mark` with the admin's own session; the function checks `public.admin_users`, locks the item, checks its version and that it still waits for the team, and appends a `scan_mark_changes` row with actor `admin` and `admin_id`, in the same transaction as the item update and the marking revision. The route then publishes the event and rebuilds the profile with the server key, the same way as after a parent change. Progress history reads the row as a person's mark. A parent can change a team mark afterwards.
- Write-words: code decides whether the reading names the key (`src/lib/scan-marking-words.ts`). A number name in an ordinary form (with "and" only after hundred or thousand, hyphens, case, spacing, run together) is right; a different number is wrong; a misspelling counts only when it is in the short closed list `KNOWN_MISSPELLINGS` (fourty, ninty, ninteen, eightteen, eigth, twelv, fivety, fivty, fiveteen, hundered, hunderd), and then follows `MISSPELLED_NUMBER_NAME` (right until Savar answers); any other word, a real word such as "fifths", "sixties" or "tens" included, makes the reading unsure. Nothing is guessed from how close a word is. A word key needs the same words (only case and spacing are ignored); true/false, even/odd and yes/no opposites are wrong.

Migrations: `20261107204619_scan_team_marks.sql` (additive: `admin_id`, the team list index and the two admin functions; applied) and `20261107211637_scan_mark_changes_team_actor.sql` (widens the actor check to `parent` or `admin`; applied). Before the second, a team mark failed on its insert and saved nothing. `20261107213302_scan_team_mark_followups.sql` (applied; function bodies only): `parent_explanation_command` counts a person's mark as finished for actor `parent` or `admin`, so a team mark no longer blocks the page's explanations (an answer still needs a sure reading to be explained, as for a parent mark), and the two admin functions use the one waiting rule. `20261107220421_scan_team_mark_no_photo.sql` (applied; function body only): `admin_set_scan_mark` answers `no_photo` instead of raising. Local checks on a disposable Postgres: `supabase/tests/scan_team_marks_stub.sql` and `node supabase/tests/scan_team_mark_explanation.cjs`.
