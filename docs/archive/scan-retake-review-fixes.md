# Scan retake review fixes — PR #1069

Date: 2026-11-15. Scope: the five independent review findings on `7e1fae9ce88d2bcdc707926437f0ed6b999e6685`.

## Fixes and regression coverage

1. The stack read supplies `photoCheckRequired`, using the same configured client factory as the blur-check starter without making a model request. A null check now means “not started” when eligible, rather than a finished verdict. Public stack and mounted-component tests cover null → pending → clear/blurry, and server-reader tests distinguish enabled and disabled checks without exposing claim details.
2. A placement-ready photo whose blur check has not finished waits 70 seconds, then offers Retry on the next poll. Retry posts preview for that saved photo after the existing 60-second stale lease; GET remains read-only for blur-check claims. A fake-clock test strands the worker, checks that waiting does not post repeatedly, and recovers the same photo with one explicit POST, without uploading again.
3. Automatic work polls every two seconds for a short window, then backs off to a 30-second cap when the listing does not change. Public helper and mounted-component tests cover the delay schedule, fewer than 140 reads over an unchanged simulated hour, offline/hidden suspension, and resets on uploads, progress, visibility and reconnection. The existing single-flight and failed-save retry tests remain in place.
4. Team-only marks refresh every 30 seconds until complete or unfinished, rather than stopping when `automaticPending` reaches zero. Tests replace the previous no-further-reads assertion, deliver a final team mark without reload or visibility events, and prove fully terminal marks stop phone polling.
5. A replacement being checked has the heading “Checking your new photo of page 23…” and a neutral checking section label. Only actual failures count in the failure heading. Tests cover the checking-only card and a checking replacement beside another refused page.

## Browser QA

Used the current higher-priority T3 browser tools against `npm run dev` on local port 3143. A temporary route mounted the real `ScanPages` component and intercepted its API requests with synthetic responses. The uploaded PNG was generated locally: a white page with simple printed lines, not a customer photo. The fixture and dev server were removed/stopped, and the browser tab was closed before the final gate.

- At 390 × 844, the unclaimed and pending states kept the neutral heading, spinner and page-23 checking tile. There was no failure heading or Undo before the verdict.
- A clear verdict removed the card and made page 23 Ready with Undo. Clicking Undo kept the page ready and unsent.
- A synthetic blurry result showed the blur explanation with Take again and Send anyway.
- No horizontal overflow at widths 390 and 1280. The checking and clear screenshots were visually inspected.

No paid model calls, real customer uploads, production admin pages or preview deployments were used. Camera capture, real QR recognition, authentication, storage and hosted-worker recovery were not exercised; the worker recovery path is covered with fake API responses and clocks.

## Validation

- Focused scan suites: 3 files, 160 tests passed.
- Upload-reset extension: the targeted backoff regression passed after extending its coverage.
- Full gate passed: `npm test -- --maxWorkers=2 && npx eslint src && npm run build` (exit 0). Vitest: 897 files passed, 3 skipped; 28,960 tests passed, 36 skipped, 1 todo. Test duration: 1,185 seconds. ESLint produced no output; the production build completed successfully.
- Local logs: `/tmp/scan-retake-full-test.log`, `/tmp/scan-retake-eslint.log`, `/tmp/scan-retake-build.log`. The prior build log was replaced only when this gate reached its build step.
- Before the gate: load 4.74, 45% memory free, no other Vitest/build job. Only two Vitest workers were used. During the run, load reached 9.50 with 28% memory free; workers continued advancing and no active work was stopped for load.
