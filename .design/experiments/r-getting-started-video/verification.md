# Verification: getting-started video (#1075)

## Completed without customer sends

- Started from current `origin/main` at `fb98903a07daf316bebebde6052d669239f417d9` in the prepared worktree, branch `site/getting-started-video`. No other checkout was created.
- Created #1075 and assigned it to `cedrictanafranca`.
- Read the workload decision, repository instructions, DESIGN.md and local Next.js page/metadata/header documentation. No `/implement` or repository `/design` command skill was available; used the existing-system design-direct round convention.
- Live storage inventory returned only three private buckets: `shown-work` (PNG/JSON), `workbook-pages` (PNG/PDF), `scan-photos` (JPEG). No suitable existing public video bucket. No schema, bucket, policy, provider, payment or email-send changes.
- Approved movie and shipped movie SHA-256 both `2233b9cf6247f1ee6752bbcaf497fee65a1bb617d1c95b5fb506a1a3e6a6d1d5`. Exactly 17,114,973 bytes, H.264/AAC, 1920 × 1080, 167.866667 seconds. Maya content is unchanged.
- A lightweight comparison against main's original email renderer verified 216 grade/window/free/reminder/marking/explanation combinations byte-for-byte after removing only the new CTA paragraph. The regression digest is pinned in `getting-started-video.test.ts`.
- Validation waited for the other ticket's gate to finish, then used at most two Vitest workers and one heavy job at a time. Focused tests passed: 7 files, 141 tests. Full `npm test -- --maxWorkers=2` passed: 901 files passed, 3 skipped; 29,107 tests passed, 36 skipped, 1 todo, in 1280.54 seconds. Full `npx eslint src` passed.
- `npm run build` passed, including TypeScript and all 154 static pages; `/getting-started` is prerendered. The first build attempt found an accidental local `node_modules/node_modules` link pointing outside the worktree. Removing only that local setup link and rerunning the unchanged build succeeded (5.8-second compilation, 30.8-second type check). No dependency, application or test changes were needed for this repair. Logs: `/tmp/getting-started-focused.log`, `/tmp/getting-started-tests.log`, `/tmp/getting-started-lint.log`, `/tmp/getting-started-build.log` (initial environment failure), `/tmp/getting-started-build-retry.log` (pass).

## Browser QA

Used the current higher-priority T3 preview browser, not Playwright/Puppeteer; Aside was not needed because the shared browser was available. Checked `npm run dev -- --port 3105` locally, without a Vercel preview deployment.

- `/getting-started` returns 200 signed out; title is `Getting started | Unica Learning`, robots `noindex, nofollow`.
- 375 × 812: document width 375, player 343 × 192.9375 at x=16, no horizontal overflow; account and direct-video fallback remain visible. Also inspected 768 × 1024 and 1440 × 1050 screenshots. These are browser viewport checks, not physical iOS/Safari certification.
- Initially paused at time 0 with autoplay false, controls true, playsInline true, metadata loaded and no media error. Native play advances time; Space pauses; keyboard controls remain reachable. The full 0–167.866667-second range is seekable.
- The English caption track loads successfully as `text/vtt; charset=UTF-8`; browser parses 80 cues. First cue 0.630–1.600, last 162.408–165.098 seconds. Track is not default-on because the approved video already burns in its captions.
- The account button opens `/account`, then the existing signed-out redirect goes to `/sign-in`. No account, billing or delivery action was submitted.
- Closed the QA browser tab afterwards. No production admin tab was opened.
- Reopened the dev page after the successful build for the final 375-pixel browser check: no overflow, metadata loaded, duration 167.866667, paused at zero, controls and inline playback on, autoplay off, no media error, noindex and the account link intact. Closed this tab and stopped only this task's local QA servers afterwards.

## Hosting/cache/range evidence

The release will serve the page at `https://unicalearning.com/getting-started`, the movie at `https://unicalearning.com/video/getting-started-2233b9cf6247.mp4`, the poster at `/video/getting-started-v5.jpg` and the captions at `/video/getting-started-v5.en.vtt`, via the existing public asset/Vercel hosting path. The production route is not deployed until the approved merge.

Local HTTP probes against dev port 3105 and the built production server (`npm run start -- --port 3106`) returned the same headers and identical byte slices:

```text
Range: bytes=0-1023
HTTP/1.1 206 Partial Content
Cache-Control: public, max-age=31536000, immutable
X-Robots-Tag: noindex
Accept-Ranges: bytes
Content-Type: video/mp4
Content-Range: bytes 0-1023/17114973
Content-Length: 1024

Range: bytes=16931391-16932414
HTTP/1.1 206 Partial Content
Cache-Control: public, max-age=31536000, immutable
X-Robots-Tag: noindex
Accept-Ranges: bytes
Content-Type: video/mp4
Content-Range: bytes 16931391-16932414/17114973
Content-Length: 1024
```

The unchanged approved MP4 has its `moov` metadata at byte 16,931,391, after `mdat`, so tail-range support matters. Both the browser and explicit tail probe succeeded. No remux, fast-start rewrite or re-encode was performed.

The built production page returned 200, `noindex, nofollow` and canonical `https://unicalearning.com/getting-started`. Its VTT returned 200 with `Content-Type: text/vtt; charset=UTF-8`. Header logs: `/tmp/getting-started-production-range-head.txt` and `/tmp/getting-started-production-range-tail.txt`.

## Release boundary

Independent review and the approved main merge remain with the parent/release owner. After the ordinary production deployment, repeat the page, caption MIME, immutable-cache and head/tail-range probes against unicalearning.com. No standalone Vercel preview, bulk resend or real-customer test email is authorized or performed.

## Exact changed files

```text
.design/experiments/r-getting-started-video/brief.md
.design/experiments/r-getting-started-video/desktop-1440.png
.design/experiments/r-getting-started-video/manifest.json
.design/experiments/r-getting-started-video/phone-375.png
.design/experiments/r-getting-started-video/tablet-768.png
.design/experiments/r-getting-started-video/verification.md
.env.example
docs/workbook-delivery-emails.md
next.config.ts
public/video/getting-started-2233b9cf6247.mp4
public/video/getting-started-v5.en.vtt
public/video/getting-started-v5.jpg
src/app/(product)/getting-started/page.tsx
src/lib/getting-started-video.test.ts
src/lib/getting-started-video.ts
src/lib/getting-started.ts
src/lib/workbook-email.test.ts
src/lib/workbook-email.ts
```
