# S1 evidence

Base: `8cca02da2367924df2b121d6ceb59bf6a0cc1dcf`. Feature branch: `site/scan-pages-photo`. No paid model ran.

## Falsifiers

An upload refusal that creates an object disproves admission safety. A direct browser download or usable single/batch signed URL disproves Storage isolation. A successful image route after terminal deletion/expiry disproves image lifecycle. A late Storage write that restores a terminal revision disproves the write fence. A family worker that completes while a scan object remains disproves family deletion.

## Evidence and limits

- `hosted-security.json`: owner/admin/anonymous Storage calls, owner/admin route positive controls, other-family/anonymous route denial, terminal deletion with delayed physical cleanup, late secret-key path refusal, concurrent admission/processing. Uses valid test sessions and actual hosted Storage.
- `hosted-boundaries.json`: concurrent ten-minute/day frequency and stored-byte reservations. Six requests at each boundary. Uses synthetic reservation accounting, not 2 GiB of physical files. Default concurrent uploads (2) binds before queued jobs (8). A separately configured queue boundary has not been tested concurrently.
- `hosted-refusals.json`: actual normalized upload requests for unknown QR, wrong family, unpublished book, duplicate page, forged child and repeated PUT. A later authenticated session reads the same saved revision.
- `hosted-signout.json`: an old cookie after local Auth sign-out fails while the object remains. Server delivery checks the live Auth session as well as JWT validity.
- `hosted-expiry.json`: expiry denies delivery with an existing object, then records terminal expiry and cleans up. No marks or crops exist in S1.
- `hosted-family-deletion.json`: actual dedicated retention_worker key, explicit deletion of a synthetic QA family, file removal before Auth, empty scan table/folder and family fence.
- `hosted-browser-size.json`: Aside exercised an 18,030,953-byte synthetic PNG through the actual browser JPEG conversion, QR confirmation and private image route. This proves the large-file transport path with a synthetic fixture, not physical camera support.
- The image tests prove EXIF removal, QR decoding, pixel and byte refusal. They pass through a generated QR image. They do not prove real camera readability or general handwriting recognition.
- Route tests use public HTTP handler exports and injected dependencies. With an AI key configured, upload and image delivery make zero AI-client calls. No model dispatch exists in this slice.
- Analytics tests prove PostHog, Vercel analytics and Speed Insights suppress the scan paths. The ad gate blocks scan pages too.
- Family deletion tests prove the worker traverses all three buckets before Auth. Hosted worker evidence is separate from these local tests.
- Done gate: `npm test` exit 0, 265 files and 12,350 tests; `npx eslint src` exit 0 with no warnings; `npm run build` exit 0.

## Applied schema

`scan_page_photos` 20261102202652, `scan_photo_cleanup_schedule` 20261102202939, `scan_photo_abandonment_margin` 20261102203615, and `scan_photo_active_session` 20261102204839. All applied with Supabase MCP to cdjobwsyzndtltzfpyqa. `list_migrations`, policy/configuration probes and regenerated public types confirm them. Browser roles have a restrictive ALL-operation bucket denial. Authenticated reads of scan metadata obey family/admin RLS. Mutation RPCs are service-only.

Expiry records terminal states every five minutes. Physical cleanup retries every 15 minutes through `/api/scan-cleanup` with the existing cron secret. Pending files become terminal at 23 hours 30 minutes to leave cleanup time before 24 hours. Failed storage cleanup retains byte accounting and retries. No camera original is stored. The normalized JPEG is the only permitted object path in S1.

## Remaining acceptance work

- Savar must approve the screens before merge. This evidence is an implementation self-review, not independent approval.
- Test actual camera files on physical iPhone Safari and Android Chrome. Check camera format support, QR readability and delivery on the deployed host. The browser converts camera files to a JPEG below 3.5 MB before upload. The server independently normalizes and validates it. Verify camera format support and host limits before launch.
- Verify the deployed cleanup endpoint and its scheduled physical removal. The live cron exists, but the new route is not deployed until this branch ships. Local cleanup and live direct Storage removal do not prove that deployed job.
- Verify a separately configured queued-job boundary concurrently. The default upload bound permits at most one waiting request.
- Crops and marking history belong to later slices. Their browser denial, expiry and correction evidence cannot be claimed from S1.

#454 remains open. No merge or production deployment was performed.
