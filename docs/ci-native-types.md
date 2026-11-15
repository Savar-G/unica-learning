# Native TypeScript checks

CI generates Next.js route types, then checks the app with the pinned TypeScript 7 native preview. The voice worker uses the same compiler with its own project configuration. The Next.js build still uses the installed TypeScript 5 compiler. The complete unit suite stays enabled.

## Evidence: 2026-11-15

Machine: Savar's MacBook Pro (4), macOS arm64. These are local measurements, not hosted CI latency.

At baseline `275e329e5`, with incremental output disabled, TypeScript 5.9.3 checked the app in 42.320 s. Native preview `7.0.0-dev.20260707.2` passed in 4.217 s. Bun 1.4.4 finished in 0.780 s but rejected `board-tab.test.ts:78`, which both TypeScript compilers accepted. This mismatch is the measured reason to use the requested native TypeScript fallback.

At the implementation base `fb98903a07daf316bebebde6052d669239f417d9`, deliberate invalid app value and React button prop types failed both compilers with the same two TS2322 diagnostics. An invalid value in the voice worker failed both compilers with the same TS2322 diagnostic. All temporary probes were removed. Clean app and worker checks passed. These probes establish detection of these errors, not complete compiler equivalence. No test, timeout, or severity changed.

Use `npm run typecheck` for the app and `npm run voice:typecheck` for the voice worker. The app command must generate route types first. The worker is outside the root TypeScript project and needs its own check.

The package version is exact because this is a preview compiler. Keep the existing compiler in the build until broader compatibility evidence supports replacing it.
