# Scan pages release

`SCAN_PAGES_ENABLED` is a server release switch. Leave it unset to keep scanning closed to ordinary families in every environment, including production. While it is off, only families marked in `public.test_accounts` and users listed in `public.admin_users` have access. The server reads those marks on each request. A browser cannot supply its own mark.

To open scanning to signed-in families, set `SCAN_PAGES_ENABLED` to `on` in the server environment for the deployment, then redeploy. Only the exact value `on` enables it. Remove the value and redeploy to close access again. This PR does not set the variable.

Parent home shows the link only when the server permits access. `/account/scan` and every scan API handler independently check the live signed-in session and release before they read a photo, parse an upload or change data. Blocked requests use the normal not-found response. The image route checks access again after the Storage read. The desk lock still applies to permitted users.

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
- **Checks** (test families and admins only, D-252): the browser asks for each saved photo's straightened page (S2b), one at a time. The calibration's refusals become the short reasons in the stack: Cut off, Not flat, Wrong page, Turned, Two pages, Code not clear, Cannot check. A book printed before checks shows "Cannot be checked". No new reason is made up: blur and darkness are not checked yet (S3).
- **The stack** (`src/lib/scan-stack.ts`): refused pages first with their reason and "Take the photo again" (one at a time); then the pages by day, in page order, with "No photo yet: page 2" for a page of the day with no photo; then the pages sent for marking. A retake deletes the old photo only once a new photo is chosen.
- **Send** (`POST /api/account/scans/send`, `send_scan_photos`, D-270) counts only ready pages: saved, active, and checked ready on the photo's own printing. It records `scan_photos.sent_at` once; refused and still-checking pages stay in the stack. Marking (S4) is not built: Send marks nothing and calls no AI. Like the checks, Send is for test families and admins only until marking ships.
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

## First-book two-ways review (#461)

Savar chose parent review for the first book on 6 November. The printed item has two work areas and one final-answer box. A parent checks both methods and the answer, then selects Right, Wrong or Blank. The page stays incomplete until that explicit choice. The crop includes both measured work areas and the answer box. The model receives no reading request for this item. The item keeps one canonical result and the existing parent-change history.

The frozen automatic-answer eligibility does not authorize mastery from this new parent review. The result stays out of mastery unless the frozen context already permits parent-checked mastery. The stored package and print contract stay unchanged. This does not implement automatic checking of alternative equation combinations. Missing or invalid measured regions cannot produce a review crop. Local tests prove the parent-review state, crop boundaries and completion, not a physical booklet or parent screen approval.

## Write-words answers (#541, S7n)

Savar chose AI reading with a code check on 6 November. The model transcribes the measured answer box as written. It must not correct spelling, translate, finish a word or solve the question. Code first validates the frozen package and its answer rule. It then compares the bounded text reading with that checked answer. Case and spacing do not change the words. No synonym, spelling correction or numeric conversion is used to make a right result. The original reading remains stored beside the value used by code.

A confirmed different answer is wrong. A genuinely empty box is blank. Missing, duplicate, crossed-out or uncertain readings stay pending for the existing parent check. A free-text key with no rule that code can check stays pending. The whole-page request contains the text-region kind and measured box, without its answer or template source. The item uses one review crop, one canonical result, one event key and the existing shared budget. Local fake-AI tests prove these decisions and page completion. They do not prove handwriting accuracy or the D-267 pass.
