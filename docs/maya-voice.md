# Maya voice calls (#326)

An admin speaks to Maya as a test child on an assessment question. The call runs in Maya's voice worker (`worker/maya-voice`), a LiveKit Agents for Node worker outside the Vercel build. The worker wraps Maya's controller through the text adapter: the speech-to-text turns the child's speech into child turns, Maya's session (`src/lib/maya`) answers, and the voice says only the words the session accepted. LiveKit never asks a model itself.

Everything runs with **fake providers** until the accounts below exist. The fake speech-to-text hears typed words from the call page, and the fake voice is silent. Nothing is paid and no account is needed.

## How a call runs

1. Admin, `/admin/maya`: choose **Speak**, then **Talk to Maya** on a test question. `POST /api/admin/maya/voice` makes the call's record (`maya_calls`, `mode = 'voice'`, not started) and mints its token.
2. The call page checks the microphone (a level bar), then **Connect** asks `POST /api/admin/maya/calls/<id>/token` for a fresh token and joins the room `maya-call-<call id>`.
3. The token admits one participant, `child-<child id>`, to that one room, for 5 minutes (`VOICE_TOKEN_TTL_SECONDS`). It allows the microphone and data, and no admin, create, list or record rights, and no metadata changes. Its attributes name the call, the parent and the child. It also asks LiveKit to dispatch the worker `maya-voice` with the call id (`src/lib/maya-voice-token.ts`).
4. The worker checks that the room is the call's own and that the joiner is the call's own child, with the token's family attributes (`checkJoiner`). It ignores anyone else. It then opens the call (`openVoice`) and records the speech-to-text and voice ids on it.
5. Maya opens the call when the child is there. Each finished child turn goes to the call's session. Preemptive generation is disabled. Only a completed child turn can change the call. Silence checks stop while the child is absent. Closing starts at 9 minutes. An independent deadline stops media at 10 minutes, including during speech or model work. A restored worker schedules these timers again.
6. After each saved turn the worker sends `{ revision }` on the `maya.call` data topic, and the page reads the call again (`GET /api/admin/maya/calls/<id>`) for the transcript and board.
7. **Hang up** (RPC `maya.hang_up`) ends the call as "Child stopped". A dropped connection ends it as a technical issue if the child is not back within 30 seconds. The session's own end (solved, safety) keeps the saved call live until the final speech handle completes. Then the worker saves the terminal outcome, sends the terminal update, and disconnects. The 10-minute media deadline takes priority. A fatal session closure saves a technical outcome. A lost write or failed save stops media and sends a technical failure to the client. A room disconnect alone leaves the browser recovery controls available until the server confirms an outcome.

### What is stored

| Where | What |
|---|---|
| `maya_calls` (existing columns) | The transcript and board (`trace`), the outcome, `speech_to_text` and `voice` (provider ids, never keys), `connected_seconds`, and the mishearing counts `mishearing_confirmations` (numbers Maya asked to confirm) and `mishearing_corrections` ("no, I said ..."). |
| `maya_call_connections` (new, migration `add_maya_call_connections`) | One row per `agent_joined`, `agent_left`, `child_joined` and `child_left`, with the server time. `agent_joined` renews a 15-second connection lease every 5 seconds. Each new worker first closes the previous segment with `agent_left`. Connected seconds count overlapping child presence and valid worker leases. A crash can add at most 15 seconds after the last renewal. Reconnect gaps and longer crash gaps are excluded. |

The app does not save audio. The worker starts its session with `record: false`. This setting does not establish the retention policy of LiveKit Cloud, AssemblyAI, or Inworld. Their effective settings and contracts must be verified before any claim that those systems do not store audio. The speech-to-text confidence marks a child turn as uncertain below 0.6, so Maya confirms the number. A cancelled call that Maya never joined writes no learning event. The saved JSON state keeps a cancellation marker until cleanup succeeds. Each recovery attempt reads that marker.

## Direct-provider privacy gate

These plugins connect directly to AssemblyAI and Inworld. LiveKit Inference retention terms do not cover this route. The research source is `.design/research/ta-voice-2026-10/voice-options.md`, section 8 (2026-10-29).

Before real audio:

1. In AssemblyAI, opt out of model improvement before the first request. Verify the effective opt-out for the worker's account and streaming endpoint. The research records that this opt-out is prospective. See [AssemblyAI data retention and model training](https://assemblyai.com/docs/data-retention-and-model-training).
2. Obtain and verify Inworld's retention arrangements for the direct TTS API. Confirm the plan or written agreement, retention exceptions, and training use. Do not infer these from LiveKit settings. See [Inworld zero data retention](https://docs.inworld.ai/portal/zero-data-retention).
3. Obtain written confirmation that the selected providers permit the downstream service for children aged 6-12. The research does not establish this permission. Check the [AssemblyAI terms](https://www.assemblyai.com/legal/terms-of-service) and [Inworld terms](https://inworld.ai/terms), parent consent, subprocessors, and the agreed processing locations. Keep real providers disabled while these terms remain unresolved.
4. Verify that LiveKit recording and audio observability are disabled. The worker's `record: false` only controls the session setting.
5. After these checks, set `MAYA_VOICE_PRIVACY_CONFIRMED=assemblyai-optout,inworld-retention,child-use-approved` in the worker. Each real provider requires its own marker. Either real provider also requires `child-use-approved`. The worker refuses a job without the required markers. This flag records an operator confirmation. It cannot verify an external account setting or contract.

Voice sessions have no name personalization. Their saved variety state has no child name. Inworld receives Maya's accepted speech text. This does not remove names that a child supplies in free speech; the privacy gate still applies.

## Accounts and settings Savar must create

Agents create no accounts. Create these, then set the values below.

| # | Account | Make | Value |
|---|---|---|---|
| 1 | **LiveKit Cloud** (livekit.io) | A project, for example `unica-maya` | The project URL `wss://<project>.livekit.cloud`, an API key and an API secret (Settings → Keys). In the project settings, turn off recording and audio in observability (#327 checks this). |
| 2 | **AssemblyAI** (assemblyai.com) | An API key | The key. Universal-3.6 Pro streaming is billed per hour of audio. |
| 3 | **Inworld** (inworld.ai) | An API key (Base64 "Basic" key from the Inworld Portal) and a voice | The key and the voice id. Savar picks the voice from 4 samples (#327). Until then any Inworld voice id works, for example `Ashley`. |
| 4 | **Supabase** key for the worker | Project `pagewise` → Settings → API keys → new secret key named `maya_voice_worker` | The `sb_secret_...` value. The worker reads and writes calls, connection events, learning events and the child profile with it. |
| - | OpenRouter | Already exists | `OPENROUTER_API_KEY` (Maya's model, `AI_MODEL`). |

### Where each value goes

| Variable | Vercel (web app) | Worker | Notes |
|---|---|---|---|
| `LIVEKIT_URL` | Yes | Yes | `wss://<project>.livekit.cloud`. In Vercel it turns on the **Speak** option. |
| `LIVEKIT_API_KEY` | Yes | Yes | Vercel mints tokens. The worker registers with LiveKit. |
| `LIVEKIT_API_SECRET` | Yes (Secret) | Yes | Never sent to a browser. |
| `MAYA_VOICE_PRIVACY_CONFIRMED` | No | Yes for real providers | `assemblyai-optout,inworld-retention,child-use-approved`, only after the checks above. |
| `MAYA_STT` | No | Yes | `assemblyai`, or `fake` (default). |
| `ASSEMBLYAI_API_KEY` | No | Yes | Needed when `MAYA_STT=assemblyai`. |
| `MAYA_STT_MODEL` | No | Optional | Default `universal-3-6-pro`. Other ids: `universal-streaming-english`, `universal-3-5-pro`. |
| `MAYA_TTS` | No | Yes | `inworld`, or `fake` (default). |
| `INWORLD_API_KEY` | No | Yes | Needed when `MAYA_TTS=inworld`. |
| `MAYA_VOICE` | No | Yes | The Inworld voice id. Needed when `MAYA_TTS=inworld`. |
| `MAYA_TTS_MODEL` | No | Optional | Default `inworld-tts-2`. `inworld-tts-2-flash` is the cheaper option. |
| `OPENROUTER_API_KEY`, `AI_MODEL` | Already set | Yes | Maya's model. Without the key the worker uses the fake rule player. |
| `MAYA_REVIEW_MODEL` | Already optional | Optional | The free-talk review model. |
| `SUPABASE_URL` | No | Yes | `https://cdjobwsyzndtltzfpyqa.supabase.co`. |
| `SUPABASE_SECRET_KEY` | Already set | Yes | The worker's own key `maya_voice_worker` (step 4), not the web app's. |
| `MAYA_VOICE_LOAD_LIMIT` | No | Optional | 0 to 1: the machine load above which the worker takes no new call. LiveKit's default otherwise. |

A real provider set without its privacy confirmation, key or voice stops the worker's job with a clear log line. It never falls back to the fake quietly (`voiceProviders`, `src/lib/maya-voice.ts`).

Deploying the worker to LiveKit Cloud, the privacy page text, the voice choice and the delay measurements are #327.

## Commands

| Command | What it does |
|---|---|
| `npm run voice:test` | The worker's tests: a whole call through LiveKit Agents with the fake speech-to-text and voice, with no room or network, and provider choice by configuration. |
| `npm run voice:typecheck` | Typechecks the worker (`worker/maya-voice/tsconfig.json`). |
| `npm run voice:build` | Builds `worker/maya-voice/dist/main.mjs` (esbuild; npm packages stay outside, `server-only` is empty under the `react-server` condition). |
| `npm run voice:dev` | Builds and runs the worker in development mode. |
| `npm run voice:start` | Runs the built worker in production mode. |

The site's `npm test`, `npx eslint src` and `npm run build` do not include the worker. The root `tsconfig.json` excludes `worker/`, and nothing in `src/app` imports it. The site's own tests cover the shared parts: `src/lib/maya-voice.test.ts`, `src/lib/maya-voice-token.test.ts` and `src/lib/maya-voice-call.test.ts`.

## Run a whole call on a laptop, no accounts

```sh
brew install livekit                     # the open-source LiveKit server, once
livekit-server --dev --bind 127.0.0.1    # keys devkey / secret

# the worker, with the fakes (and the fake model unless OPENROUTER_API_KEY is set)
SUPABASE_URL=https://cdjobwsyzndtltzfpyqa.supabase.co SUPABASE_SECRET_KEY=... \
LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
npm run voice:dev

# the site
LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret npm run dev
```

Open `/admin/maya` as an admin, choose **Speak**, and start a call on a test question. With the fake speech-to-text, the call page shows "Test speech: type what <child> says". Maya hears those words over LiveKit instead of the microphone. The microphone check still needs a real microphone.

## Not verified yet

- The AssemblyAI and Inworld plugins are written against their documented options (LiveKit Agents 1.9.5) and constructed in a test. No real audio has gone through them. Check one call on each after the keys exist.
- The model's first-word delay, cold start, Safari autoplay and iPad audio are #327.
- The board appears when a turn is saved, not in time with the words. Word timing (Inworld timestamps are requested) is #330.
