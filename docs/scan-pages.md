# Scan pages release

`SCAN_PAGES_ENABLED` is a server release switch. Leave it unset to keep scanning closed to ordinary families in every environment, including production. While it is off, only families marked in `public.test_accounts` and users listed in `public.admin_users` have access. The server reads those marks on each request. A browser cannot supply its own mark.

A child with an open plan also has scanning, with no switch (`src/lib/plan-access.ts`). `scanPagesAccess` is the family's way in; each route or page that names a child or a photo also asks `scanChildAccess`, so one child's plan does not open a sibling. The switch and a mark go on opening every child. A closed plan reads as the usual not found. The per-child routes are the stack, admission, reading and saving a photo, the image, progress and "Email me the link". Delete and release of a photo ask only the family's way in. A plan grants no marking: marking, Send, the photo checks, crops and recovery follow `src/lib/scan-marking-access.ts` alone (`markingAccess`, `scanChecksAccess`; "Families mode" below). Explain follows marking admission or the open plan of the photo's child (`explanationPlanOpen`).

To open scanning to signed-in families, set `SCAN_PAGES_ENABLED` to `on` in the server environment for the deployment, then redeploy. Only the exact value `on` enables it. Remove the value and redeploy to close access again. This PR does not set the variable.

Parent home shows the link only when the server permits access. `/account/scan` and every scan API handler independently check the live signed-in session and release before they read a photo, parse an upload or change data. Blocked requests use the normal not-found response. The image route checks access again after the Storage read. The desk lock still applies to permitted users.

## Marking launch hold (#542)

`SCAN_MARKING_ENABLED` is separate from `SCAN_PAGES_ENABLED`. Unset means off. Only two exact values turn marking on: `test-only` permits automatic marking only for a family currently in `test_accounts` or a user in `admin_users`; `families` also admits real families whose child's plan is running (see [Families mode](#families-mode) below). `on` is unsupported and remains off. An enabled Scan pages switch, browser approval fields, or a completed checklist cannot open family marking. Production stays `test-only`.

`SCAN_MARKING_TEST_PARENT_IDS` is an optional server-only restriction for `test-only` marking. For a synthetic test, use only the explicitly owned synthetic fixture parents. The value must contain 1 to 100 unique UUIDs separated by commas, with no spaces or empty entries. The maximum length is 3,699 characters. UUID letters can use either case. Duplicate UUIDs in different cases are still duplicates. An empty, malformed, duplicate or oversized value refuses access before the family lookup. A listed parent must also pass the current `markedFamily` database check. The list alone cannot grant access.

When the variable is absent, the existing test/Admin admission rule applies. When it is present, `markingAccess` also requires membership in the list. Direct marking, recovery of previously sent photos, and the explanation route, including cached explanations, use this check. Recovery can visit an unlisted photo through its existing cursor, but cannot start marking it. The check does not remove test-family marks or change family data. Parent IDs are not added to API results, readiness results or logs.

To reverse this restriction, remove `SCAN_MARKING_TEST_PARENT_IDS` from the server environment and restart or redeploy that server. This restores access for all verified test/Admin families when marking remains `test-only`. To stop automatic marking, remove `SCAN_MARKING_ENABLED` or set it to `off`. An empty list refuses access; it does not restore the absent-variable behavior. This change applies no environment values and establishes no deployment or recognition proof. `familyReady` remains false. Real child photos and real-family marking remain held. Provider privacy remains deferred. Physical acceptance remains open.

### Families mode

`SCAN_MARKING_ENABLED=families` opens marking to a real family for one child when that child's plan is running. Marking opens when an admin presses "Start free month" and closes with the plan. `markingAccess` (`src/lib/scan-marking-access.ts`) decides on every request:

1. Test families and admins keep the `test-only` rule, including `SCAN_MARKING_TEST_PARENT_IDS` when it is present. The list limits only this path; a malformed list closes marking for everyone.
2. Any other family needs the child, read with the signed-in parent's id: the page names it (the workbooks page, history, progress, the stack and Send; the child is read on `id` and `parent_id`), or the photo belongs to it (results, marking, corrections, explanations, direct marking and recovery; the photo is read with the signed-in parent's id, so another family's photo has no child). With no child, marking stays closed.
3. The shared plan gate answers for that parent and child. Only an answer with `open: true` and the reason `open` or `ending_until_end` admits the family. `no_plan`, `ended`, `payment_failed`, `paused`, `unknown`, `read_failed`, an error or an answer of any other shape closes it. Another family's child reads as closed.

The Vercel cron `/api/scan-marking` is what starts marking for sent pages: Send (`/api/account/scans/send`) only records the pages as sent (`send_scan_photos`), no client calls `POST /api/account/scans/<id>/marking`, and the cron's `recover_scan_marking` picks up every sent photo with no finished job. While the team is on the Hobby plan, which allows only daily crons, it runs once a day at 15:30 UTC (`vercel.json`); on Pro it ran every 5 minutes (`*/5 * * * *`). At the daily schedule, `test-only` marks at most 1 photo a day (one step, `p_limit` 1) and `families` at most 10 pages a day across all families (`RECOVERY_STEPS`), and marks can arrive up to a day after Send. **Hard gate: `SCAN_MARKING_ENABLED` must not become `families` until marking runs every 5 minutes again, through Pro or a database job (Savar decides which).** The same check runs again before recovery marks a previously sent photo, so a plan that ends stops new marking at once. Marks already saved for that photo still go to the child's learning events and profile (no image read, no model call). In families mode one recovery run moves past up to 10 refused photos on the same cursor, so closed plans do not hold up other families. `markingDecision` returns the reason for server code and logs; parents see only the usual not-found or "unavailable" screen, never the reason. `familyReady` still reports only the evidence record below; it is not the switch.

The plan gate is the parent dashboard's `childPlanAccess` (`src/lib/plan-access.ts`, PR #705), imported by `scan-marking-access.ts`: in families mode a real family is admitted only for a child whose plan it reports as open or ending at the end of its period.

Send, the photo checks (preview and calibration, with their crops) and the stack's `checks` follow the same rule through `scanChecksAccess` in `src/lib/scan-marking-access.ts`, the one module that holds it: in families mode a real family can check and send a child's pages while that child's plan is running, and not otherwise. In `test-only` and off they stay with test families and admins, and the parent list does not limit them, as before. In families mode a malformed list closes them as it closes marking.

Families mode does not open the Scan pages tab: a real family reaches `/account/scan` when `SCAN_PAGES_ENABLED` is `on` or a child's plan is open (see the top of this page), and an open plan alone grants none of the steps above.

To switch: Savar picks the marking model first. Then set `SCAN_MARKING_ENABLED` to `families` in the Vercel Production environment (`npx vercel@latest env` with `--scope unica-learning`) and redeploy. To go back, set it to `test-only` (or remove it to turn marking off) and redeploy. The switch changes no price row, spending cap, model or parent list.

The canonical evidence record is `SCAN_MARKING_LAUNCH_EVIDENCE` in `src/lib/scan-marking-launch.ts`. The table below describes that record. Record each approval there with its owner, source reference, UTC time and candidate. The candidate names the exact model, prompt, photo-set SHA-256 and printed revision. `scanMarkingLaunchReadiness` rejects missing, malformed, incomplete, deferred or mismatched proof. A changed candidate makes old proof stale. A later source-controlled record must cite the actual approval or measured report. Local tests are not approval evidence.

| Record item | Owner | Required proof | Current status |
|---|---|---|---|
| `sample-approval` | Savar | Applicable recorded first-book sample approval and its frozen revision. | Shared acceptance remains open. PR #685 (`cfab8191`) and PR #672 (`6acaa263`) merged. Coverage is not sample or print approval. Do not reimpose the superseded all-level sample requirement. |
| `screen-approval` | Savar | Applicable recorded review of the scan, result, unsure reason and correction screens. Preserve existing approvals. | Root browser correction proof exists in `r458/root-verification.md` and `root-browser.json`. The r454 manifest records S1 look approval. #458 stays open for applicable shared acceptance, not duplicate S5 code or a new approval demand from a stale label. |
| `evaluation-bar` | Root comparison owner | Candidate-bound record that D-267 was set before the paid run. | D-267 is unchanged and precedes inference. The canonical record is bound to the fixed Robin manifest, Sonnet v7 and fixed reader. See [synthetic evidence](scan-marking-v7-acceptance-20261107.md). |
| `evaluation-pass` | Root comparison owner | Counted comparison report on the same frozen photos, model, prompt and revision. Sonnet 5.5 first; Haiku must pass the same bar on the same photos. | Accepted synthetic Sonnet saved-v7 offline replay: 0/218 wrong, 0 wrong marked right, 1/219 clear unsure. Terra also passed the new fixed40 run; final model choice stays with Savar. Haiku and Gemini failed. Physical recognition is not established. See [results and limits](scan-marking-v7-acceptance-20261107.md). |
| `provider-policy` | Savar | Verified host no-training policy and retention settings, per-request `data_collection`/`zdr` settings that match the choice, and Savar's recorded provider/retention choice. | **deferred by Savar** (D-293). Real child photos remain blocked until Savar sees a passing host policy and chooses. #642 stays held. |
| `dedicated-key-limit` | Root platform owner | Reviewed dedicated-key client isolation and outside key limit of USD 50 TOTAL, with no monthly reset. Verify the shared USD 50 UTC-month budget and the USD 15 comparison projection stop. Do not record the key. | Provider GET verified USD 50 total with no reset; source has dedicated-key isolation. Evaluation migrations, price refresh, retained 429 holds and audited full-reservation resolution are applied and checked. The aggregate comparison liability is USD 2.078815. Production key loading and production price proof remain separate test-only checks. |
| `physical-iphone` | Savar and root acceptance owner | A filled, saddle-stitched synthetic booklet, photographed through iPhone Safari, with the scan/results checked against its frozen truth. | Pending. Robin PDF ready; no physical camera pass. |
| `physical-android` | Savar and root acceptance owner | The same physical booklet through Android Chrome, with the scan/results checked against its frozen truth. | Pending. No physical camera pass. |
| `privacy-text` | Savar and root release owner | Approved parent privacy disclosure that matches the chosen provider and retention policy. | **deferred by Savar** (D-293). No text change or approval in this slice. |
| `release-flags` | Savar and root release owner | Recorded release decision, privacy completion and verified deployed admission/flag behavior. | Pending. Family flags and production prices remain unchanged. Test-only access is not family approval. |

Existing S5 proof from merged PR #672 is retained. Root checked the committed `.design/experiments/r458/` records against #458. These records establish separate proof classes:

| Proof class | Existing record | What it establishes and its limit |
|---|---|---|
| Local public interfaces and SQL | [S5 verification](../.design/experiments/r458/verification.md), [scenarios](../.design/experiments/r458/scenarios.md), local test logs | No default score for a pending check; all six Right/Wrong/Blank transitions; numeric corrections after photo expiry; concurrent version protection; rollback and durable recovery; retained answer readings and history. Local seams do not establish hosted Storage HTTP behavior or camera recognition. |
| Hosted rollback and catalog | [S5 hosted records](../.design/experiments/r458/root-hosted.json), [root verification](../.design/experiments/r458/root-verification.md) | Applied service-only schema, RLS/grants and write fences; stale-version refusal; retained original data; terminal-photo correction and recovery; deletion cascades. The synthetic probe rolls back. This S5 proof is separate from the inherited physical-object Storage checks below. |
| Real hosted sessions through the local app and browser | [API](../.design/experiments/r458/root-api.json), [browser](../.design/experiments/r458/root-browser.json), screenshots, [root verification](../.design/experiments/r458/root-verification.md) | Explicit corrections, retained reading after photo deletion, no pending default, no unscored control, stale 409 followed by a new-version save, and phone/tablet/desktop viewport checks. These are real session/browser corrections. They are not real-phone booklet, calibration or recognition proof. |
| S5 family-deletion worker without Storage objects | [Worker cleanup](../.design/experiments/r458/root-worker-cleanup.json), [root verification](../.design/experiments/r458/root-verification.md) | The synthetic family's Auth, family, photo, canonical mark, history, revision and event rows were removed. No Storage object was created in this S5 fixture. The inherited r455 worker proof covers physical files separately. |
| Independent fixed-source review | [Final review](../.design/experiments/r458/independent-review-final.md) | Scoped S5 review approved the final ordering repair, preserved identity/version association and retained behavior. It read supplied hosted/browser evidence without repeating those live checks. It grants no human sample, UI or family-release approval. |
| Inherited hosted physical-object Storage and image-route boundaries | [r455 security](../.design/experiments/r455/hosted-security.json), [r454 security](../.design/experiments/r454/hosted-security.json) | With objects present, owner/Admin/anonymous direct downloads and single/batch signed URLs are denied. Authenticated owner/Admin image routes work; another family and anonymous are refused. r455 includes photos, straightened pages and crops, concurrent POSTs, lost leases, refused finishes and retries. |
| Inherited hosted terminal deletion, clock expiry and sign-out | [r455 security](../.design/experiments/r455/hosted-security.json), [r454 expiry](../.design/experiments/r454/hosted-expiry.json), [r454 sign-out](../.design/experiments/r454/hosted-signout.json) | Routes and direct Storage access fail before physical cleanup; late writes and finishes are refused. Clock expiry alone closes access. A revoked session cookie returns 401 while its object still exists. These are recorded hosted lifecycle results. |
| Inherited physical-file family deletion | [r455 family deletion](../.design/experiments/r455/hosted-family-deletion.json) | The actual `retention_worker` returned deleted with 39 images removed. Photos, straightened pages and crops were removed before Auth; calibration/photo rows cascaded; the scan folder was empty and the old image route was refused. |

The [r458 manifest](../.design/experiments/r458/manifest.json) still says `Pending root Aside checks and Savar approval` in `visual_review`. The root browser records establish that browser checks ran. Treat the root-check part of this label as stale. Do not treat the label as human approval, a reason to repeat completed S5 code, or a new approval requirement. The [r454 manifest](../.design/experiments/r454/manifest.json) already records S1 look approval. Preserve it. Only applicable shared UI/sample acceptance remains open.

The inherited r454/r455 records used hosted database/Storage and a local app with synthetic pages. Their recorded limits are real handwriting, camera capture and curled pages. Their artifact history was last changed at `13cf268230730cbfdeb71aa69a0a40496051d489` (r454) and `a74cd78ff0082e7859a1b5bce91768c5a65a6388` (r455). These are source provenance references, not new test runs or certification of the current deployment. This slice reads the committed evidence; it makes no fresh hosted claim. S5 did not repeat physical-object tests because its correction fixture created no Storage objects. That omission does not remove the inherited proof or create a new Storage blocker.

Remaining shared gates are real-phone booklet/calibration/recognition and uncertain-reading acceptance, model selection/evaluation, provider/privacy, and applicable recorded approvals. Provider privacy stays **deferred by Savar**. Real child photos remain blocked until Savar sees a passing host policy and chooses. Do not reopen recorded approvals or the superseded all-level sample requirement. Older pd458 paid-stop and ownership text is historical. The latest user authorization controls spending and ownership; the earlier text does not impose a new paid-call stop or duplicate ownership here.

D-267 permits at most 1% wrong definite marks, zero wrong answers marked right, and at most 5% unsure answers on clear photos. Unsure answers receive no right/wrong mark and need a plain reason. The check requires positive definite and clear-photo denominators, integer counts and the unchanged thresholds. It checks that the recorded bar precedes the run, that the run has finished and that pass proof does not predate completion. Sample, screen and provider-choice approval records must name Savar. AI reads every item, and code marks it from the reading (D-301). A parent marks no question. A parent can still change a mark.

Run synthetic-only comparison first. The physical phone-photo checks follow later. The Robin booklet is `/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet/Robin-marking-test-booklet.pdf`, SHA-256 `d95cec84ed1cd4780e9fef18dd18faf6e02dfa736e02b0e1de1f01bc122b5659`. It has 12 PDF pages, 10 exercise pages and 74 items, all AI-marked (74 AI, 0 parent). It contains no real child data. Its QR is not registered. A ready PDF is not a filled physical booklet or a recognition pass.

Comparison tools and dedicated-key isolation shipped in PR #692. This candidate adds the reviewed v7 readable-blank prompt, null-blank reader correction, explicit Terra evaluation option and synthetic Sonnet launch evidence. The historical 13-pair default is unchanged. The explicit two-model run completed under the aggregate cap. See `scripts/scan-marking-comparison-cli.ts`, `docs/scan-marking-comparison.md` and [current acceptance evidence](scan-marking-v7-acceptance-20261107.md). These facts do not establish production key loading, physical recognition or family approval.

`scanMarkingServerReadiness` reads only the source-controlled record and the current code's model/prompt. It returns named blockers plus `family-release-held`. Both `processScanMarking` and `recoverScanMarking` use its mode check before automatic work. Recovery rechecks each returned family's admission (test/Admin, or in families mode the plan of the photo's child). History reads and parent changes keep their existing ownership checks and durable event/profile recovery. Their server functions do not need an active photo or launch approval. Public marking GET/PATCH routes retain their existing `markingAccess` checks; this slice adds no new history/correction gate.

There is no family `on` mode; the family release is the `families` mode above. SQL admission remains unchanged. The existing `scan_marking_command` also requires a shipped workbook, matching frozen revision, active photo, Send and current calibration; price and global-budget admission remain separate. In families mode Send and calibration follow the same admission rule as marking (`scanChecksAccess`), and no SQL function scan marking uses checks `test_accounts`, so a family with a running plan passes every step. Evidence readiness is separate: it does not open families, and the switch does not prove the evidence (D-300).

Keep #542 and #458 open. Print/template/package/plan/curriculum changes remain frozen until the book is printed. The actual customer book stays read-only. Its local coverage count is not physical recognition proof. The team reads book 1 marks daily. First-shipment Maya is chat only; voice remains paused. D-293 records the release direction; D-300 records the families mode.

## The Scan pages tab (#564)

In the parent dashboard the Scan pages tab opens `/account/scan`. The tab shows only for a child whose first workbook was delivered, and only when this same release check passes, so it stays hidden from ordinary families. A phone or tablet gets the camera flow. Any other device gets "Please take a picture with your phone", with a QR code of the page's address (`/account/scan`, nothing else) and "Email me the link". The server reads the device from the user agent. iPadOS Safari asks for the desktop site by default and reports a Mac, so the server cannot tell it from a laptop: that screen also offers "Take the pictures on this device" (`/account/scan?here=1`), which opens the camera flow on any device. A signed-out visitor is sent to sign in and back to the page, so the QR code works on a phone that is not signed in yet; after sign-in, the release check decides as before.

"Email me the link" (`/api/account/scan-link`, `src/lib/scan-link.ts`) passes the same session and release check as the scan routes, then emails the page's address to the parent's own email through the delivery module. The link holds no token: it signs no one in. At most 3 emails an hour go to one parent, counted under a lock in `public.scan_link_emails` (`claim_scan_link_email`).

The switch does not stop the authenticated cleanup cron, expiry, family deletion or physical removal. These must continue while scanning is closed. Storage remains private. The switch does not enable AI marking.

## Straightened preview and numbered crops (#455, S2b)

After a photo is saved or waiting for its save, `POST /api/account/scans/<id>/preview` makes the straightened page and one numbered crop per single-box whole-number item. It runs once per photo under a 90-second lease. `GET` reads the result. `/api/account/scans/<id>/preview/<part>` serves one file with the same checks as the photo. Only test families and admins can reach these, even when `SCAN_PAGES_ENABLED` is `on` (D-252), and the desk lock applies.

- **Calibration** (`src/lib/scan-calibration.ts`). It finds the four L-shaped marks in the photo and maps the page from the stored print contract, never from today's template. A rectangle counts only when three things hold: its ink follows the printed page image that the contract fingerprints, cell by cell; no other rectangle in the photo does; and the QR code inside it reads as this page's own link, where that image printed it. A photo with a missing mark, of another page, with two sheets, with a covered or moved code, or with an unclear way up is refused, and the photo stays. A legacy book or an older revision gets no calibration.
- **Files**: `<parent>/<photo>/<lease token>-straight.jpg` and `<lease token>-crop-<n>.jpg` in `scan-photos`, flat beside the photo. `fence_scan_object` admits one only with an active, unexpired photo and the current lease, even with the secret key. Browser roles have no access: the restrictive bucket policy covers these names too. Photo deletion, expiry and family deletion remove them with the photo.
- **`public.scan_calibrations`**: one row per photo with geometry and identities, no image bytes and no answer text. The server writes through `begin_scan_calibration` and `finish_scan_calibration`, admins read, parents read nothing. It goes with the photo and the family.
- **Observations** (`src/lib/scan-observation.ts`): the public shape and the page-completion rule that S4 and later slices use. This slice stores no observation and publishes no learning event.
- **Storage errors**: Storage hides a database exception's text and reports its code. `isFenceRefusal` reads `P0001` and `55000`.

Run the hosted checks with `SCAN_FIXTURE=<private path> SCAN_BASE=http://localhost:3455 .design/experiments/r455/run-hosted.sh <phase>`, for the phases `prepare`, `seed`, `check`, `deletion` and `cleanup`, with `npm run dev` on that port. They use only their own synthetic test families.

Page matrix (`.design/experiments/r455/page-matrix.json`): 36 real pages at 2 angles. 0 of 2520 comparisons with another page calibrated: the ink comparison stopped 2510, and the QR code stopped the 10 between pages that differ by a few digits. 71 of 72 right pages calibrated; a strong tilt refused one.

Limits: synthetic drawn digits on real printed pages. No real handwriting, real camera or curled saddle-stitched page has been tested (G13 in `.design/research/marking-audit-2026-11-04.md`).

## Which page a photo shows

The preview is ready only when the photo is shown to be one sheet, this page (#456, D-285). Calibration finds the four corner marks, compares the photo's ink with the printed page image, and reads the QR code where the page printed it. The job then compares the photo with the child's other printed pages of the same page type (`sheetChecker`), a few page images at a time, with a deadline of 35 s from the start of the job. Near twins are the pages that hold at least 75% of this page's print, decided from the prints alone, so glare cannot take a page out of the comparison. At each spot where a near twin prints differently, the photo must hold this page's print by a margin, read at the contrast the photo has around that spot.

- `another-page`: a spot holds the twin's print: a QR code pasted on another page, or another page lying over this one. The parent is asked for another photo of this page alone.
- `faint`: a spot is too bright, faint or covered to read, or more than one spot in five shows neither page clearly. The parent is asked for another photo without glare.
- `check-timeout`: the job ran out of time. This refusal is not stored. The parent is asked to try again in a minute, with a Try again button that opens when the job's 90 s lease is over (`retryInMs`). A call inside the lease starts nothing, and the next call after it does the whole check.

The job's list of other pages is read by id, 500 rows at a time, until a read comes back empty, so the database's row limit cannot hide a near twin. Only the paths are held; the images are still read a few at a time. A child with many hundreds of pages of one type can run out of the 35 s, which refuses safely.

The deadline also applies to the frame and input reads. The job checks it after decoding and after each page comparison. A synchronous comparison can finish after the deadline, but the job discards that answer and stores no result or files.

A ready result records `result.sheetCheck`, currently version 1. An older or missing version is not checked: the preview serves no crops, the stack shows Checking, and Send excludes the page. The next preview POST uses `reopen_scan_calibration` to take the old result under a new lease and check the photo again. A refusal removes the old lease's files. Migration `20261105_scan_sheet_check.sql` adds the service-only reopen function and updates Send. Probe: `supabase/tests/scan_sheet_check.sql`. It rolls back all synthetic rows and ends with `PROBE_OK` on success.

The comparison also takes approved books that have not shipped, as approval gives a book its printed revision. Comparing against more pages is safe. The evidence is in `.design/experiments/r456/`.

#454 stays open. Physical iPhone Safari and Android Chrome camera checks and deployed cleanup checks remain.

## The stack (round r565, D-269 to D-276, step 1 of D-276)

`/account/scan` is the stack from the picked round (`.design/experiments/r565/picked.html`), on the phone's own file input. The live camera comes after the real-phone test (D-276).

- **Start screen.** The three tips, "Choose photos" (several photos at once) and "Start scanning" (the phone's own camera through the file input's `capture`). The photo notice opens once, before the first photo, and "Got it" opens the camera or the photos in the same tap.
- **Each photo saves when it arrives** (D-269): upload, then save, with no confirm per page. The browser sends one photo at a time, because the server takes 2 uploads at once and processes 1. A photo the server refuses at upload (no page code, a page of another workbook, a page that already has a photo, an unreadable or too large photo, too many photos) stays on this device in the stack with its reason; it is not saved. The photo id stays with the queued photo: "Try again" after a lost answer reuses it and takes no second upload slot, a new id is taken only when the server says the old one ended, and giving the photo up (changing the child or choosing another photo) asks `POST /api/account/scans/<id>/release`. Release is not a delete: `release_scan_photo` lets go only of a reservation whose upload has not started, under the family lock, and keeps a photo that is processing, pending or saved (probe: `supabase/tests/scan_release.sql`). "Delete this photo" stays the explicit `DELETE`. A photo the list shows reached the server after all, so its refused entry goes. A failed save is asked again each time the list refreshes while the photo is pending.
- **Checks** (test families and admins, and in families mode a child whose plan is running; D-252, D-300): the browser asks for each saved photo's straightened page (S2b), one at a time. The calibration's refusals become the short reasons in the stack: Cut off, Not flat, Wrong page, Turned, Two pages, Code not clear, Cannot check. A book printed before checks shows "Cannot be checked". No new reason is made up: blur and darkness are not checked yet (S3).
- **The stack** (`src/lib/scan-stack.ts`): refused pages first with their reason and "Take the photo again" (one at a time); then the pages by day, in page order, with "No photo yet: page 2" for a page of the day with no photo; then the pages sent for marking. A retake deletes the old photo only once a new photo is chosen.
- **Send** (`POST /api/account/scans/send`, `send_scan_photos`, D-270) counts only ready pages: saved, active, and checked ready on the photo's own printing. It records `scan_photos.sent_at` once; refused and still-checking pages stay in the stack. The separate S4 worker uses the marking release check and admission ledger. Send itself makes no model call. Send is for test families and admins, and in families mode also for a child whose plan is running (D-300).
- **Limit** (D-271, migration `20261105_scan_stack.sql`): 40 photos per 10 minutes and 60 a day. Refused and retaken photos count. `admit_scan_photo` reads `scan_limits` under the family lock. Probe: `supabase/tests/scan_stack.sql` (a pass is the error `PROBE_OK`).
- **Desktop** (D-273): the QR code, "Email me the link" and "Take the pictures on this device" beside the pages from the phone, which refresh every 5 seconds, with Send. Retakes stay on the phone.
- **A page's QR code.** Read by the phone's own camera, it still opens the desk for the child whose desk is open on that device. Otherwise, a parent who was on Scan pages in the last 30 minutes (the cookie `unica_scanning`, a note and not a credential) goes to Scan pages for that page (`/account/scan?w=<workbook>&p=<page>`); everyone else gets the desk question with "Scan this page". Both need the scan release.


## Choice and number marking (#459, S6)

The marker reads one whole normalized page. It sends local item and region aliases, frozen measured boxes, region kinds and all printed choice labels. It sends no separate family identity, answer key, question text or worked example. Code reads a tick-and-number item only when its stored package passes the existing package checks and both scored regions have measured boxes. The work box remains evidence in the private page photo. It is not a separate attempt.

Every scored region right makes one right item. Every region empty makes one blank item. A definite wrong region makes one wrong item, even when another region cannot be read. A partial answer that could still be right stays pending. Missing, duplicate, unknown and ambiguous readings cannot produce a right or blank item. Code keeps a fixed uncertainty reason for parent review. Model verdicts and free-text reasons do not enter the result. Numeric reading rejects a decimal that floating-point conversion would round to another written number.

The review crop spans the item's choice and answer regions. It keeps one crop and one result per printed item. Multi-region crop metadata adds regionIds; the older regionId remains the first region for older readers. These are scan derivatives, not changes to the stored print contract. Existing photo leases, terminal deletion, expiry, ownership checks and Storage fences still apply to the same paths. A ready calibration made before this extension can lack its new-format crop; a retake makes it through the new crop planner. No stored workbook is rendered again to create geometry.

The canonical result, version checks, parent changes, outbox and cost admission use the existing S4/S5 path. Finalized originals survive retakes. Concurrent devices cannot add a second original event for the item's regions. No schema, family switch or model override changes in this format extension. Sonnet remains the configured marking model.

Local public-interface tests prove synthetic region aggregation, bounded request data, separate adjacent crop geometry, canonical event counts and retake/version behavior. They do not prove recognition accuracy, hosted permissions or phone-camera behavior. The D-267 paid comparison and physical booklet check remain separate launch evidence. Provider privacy work remains deferred by Savar under D-293 and stays visible on the #542 list.


## Circle answers (#538, S7k)

A checked circle item uses the same whole-page request, with the frozen choice labels and circle mark type. Code compares a single clearly read choice with the stored checked rule. An unmarked choice is blank. Multiple marks, an unknown label or an unreadable region stay pending with a reason. A right, wrong or blank circle item finishes as one item and may publish one event. The item's own measured region supplies its review crop. No numeric operation is required when the package checks a printed true-or-false statement or comparison.

This format adds no separate attempt, image path, family switch or cost path. Its local fake-AI cases cover the six reading states and page completion. Recognition and physical-phone acceptance remain in the shared launch checks.


## Show-work final answers (#540, S7l)

The model reads the stored scored answer boxes, not the work region. Code checks the final answer. The whole private page photo keeps the working as evidence. A number in the work region cannot fill an empty final-answer box or create another result. Empty final-answer boxes are blank; uncertain readings remain pending. The existing parent correction flow can finish the item. This does not claim that code checks the child's method.


## Spot-the-error answers (#539, S7m)

Code checks the stored right-or-wrong choice and the corrected answer together. Both right means one right item. Both empty means one blank item. A definite wrong choice or correction makes the item wrong. A partial answer that could still be right remains pending. The printed wrong solution is not a requested answer region. The model does not judge the solution or choose the score. The stored package must pass its existing error and answer checks before recognition starts.

The item keeps one review crop, canonical result and original event. Its local cases include right choice with wrong correction, wrong choice with right correction, ambiguous marks, missing parts and an extra unrequested printed-example reading. They prove the response contract, not image recognition.

## Two-ways marking (D-301, D-302)

Savar decided on 7 November that AI does all marking and a parent marks no question. This replaces the parent review of 6 November (#461). A parent keeps "Change this mark".

The printed item has two work areas and one final-answer box. The model reads all three regions on the whole page. It transcribes each method as written, one step per line, and it never leaves out or tidies a step. It receives the question with each method region and no answer. For each method it also gives a verdict: `solves`, `does-not-solve` or `unsure`, with a short reason. The reason is evidence for the team and is never shown to a parent. Code checks the answer and the arithmetic in `src/lib/scan-marking-methods.ts`.

Code uses an allow-list and fails closed (D-302). A method is valid only when the AI says `solves`, every written step is true arithmetic, and code recognizes the whole method as one kind from the fixed list for the question's shape (`METHOD_KINDS`):

| Question shape | Kinds |
| --- | --- |
| `a + b = ?` | split one addend, partial sums, compensation, column, counting on in jumps |
| `a - b = ?` | split the subtrahend, partial differences, compensation, column, counting back, counting up |
| `a × b = ?` | split a factor, round and adjust, strip zeros, strip zeros from one factor, repeated addition, skip counting |
| `a ÷ b = ?` | repeated subtraction, skip counting, repeated addition, division with tens, build-up |
| `a × ? = c`, `c ÷ ? = a` | the inverse division, plus the division kinds |
| `a + ? = c`, `a - ? = c` | the inverse subtraction, plus the subtraction kinds |
| `? - a = c` | the inverse addition, plus the addition kinds |
| `? ÷ a = c` | the inverse multiplication, plus the multiplication kinds |

Each kind accounts for every number in the method: the question's numbers, their place-value parts or roundings as the kind defines them, earlier results, and the answer only as a final result. So padding (`× 1`, `+ 0`, `+ n - n`), an extra line, a copied question and a check that uses the answer have no kind. The form does not matter: `36 + 40 + 7 = 83`, the same two steps on two lines and the same steps as jumps are all one kind.

- A skip count goes up by the question's number, from that number to the target. The last line is the count, and the count is the answer.
- Repeated subtraction takes away that number from the total down to 0. The count is the answer.
- A bare last line must equal the last result, or the count. A column method's last line joins its column results.
- A number with a thousands space (`12 500`) is one number.

These are unsure, never Right: a method code does not recognize, two methods of one kind, a run-on chain (`36 + 40 = 76 + 7 = 83`), a line with `?` or `_`, a question shape code cannot read, and a fraction or decimal answer. Valid work that no kind covers stays unsure. A false step is Wrong, and so is `does-not-solve`.

| Reading | Item result | Label |
| --- | --- | --- |
| The answer is right, and both methods are valid and of different kinds | Right | `Right` |
| The answer is wrong | Wrong | `Wrong` |
| The answer is right, and a method has a false step or the AI says `does-not-solve` | Wrong | `Wrong. One way does not solve the question.` |
| The answer is right, and a method is empty (the child did not do two ways) | Wrong | `Wrong. One way is missing.` |
| The answer is empty, and the methods are read | Wrong | `Wrong` |
| All three regions are empty | Blank | `Blank` |
| A region is blurry, cut off or unreadable, and no region is definitely wrong | Unsure | The plain reason of that region |
| Anything else about a method: the AI is unsure, words or a drawing, no recognized kind, two methods of one kind | Unsure | `We cannot check this method.` |
| The answer box has a form code cannot check | Unsure | `We cannot check this answer.` |

The AI's verdict is one model's judgment. The AI still decides whether a recognized method solves the question. Robin measures this against human truth, but code alone no longer lets an unrelated sum through. The Robin phone test measures this against human truth. The Robin truth follows the same rule: an item is right only when the answer is right and both methods are valid and of different kinds.

The explanation feature handles a right answer with a wrong method: it tells the model the final answer is right and asks for a way to solve the question.

The item keeps one crop of both work areas and the answer box, one canonical result and one event key. It follows its frozen mastery decision, as other AI-marked formats do. The stored package and print contract stay unchanged. Missing or invalid measured regions make no crop and no reading.

Prompt v8 adds the method rule. The accepted v7 evaluation does not cover v8, so `scanMarkingServerReadiness` now names the stale candidate and the evaluation items as blockers. This changes no admission: `SCAN_MARKING_ENABLED` and the test-parent list still decide access.

### Round 9 coverage

The first-customer round 9 contract (`bfc5542e`) has 582 questions: 582 have an AI reading path, 0 have a parent marking path and 0 are unsupported ([coverage record](scan-marking-first-book-coverage-ai-only-20261107.json)). This is supplied-reading route proof. It does not prove recognition.

A parent marks no question through a parent path. But some labels still ask a parent to judge, counted from the stored book:

| Text | When | Questions |
| --- | --- | ---: |
| `Please check this answer` | Before a non-two-ways item is read | 575 |
| `Please check this answer.` | The model reports `answer-form` on a non-two-ways item | 575 |
| `Please check this answer.` | A clear write-words reading is not the literal key | 6 |
| `Check this answer` (button) | Any item with no result | 582 |
| `Please check` (page history) | A page with an unsure item | every page with questions |

So "0 parent" means no parent marking path. It does not mean that no text asks a parent to judge. The 7 two-ways items show none of the three labels. They can still show the button and the page history text. #715 owns this wording and the 6 write-words items, and it must land before print or marking opens for this family.

### Database

Migration `scan_two_ways_ai_marking` makes the old trigger `scan_two_ways_review_policy` do nothing. A later cleanup can drop the trigger and its function. No hosted row held the old policy on 7 November. Code written before this PR writes the parent method itself until the PR merges. If a two-ways row with `expected.review` appears before the merge, it stays parent-pending. Check this count just before the merge: `select count(*) from scan_marking_items where expected->>'review'='two-ways'`.

## Write-words answers (#541, S7n)

Savar chose AI reading with a code check on 6 November. The model transcribes the measured answer box as written. It must not correct spelling, translate, finish a word or solve the question. Code first validates the frozen package and its answer rule. It then compares the bounded text reading with that checked answer. Case and spacing do not change the words. No synonym, spelling correction or numeric conversion is used to make a right result. The original reading remains stored beside the value used by code.

A text reading that matches the checked answer, after case and spacing normalization, is right. A different text form stays pending for a parent. For example, 07:56 can be a valid form of 7:56, and 8 x 4 can be a valid form of 8 by 4. Literal mismatch alone cannot establish a wrong word answer. The parent can select Right, Wrong or Blank without losing the original reading. A genuinely empty box is blank. Missing, duplicate, crossed-out or uncertain readings stay pending for the existing parent check. A free-text key with no rule that code can check stays pending. The whole-page request contains the text-region kind and measured box, without its answer or template source. The item uses one review crop, one canonical result, one event key and the existing shared budget. Local fake-AI tests prove these decisions and page completion. They do not prove handwriting accuracy or the D-267 pass.

## Fraction and decimal answers (#462, #463)

The 6 November subscription approval sample has one fraction on page 21 and one decimal on page 62. Savar authorized automatic checks for both. The sample is not a stored customer printed revision. Count coverage again after the approved customer Prepare run.

Each newly supported scalar region requires the existing public package check to pass. The model transcribes the written form. It does not simplify, round, insert a fraction bar or infer a decimal point. Missing or ambiguous signs, bars, points and digits stay pending. A clear zero denominator is wrong. Code reads proper fractions, improper fractions and mixed numbers with exact integer arithmetic. It uses the package's operation and accepted forms when the region has an operation rule. It enforces required simplification. Template answers use exact rational equivalence. A different written decimal cannot become right through floating-point rounding. Leading and trailing zeros are allowed when they preserve the exact value. The original written text remains stored beside the typed value.

These items use the same whole-page request, review crop, canonical key, parent changes, shared budget and lifecycle rules. Post-expiry parent changes preserve fraction, mixed-number and decimal readings. Local tests prove these code and workflow contracts. The fixed whole-page recognition set and physical phone test must include both response families before family use. No cheaper-model switch or new family activation is part of this change.
## Saved page history (#470, S8)

Page history uses the current child, shipped workbook and stored printed day. It lists printed pages once, with separate states for no photo, pending work, parent review, failed checks, blank answers, unscored answers and ready results. A complete canonical result stays complete when a later photo fails. Parents return to the existing S4/S5 result and correction screen. Original readings and correction history stay available after photo deletion or expiry. The list does not request images or start marking. A later scan does not change a frozen workbook plan.

The shared reader is `readScanHistory` in `src/lib/scan-history.ts`. The parent GET and `/admin/scans` use its lean service adapter. The RPC reads 100 stored pages at a time by page UUID. The reader continues through nonmatching rows and returns up to 25 matching pages with a continuation cursor. Counts refer to those displayed pages. There is no 90-day result filter. The parent response has page summaries and result links, with no job internals, spend ledger or answer text.

Admin can filter the same records by child, workbook, unresolved review or failed check. The list links the existing Admin scan detail. List costs use all dispatch records linked to exactly the displayed pages. The table splits reported cost and unknown reservations by UTC date, model and saved job outcome. It does not claim a separate provider-attempt outcome that the ledger does not store. Unknown cost prevents a numeric cost per accepted page. The global UTC monthly budget is separate from list filters. It includes unknown reservations and ledger entries whose family link was removed by deletion.

Each completed result offers **Just show results**. **Fix mistakes with Maya** stays disabled until both S9 and #337 are released. This slice contains no Maya call handler.

Scan analytics permit only the fixed event/status pairs in `src/lib/scan-events.ts`. They use the existing consent and tracking entry points. The installed SDK's `before_send` rejects every scan event and scan/Admin automatic page view. Approved explicit scan events use a small anonymous transport with no SDK batching, identity or retry queue. Its only event property is the fixed status. The ingestion protocol also requires the public project key, a shared constant anonymous ID and the no-person-profile flag. These fields hold no QR, image, account, child or family token. The request omits browser credentials and referrers. Revocation aborts pending requests. There is no application replay. An already transmitted request cannot be recalled.

Consent tickets invalidate old actions across withdrawal and a later grant. Account/context changes also invalidate upload and review callbacks. A pending old upload cannot issue a follow-up save under the replacement account. URL rules suppress scan/Admin automatic tracking and remove private route identifiers and all query values from nested, encoded, error, referrer and previous-page fields.

This implementation changes no family release setting. Root owns hosted schema and Storage checks, generated types, browser checks at phone/tablet/laptop sizes, independent review and screen approval. Local fake transport and SDK tests prove no hosted ingestion behavior, recognition accuracy, provider retention or physical camera behavior. No paid call is authorized or required for this slice's local tests.
