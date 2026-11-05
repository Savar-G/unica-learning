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

#454 stays open. Physical iPhone Safari and Android Chrome camera checks and deployed cleanup checks remain.

## The stack (round r565, D-269 to D-276, step 1 of D-276)

`/account/scan` is the stack from the picked round (`.design/experiments/r565/picked.html`), on the phone's own file input. The live camera comes after the real-phone test (D-276).

- **Start screen.** The three tips, "Choose photos" (several photos at once) and "Start scanning" (the phone's own camera through the file input's `capture`). The photo notice opens once, before the first photo, and "Got it" opens the camera or the photos in the same tap.
- **Each photo saves when it arrives** (D-269): upload, then save, with no confirm per page. The browser sends one photo at a time, because the server takes 2 uploads at once and processes 1. A photo the server refuses at upload (no page code, a page of another workbook, a page that already has a photo, an unreadable or too large photo, too many photos) stays on this device in the stack with its reason; it is not saved.
- **Checks** (test families and admins only, D-252): the browser asks for each saved photo's straightened page (S2b), one at a time. The calibration's refusals become the short reasons in the stack: Cut off, Not flat, Wrong page, Turned, Two pages, Code not clear, Cannot check. A book printed before checks shows "Cannot be checked". No new reason is made up: blur and darkness are not checked yet (S3).
- **The stack** (`src/lib/scan-stack.ts`): refused pages first with their reason and "Take the photo again" (one at a time); then the pages by day, in page order, with "No photo yet: page 2" for a page of the day with no photo; then the pages sent for marking. A retake deletes the old photo only once a new photo is chosen.
- **Send** (`POST /api/account/scans/send`, `send_scan_photos`, D-270) counts only ready pages: saved, active, and checked ready on the photo's own printing. It records `scan_photos.sent_at` once; refused and still-checking pages stay in the stack. Marking (S4) is not built: Send marks nothing and calls no AI. Like the checks, Send is for test families and admins only until marking ships.
- **Limit** (D-271, migration `20261105_scan_stack.sql`): 40 photos per 10 minutes and 60 a day. Refused and retaken photos count. `admit_scan_photo` reads `scan_limits` under the family lock. Probe: `supabase/tests/scan_stack.sql` (a pass is the error `PROBE_OK`).
- **Desktop** (D-273): the QR code, "Email me the link" and "Take the pictures on this device" beside the pages from the phone, which refresh every 5 seconds, with Send. Retakes stay on the phone.
- **A page's QR code.** Read by the phone's own camera, it still opens the desk for the child whose desk is open on that device. Otherwise, a parent who was on Scan pages in the last 30 minutes (the cookie `unica_scanning`, a note and not a credential) goes to Scan pages for that page (`/account/scan?w=<workbook>&p=<page>`); everyone else gets the desk question with "Scan this page". Both need the scan release.
