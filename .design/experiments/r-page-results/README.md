# Page results implementation evidence

Approved source: issue #1070, Cedric, November 15, 2026. The issue is authoritative; this is not a new mockup round.

## Reproduce safely

1. Run `node .design/experiments/r-page-results/make-photo.mjs` if the synthetic photo is absent (or fetch it through Git LFS).
2. Temporarily create `src/app/results-qa-1070/page.tsx` which exports the default from `../../../.design/experiments/r-page-results/qa-page`.
3. Run `npm run dev -- --port 3117 --webpack` and open `/results-qa-1070`. Do not use a real account or configure any server/provider secrets.
4. Use `?scenario=no-explanation`, `team`, `missing-contract`, `missing-photo`, `busy`, `retry`, `cap`, or `closed` for the other cases. Explanation fetches are intercepted in the fixture; unknown scan requests are refused. The hidden `output[data-qa-requests]` records the local explanation count.
5. Remove the temporary route before the done gate and commit. Only the fixture and screenshots belong in the project.

The worksheet and the child's handwriting are synthetic. No printed customer book was rendered or changed. The fixture's declared image coordinates match its synthetic answer boxes; production reads the stored print contract, regions and calibration instead.

## Browser observations

- Captured all five required states at 390 and 1280 px; reviewed all ten screenshots together.
- The results screen made zero explanation requests. Opening an eligible question made one request. No-explanation made zero.
- Native photo alt describes the photographed page. Markers are named buttons with 44 × 44 px targets. Navigation and mode buttons remain keyboard accessible, with at least 44 px height.
- Screen transitions focus the heading; question progress and revealed content are announced. The final step moves focus to the next-question control rather than losing focus with the removed action.
- Geist is explicitly inherited by headings; the site-wide serif heading rule does not leak in.
- At 390 px there is no horizontal overflow. The entire main action is visible after the full-page photo.
- The main action retains the explicitly approved orange/white combination; this color combination does not meet normal-text AA contrast. Amber small text is darkened within the approved tint for legibility, while outlines retain #D9770B.

## Limits

This verifies the production client with synthetic inputs, not a live customer's data or paid explanation quality. Without a trusted matching straightened photo, markers and zoom are unavailable; the original photo and question navigation remain. A different evidence photo is shown unannotated rather than borrowing coordinates from the overview photo. Unsafe or unknown answer keys remain absent. The server read adapter has separate ownership/revision/geometry tests.

## Final validation — November 15, 2026

- Focused public-interface tests: 5 files, 52 tests passed.
- Full gate: `npm test -- --maxWorkers=2` — 920 files passed, 3 skipped; 29,493 tests passed, 36 skipped, 1 todo (1,048.89 seconds). `npx eslint src` passed. `npm run build` passed, including TypeScript and all 154 static pages.
- The initial build stopped on a local dependency symlink outside Turbopack's filesystem root. An isolated APFS clone of the installed dependencies replaced that symlink; the unchanged `npm run build` then passed. No dependency or configuration change ships with this repair.
- Local logs: `/tmp/1070-focused-tests.log`, `/tmp/1070-full-tests.log`, `/tmp/1070-eslint.log`, `/tmp/1070-build.log`.
- Post-gate synthetic browser smoke: busy made one request and retried only on an explicit press; Next stayed available. Closed-plan showed the plan link without a retry action. Missing contract retained the original photo with zero markers and zero explanation requests on the overview.
- The temporary QA route is removed, both agent browser tabs are closed, and the local development servers are stopped. Retake-owned files are unchanged. No production deployment, paid explanation request or real-family mutation occurred.
