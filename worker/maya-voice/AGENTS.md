# Maya voice worker (`worker/maya-voice`)

LiveKit Agents for Node worker (`agentName: maya-voice`). Deployed separately to LiveKit Cloud—excluded from the root `tsconfig.json` and Vercel builds.

## Commands (run from repo root)

- `npm run voice:test` — Vitest suite (`worker/maya-voice/vitest.config.mts`)
- `npm run voice:typecheck` — native TypeScript check (`worker/maya-voice/tsconfig.json`)
- `npm run voice:build` — esbuild bundle into `worker/maya-voice/dist/main.mjs`
- `npm run voice:dev` — build + local dev runner (requires `livekit-server --dev`)
- `npm run voice:stage -- --out <dir>` — stage committed `src/lib` + `worker/maya-voice` for `lk agent deploy`

## Rules

- **Never run `npm install` inside `worker/maya-voice/`** and never commit `worker/*/node_modules`. After updating a shared package version in the root `package.json`, update `worker/maya-voice/package.json` and run `npm run voice:lock`. `worker/maya-voice/src/packaging.test.ts` enforces exact parity with the root lockfile.
- **Never import `@sentry/nextjs`** in this worker or any `src/lib/*` module it reaches—use `@sentry/node` only.
- **Product keys:** Requires `MAYA_OPENROUTER_API_KEY` (and optionally `PROFILE_OPENROUTER_API_KEY` as a distinct key). Shared `OPENROUTER_API_KEY` is disabled.
- **Deployment & privacy:** Stage only committed refs (`npm run voice:stage`), verify `lk agent status` and startup logs after deploy, and keep LiveKit agent observability/audio recording off. See `docs/maya-voice.md` and `docs/maya-voice-deploy.md`.
