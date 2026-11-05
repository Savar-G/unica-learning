# Scan pages release

`SCAN_PAGES_ENABLED` is a server release switch. Leave it unset to keep scanning closed to ordinary families in every environment, including production. While it is off, only families marked in `public.test_accounts` and users listed in `public.admin_users` have access. The server reads those marks on each request. A browser cannot supply its own mark.

To open scanning to signed-in families, set `SCAN_PAGES_ENABLED` to `on` in the server environment for the deployment, then redeploy. Only the exact value `on` enables it. Remove the value and redeploy to close access again. This PR does not set the variable.

Parent home shows the link only when the server permits access. `/account/scan` and every scan API handler independently check the live signed-in session and release before they read a photo, parse an upload or change data. Blocked requests use the normal not-found response. The image route checks access again after the Storage read. The desk lock still applies to permitted users.

## The Scan pages tab (#564)

In the parent dashboard the Scan pages tab opens `/account/scan`. The tab shows only for a child whose first workbook was delivered, and only when this same release check passes, so it stays hidden from ordinary families. A phone or tablet gets the camera flow. Any other device gets "Please take a picture with your phone", with a QR code of the page's address (`/account/scan`, nothing else) and "Email me the link". The server reads the device from the user agent. iPadOS Safari asks for the desktop site by default and reports a Mac, so the server cannot tell it from a laptop: that screen also offers "Take the pictures on this device" (`/account/scan?here=1`), which opens the camera flow on any device. A signed-out visitor is sent to sign in and back to the page, so the QR code works on a phone that is not signed in yet; after sign-in, the release check decides as before.

"Email me the link" (`/api/account/scan-link`, `src/lib/scan-link.ts`) passes the same session and release check as the scan routes, then emails the page's address to the parent's own email through the delivery module. The link holds no token: it signs no one in. At most 3 emails an hour go to one parent, counted under a lock in `public.scan_link_emails` (`claim_scan_link_email`).

The switch does not stop the authenticated cleanup cron, expiry, family deletion or physical removal. These must continue while scanning is closed. Storage remains private. The switch does not enable AI marking.

#454 stays open. Physical iPhone Safari and Android Chrome camera checks and deployed cleanup checks remain.
