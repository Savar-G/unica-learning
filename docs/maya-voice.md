# Maya voice calls (#326)

An admin speaks to Maya as a test child on an assessment question. The call runs in Maya's voice worker (`worker/maya-voice`), a LiveKit Agents for Node worker outside the Vercel build. The worker wraps Maya's controller through the text adapter: the speech-to-text turns the child's speech into child turns, Maya's session (`src/lib/maya`) answers, and the voice says only the words the session accepted, plus a code-written acknowledgement when a turn is slow (below). LiveKit never asks a model itself.

Everything runs with **fake providers** until the accounts below exist. The fake speech-to-text hears typed words from the call page, and the fake voice is silent. Nothing is paid and no account is needed. The real route is LiveKit Inference (D-238): speech-to-text and the voice through the LiveKit project's own key. The direct AssemblyAI and Inworld plugins stay as options (D-163). Packaging and deploying the worker, and the listening test that picks the voice: [Deploying Maya's voice worker](maya-voice-deploy.md).

## How a call runs

1. Admin, `/admin/maya`: choose **Speak**, then **Talk to Maya** on a test question. `POST /api/admin/maya/voice` makes the call's record (`maya_calls`, `mode = 'voice'`, not started) and mints its token.
2. The call page checks the microphone (a level bar), then **Connect** asks `POST /api/admin/maya/calls/<id>/token` for a fresh token and joins the room `maya-call-<call id>`.
3. The token admits one participant, `child-<child id>`, to that one room, for 5 minutes (`VOICE_TOKEN_TTL_SECONDS`). It allows the microphone and data, and no admin, create, list or record rights, and no metadata changes. Its attributes name the call, the parent and the child. It also asks LiveKit to dispatch the worker `maya-voice` with the call id (`src/lib/maya-voice-token.ts`).
4. The worker checks that the room is the call's own and that the joiner is the call's own child, with the token's family attributes (`checkJoiner`). It ignores anyone else. It then opens the call (`openVoice`) and records the speech-to-text and voice ids on it.
5. Maya opens the call when the child is there. Each finished child turn goes to the call's session. Preemptive generation is disabled. Only a completed child turn can change the call. Silence checks stop while the child is absent. Closing starts at 9 minutes. An independent deadline stops media at 10 minutes, including during speech or model work. A restored worker schedules these timers again.
6. After each saved turn the worker sends `{ revision }` on the `maya.call` data topic, and the page reads the call again (`GET /api/admin/maya/calls/<id>`) for the transcript and board.
7. **Hang up** (RPC `maya.hang_up`) ends the call as "Child stopped". A dropped connection ends it as a technical issue if the child is not back within 30 seconds. The session's own end (solved, safety) keeps the saved call live until the final speech handle completes. Then the worker saves the terminal outcome, sends the terminal update, and disconnects. The 10-minute media deadline takes priority. A fatal session closure saves a technical outcome. A lost write or failed save stops media and sends a technical failure to the client. A room disconnect alone leaves the browser recovery controls available until the server confirms an outcome.

The saved live state keeps the accepted final words until playback completes. A replacement worker replays that saved response once, waits for playback, then completes the call. Recovery uses the saved accepted output. The independent deadline stays active during replay.

### What is stored

| Where | What |
|---|---|
| `maya_calls` (existing columns) | The transcript and board (`trace`), the outcome, `speech_to_text` and `voice` (provider ids, never keys), `connected_seconds`, and the mishearing counts `mishearing_confirmations` (numbers Maya asked to confirm) and `mishearing_corrections` ("no, I said ..."). |
| `maya_calls.live` | While live: the session and, under `acknowledged`, the acknowledgement phrases saved before they are said (ids only). Dropped when the call ends. |
| `maya_call_connections` (new, migration `add_maya_call_connections`) | One row per `agent_joined`, `agent_left`, `child_joined` and `child_left`, with the database receipt time. `append_maya_call_connection` checks the expected revision, raises it and inserts the event in one transaction. It serializes with replacement claims. Receipt times stay in order across worker clocks. `agent_joined` renews a 15-second connection lease every 5 seconds. Each new worker first closes the previous segment with `agent_left`. Connected seconds count overlapping child presence and valid worker leases. A crash can add at most 15 seconds after the last renewal. Reconnect gaps and longer crash gaps are excluded. |

The app does not save audio. The worker starts its session with `record: false`. This setting does not establish the retention policy of LiveKit Cloud, LiveKit Inference, AssemblyAI, or Inworld. Their effective settings and contracts must be verified before any claim that those systems do not store audio. The speech-to-text confidence marks a child turn as uncertain below 0.6, so Maya confirms the number. A cancelled call that Maya never joined writes no learning event. The saved JSON state keeps a cancellation marker until cleanup succeeds. Each recovery attempt reads that marker.

## Privacy gate

Each real route needs its own marker in `MAYA_VOICE_PRIVACY_CONFIRMED`, and every real route also needs `child-use-approved` (`requiredMarkers`, `src/lib/maya-voice.ts`). The worker refuses a job without them, and refuses an unknown marker, so a typo never passes. A marker records an operator's confirmation. It cannot verify an external account setting or contract.

| Route | Setting | Markers |
|---|---|---|
| LiveKit Inference (preferred, D-238) | `MAYA_STT=inference` or `MAYA_TTS=inference` | `livekit-inference-zdr`, `child-use-approved` |
| AssemblyAI direct | `MAYA_STT=assemblyai` | `assemblyai-optout`, `child-use-approved` |
| Inworld direct | `MAYA_TTS=inworld` | `inworld-retention`, `child-use-approved` |

A mixed setting (for example Inference speech-to-text with the direct Inworld voice) needs the markers of both routes.

### LiveKit Inference

LiveKit's page says: "LiveKit Inference is zero data retention (ZDR) by default", and "Neither LiveKit nor the underlying model providers log, store, or train on your data", for every speech-to-text and voice model, on every plan. It also says ZDR is separate from agent observability, which can keep session data in LiveKit Cloud, and from custom voices, which store a voice sample ([LiveKit Inference](https://docs.livekit.io/agents/models/inference/), read 2026-11-04). The page says nothing about children. Before `livekit-inference-zdr`:

1. Turn off agent observability (session recording and audio) in the LiveKit project, and check it stays off. The worker's `record: false` only controls the session setting.
2. Use no custom voice: `MAYA_VOICE` is one of the provider's own voices.
3. Keep the models on the allow list (`INFERENCE_STT_MODELS`, `INFERENCE_TTS_MODELS`). Each is listed on the Inference page. The worker refuses any other.

Before `child-use-approved`: get a written answer from LiveKit (and, through it, the providers of the chosen models) that a service for children aged 6 to 12 may use them, with parent consent, under the agreed processing locations. ZDR is not that answer. Keep real providers off until it arrives. This marker is still open.

### AssemblyAI and Inworld direct

These plugins connect directly to AssemblyAI and Inworld. LiveKit Inference retention terms do not cover this route. The research source is `.design/research/ta-voice-2026-10/voice-options.md`, section 8 (2026-10-29).

1. In AssemblyAI, opt out of model improvement before the first request. Verify the effective opt-out for the worker's account and streaming endpoint. The research records that this opt-out is prospective. See [AssemblyAI data retention and model training](https://assemblyai.com/docs/data-retention-and-model-training). Then `assemblyai-optout`.
2. Obtain and verify Inworld's retention arrangements for the direct TTS API. Confirm the plan or written agreement, retention exceptions, and training use. Do not infer these from LiveKit settings. See [Inworld zero data retention](https://docs.inworld.ai/portal/zero-data-retention). Then `inworld-retention`.
3. Obtain written confirmation that the selected providers permit the downstream service for children aged 6-12. Check the [AssemblyAI terms](https://www.assemblyai.com/legal/terms-of-service) and [Inworld terms](https://inworld.ai/terms), parent consent, subprocessors, and the agreed processing locations. Then `child-use-approved`.
4. Verify that LiveKit recording and audio observability are disabled.

ElevenLabs (a listening-test candidate) is not on LiveKit Inference, and the worker has no ElevenLabs route. If it wins the listening test, its direct route needs its own settings, marker and checks first.

Voice sessions have no name personalization. Their saved variety state has no child name. The voice provider (through LiveKit Inference or directly) receives Maya's accepted speech text. This does not remove names that a child supplies in free speech; the privacy gate still applies.

## Accounts and settings Savar must create

Agents create no accounts. Create these, then set the values below.

| # | Account | Make | Value |
|---|---|---|---|
| 1 | **LiveKit Cloud** (livekit.io) | A project, for example `unica-maya` | The project URL `wss://<project>.livekit.cloud`, an API key and an API secret (Settings → Keys). In the project settings, turn off recording and audio in observability. With LiveKit Inference this is the only voice account. |
| 2 | **AssemblyAI** (assemblyai.com) | Only for the direct route: an API key | The key. Universal-3.6 Pro streaming is billed per hour of audio. |
| 3 | **Inworld** (inworld.ai) | Only for the direct route: an API key (Base64 "Basic" key from the Inworld Portal) | The key. |
| - | **ElevenLabs** (elevenlabs.io) | Only for the listening test: an API key | `ELEVEN_API_KEY`. The worker does not use it. |
| 4 | **Supabase** key for the worker | Project `pagewise` → Settings → API keys → new secret key named `maya_voice_worker` | The `sb_secret_...` value. The worker reads and writes calls, connection events, learning events and the child profile with it. |
| - | OpenRouter | Already exists | `OPENROUTER_API_KEY` (Maya's model, `AI_MODEL`). |

### Where each value goes

| Variable | Vercel (web app) | Worker | Notes |
|---|---|---|---|
| `LIVEKIT_URL` | Yes | Yes | `wss://<project>.livekit.cloud`. In Vercel it turns on the **Speak** option. |
| `LIVEKIT_API_KEY` | Yes | Yes | Vercel mints tokens. The worker registers with LiveKit. |
| `LIVEKIT_API_SECRET` | Yes (Secret) | Yes | Never sent to a browser. |
| `MAYA_VOICE_PRIVACY_CONFIRMED` | No | Yes for real providers | The route's markers (privacy gate above), for example `livekit-inference-zdr,child-use-approved`, only after the checks. |
| `MAYA_STT` | No | Yes | `inference` (LiveKit Inference), `assemblyai` (direct), or `fake` (default). |
| `ASSEMBLYAI_API_KEY` | No | Yes | Needed when `MAYA_STT=assemblyai`. |
| `MAYA_STT_MODEL` | No | Optional | With `inference`: one of `assemblyai/universal-3-6-pro` (default), `assemblyai/universal-3-5-pro`, `assemblyai/universal-streaming`, `deepgram/flux-general-en`. With `assemblyai`: default `universal-3-6-pro`; other ids `universal-streaming-english`, `universal-3-5-pro`. |
| `MAYA_TTS` | No | Yes | `inference` (LiveKit Inference), `inworld` (direct), or `fake` (default). |
| `INWORLD_API_KEY` | No | Yes | Needed when `MAYA_TTS=inworld`. |
| `MAYA_VOICE` | No | Yes | The voice id (for example Inworld `Ashley`, or a Cartesia voice id). Needed when `MAYA_TTS` is `inference` or `inworld`. The listening test picks it. |
| `MAYA_TTS_MODEL` | No | Optional | With `inference`: `inworld/inworld-tts-2` (default) or `cartesia/sonic-3.6`. With `inworld`: default `inworld-tts-2`; `inworld-tts-2-flash` is the cheaper option. |
| `OPENROUTER_API_KEY`, `AI_MODEL` | Already set | Yes | Maya's model. Without the key the worker uses the fake rule player. |
| `MAYA_REVIEW_MODEL` | Already optional | Optional | The free-talk review model. |
| `MAYA_USD_TO_CAD`, `MAYA_MONTHLY_ALERT_CAD`, `MAYA_STT_USD_PER_MINUTE`, `MAYA_VOICE_USD_PER_1K_CHARS` | Optional | Optional | Maya's spending cap (`docs/maya-spend.md`). Use the same values as the web app. |
| `SUPABASE_URL` | No | Yes | `https://cdjobwsyzndtltzfpyqa.supabase.co`. |
| `SUPABASE_SECRET_KEY` | Already set | Yes | The worker's own key `maya_voice_worker` (step 4), not the web app's. |
| `MAYA_ACK_LIMIT_MS` | No | Optional | The child's end of speech to the acknowledgement, in ms. Default 1500. `0` turns it off. |
| `MAYA_VOICE_LOAD_LIMIT` | No | Optional | 0 to 1: the machine load above which the worker takes no new call. LiveKit's default otherwise. |

A real provider set without its privacy confirmation, key or voice, or with an Inference model off the allow list, stops the worker's job with a clear log line. It never falls back to the fake quietly (`voiceProviders`, `src/lib/maya-voice.ts`). With `inference`, the worker uses `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, which LiveKit Cloud injects.

**Word timings through Inference.** The board draws in time with Maya's words when the voice returns word timings. With `inference`, the worker asks for them with each model's option (Inworld `timestamp_type: "WORD"`, Cartesia `add_timestamps: true`), the options LiveKit Agents for Node 1.9.5 checks before it reads the gateway's word alignment into timed transcripts (`hasAlignedTranscript`, `inference/tts.js`). The Inference page does not mention word timings, so whether the gateway sends them to the Node worker is not verified. Where they do not come, the board follows sentence ends (below). The listening test reports it per voice, and each `board cue` log line says `word` or `sentence`.

Deploying the worker: [Deploying Maya's voice worker](maya-voice-deploy.md). The delay measurements are #327. The privacy page and terms hold only a marked paragraph for voice, with no company named (#529); replace it, and raise `MAYA_NOTICE_VERSION`, before the first family call. `mintVoiceToken` refuses a family call without the parent's agreement; an admin test call is exempt (D-251).

## Commands

| Command | What it does |
|---|---|
| `npm run voice:test` | The worker's tests: a whole call through LiveKit Agents with the fake speech-to-text and voice, with no room or network, provider choice by configuration (Inference included), the listening-test kit and the image's packages. |
| `npm run voice:typecheck` | Typechecks the worker (`worker/maya-voice/tsconfig.json`). |
| `npm run voice:build` | Builds `worker/maya-voice/dist/main.mjs` (esbuild; npm packages stay outside, `server-only` is empty under the `react-server` condition). |
| `npm run voice:dev` | Builds and runs the worker in development mode. |
| `npm run voice:start` | Runs the built worker in production mode. |
| `npm run voice:stage` | Stages the folder LiveKit Cloud builds the worker image from ([deploy](maya-voice-deploy.md)). |
| `npm run voice:listen` | The listening-test kit: `make`, `record`, `score` ([listening test](maya-voice-deploy.md#listening-test)). `make --fake` needs no key. |
| `npm run voice:lock` | Writes `worker/maya-voice/package-lock.json` from the root lockfile, so the image installs the tree the tests ran with ([deploy](maya-voice-deploy.md)). |

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

## Silence: each turn's time and the acknowledgement (#532)

A child's turn runs behind the speech. `llmNode` returns its stream at once, so the session is not silent just because the model is working.

**The acknowledgement.** When the turn is not ready 1500 ms after the child's end of speech (`ACK_LIMIT_MS`, `MAYA_ACK_LIMIT_MS`), the worker says one phrase from `ACK_PHRASES` (`src/lib/maya-voice-ack.ts`), for example "Hmm, let me think."

- D-195 holds by construction. The phrases are code-written. No model writes or picks one, and the controller never sees one. `acknowledgementProblem` is the gate check, run in `npm test`: each phrase passes `workProblem`, has one of a few fixed shapes, and holds no verdict word. The issue's example, "Mm-hm, let me look.", fails it: "look" is a work word, and "Mm-hm" sounds like "yes" after "Is it 56?". "I'm thinking." also fails it, because it claims a state of mind for an AI.
- No repeat in a call, across a worker replacement too. A phrase is saved in `live.acknowledged` before it is said (`VoiceCall.acknowledge`). That save writes only this list onto the last saved `live`, at the next revision, with the same revision check as every other save. It holds no turn in progress, so a replacement worker still restores the last finished turn. A worker that was replaced has its save refused and says nothing (`ackSkipped: save`). The cost is one more database write on a slow turn. A phrase saved and then cut by the child stays used. When the bank is used, Maya stays silent until the answer (`ackSkipped: bank_used`). With a slow model on every turn, a call reaches that after 8 phrases. Decide the limit and the bank's size from real measurements.
- It stages no board. Its segment has an empty board plan (`stage(id, [])`), which gives its audio an owner through the normal cue output, so a child's speech stops it like any other speech. The answer's board is staged only after the phrase has played, because a new plan takes the audio from the old one. The answer's voice therefore starts after the phrase, and the wait shows as `ackHoldMs`. A turn that no longer owns the reply (a newer turn replaced it, or its speech was interrupted) stages nothing and writes no words, however late its work ends. It still sends its revision and keeps the check-ins and the call's end.
- It does not start when the child is talking or absent, after a hang-up, or when the call has a safety flag, a content problem or the deadline close. All of this is read again after the board stage and after the save, just before the phrase is queued. The phrases say nothing about what the child said, because a disclosure that the model has not read yet can still get one.
- Safety comes first. Safety guidance, a child's disclosure the model has read, or words past the closing time (`VoiceTurn.priority`, including a close that ends as "solved") stop the reply at once, including a phrase that is playing, and queue the words with `session.say`. They wait for nothing before them: not the phrase, not a late board answer. A turn with no board batches does not wait for its own board answer either.
- An ordinary answer waits for the phrase to finish, because cutting a phrase of a few words sounds worse than a short wait. If the phrase's audio never reports an end, its speech is stopped 3000 ms after it was queued (`ACK_HOLD_LIMIT_MS`, 5000 ms before the review of PR #577), and the answer is queued as speech of its own, because a word added to that reply would wait for the same end (#589). The longest phrase is about 1.5 s at a calm pace.
- It is not in the call's transcript or trace, which hold only what the session accepted. The `voice turn` log holds the phrase id. Practice runs do not run it: they use the text adapter.

**The measure.** The worker logs one `voice turn` line per child turn, and a `voice turn report` line when the call closes (counts, then p50 and p95). Logs hold times and phrase ids, never words. `fakeProviders` says which side was fake.

| Field | Meaning |
|---|---|
| `firstSoundMs` | End of speech to Maya's first sound: the phrase or the answer. |
| `answerMs` | End of speech to the answer's first sound. |
| `heardMs` | End of speech to the turn reaching the worker: speech-to-text and turn detection. |
| `modelMs`, `repairMs`, `reviewMs` | The model, its repair and the free-talk reviews, from the call's own trace. |
| `codeMs` | The rest of the controller's turn: code and the save. |
| `ackHoldMs` | The ready answer waiting for the phrase to finish. |
| `boardMs` | The saves behind the turn and staging the board. |
| `voiceMs` | Words given to the voice, to the first sound. |

The parts add up to `answerMs`. `outcome` is `answered`, `no_words` (the session said nothing) or `interrupted`; only `answered` has parts.

**What the fakes prove, and what they do not.** `worker/maya-voice/src/silence.test.ts` runs a whole call through LiveKit's pipeline with the fake speech-to-text and voice on a frozen clock. It proves the order: a fast turn has no phrase, a slow turn has the phrase at the limit and then the answer, a child who talks cancels it, the phrase sends no board batch, no phrase comes twice, and the parts match exact known delays. The R577 tests delay the board and the save to prove that a late answer cannot replace a newer board, that danger known during a delay stops the phrase, and that a replacement worker reads a phrase already heard. They also measure, on the clock the hold runs on, the time from a finished safety or deadline turn to its words being queued. It proves nothing about real times, because no real model, speech-to-text or voice ran. These stay open until the accounts exist:

- Whether 1500 ms is the right limit, and how often a real turn passes it.
- Whether LiveKit's `stoppedSpeakingAt` from AssemblyAI is the child's true end of speech. If it comes late, `heardMs` and every total are too small.
- Whether the first playback event marks real sound on a device. It marks the first frame given to the output, not the speaker.
- How the gap between the phrase and the answer sounds, as the voice starts the answer only after the phrase has played.
- How a phrase sounds to a child. Savar has not read the phrases yet (`docs/maya-practice-lines.md`).
- How long the reply takes to stop on a real output. The tests prove the words are queued at once. LiveKit plays them when the stopped reply has unwound.

## Safety guidance goes first (#589)

**It does not wait for a model.** With the danger known (a reading in the model's answer), a refused proposal gets code's guidance with no repair call, and the session gives the accepted guidance to the worker at once (`VoiceCall.onGuidance`, from `onGuidance` in the text adapter). The model is then asked for the close, up to its 30 s limit, and the close waits for the guidance. A check-in cannot start while that call is out. A new worker that takes over after the guidance asks for the close when the child joins, and does not say the guidance again. A worker that lost the call to another stays silent. A failed save still stops media, as everywhere in a call, so it can cut the guidance; before #589 the save came first and a failed one meant no guidance at all.

**A child who is talking is heard first (decided on #589).** The guidance is queued at once and plays when the child stops. It is not said over them. LiveKit's `ttsTask` holds an interruptible speech on `userSilenceEvent`; `allowInterruptions: false` would skip that wait and talk over the child. A child who is disclosing harm should be heard, and interruption stays possible for the same reason. The cost: sound that LiveKit keeps reading as speech holds the guidance for as long as it lasts, up to the call's end. Real noise has not tested this.

**A cut guidance plays once more.** The start of the child's speech retires the current board plan, and a retired plan's frames do not reach the output, while the speech handle reports no interruption. So a noise can stop the guidance with nothing to show for it. The worker marks the guidance cut when its plan is retired or its speech is interrupted, and says the same words once more, whole, when that speech has ended and the child stops talking. A second cut gets no third. A dropped connection counts as a cut, and the guidance plays when the child is back; danger read while the child is away plays then too. A worker replacement between the cut and the repeat loses the repeat: the state is in the worker. Words after the guidance wait for it, because a queued speech takes the board plan that is current when it starts. Words from the silence clock wait the same way as a child's reply.

**A call that ends while the child is away ends when they are back.** The controller has ended, so no later input can end the stored call. The worker keeps the last words the child was not there to hear, says them when the child is back (after any guidance owed), and then ends the stored call, so the close, the alert, the learning event and the note do not wait for the deadline. A child who does not come back within 30 seconds ends the call as before.

**Desk chat answers one request.** It cannot send the guidance ahead of its reply, so its close is code's own (`fallbacks`) and no close call is made: the reply holds the guidance and the close together. The close call has no child turn to read (`turn` is cleared by the guidance), so this drops no reading of the child's words. No new sentences: the close comes from the same lines and bank phrases.

**The other text callers are unchanged.** The admin text demo, the practice suite and the command line set neither `onGuidance` nor the chat channel, so one input still returns the guidance and the close together, and can wait for the close call. Only the repair skip applies to them.

**What the tests prove.** `worker/maya-voice/src/silence.test.ts` measures, on the clock the test moves, from the danger known to the words given to `session.say`, with the close call held on a fake 30 s limit: 30000 ms before this work, 0 ms after. It runs the phrase, a talking child, a noise, words over the guidance, a dropped connection, a rise in severity and a replacement worker with the close call out. All of it uses the fake speech-to-text and voice. It proves nothing about real times or sound. These stay open until the accounts exist:

- From reading the code: with Silero, a noise of 500 ms or more pauses the audio, and LiveKit resumes it if no words come within 2 s (`falseInterruptionTimeout`). The pause retires the board plan, so the rest of that audio is lost and the repeat plays. The fake speech-to-text has no voice activity detection, so this route has not run.
- Whether a real output answers when a stopped speech clears its buffer. If it never does, LiveKit's queue stays stuck behind that speech, and neither the 3000 ms limit nor anything in this worker can free it.

## Not verified yet

- The AssemblyAI and Inworld plugins are written against their documented options (LiveKit Agents 1.9.5) and constructed in a test. No real audio has gone through them. Check one call on each after the keys exist.
- The model's first-word delay, cold start, Safari autoplay and iPad audio are #327.
- The board appears when a turn is saved, not in time with the words. Word timing (Inworld timestamps are requested) is #330.

Worker replacement also fences client messages. A confirmed revision conflict stops the old worker without a fatal client update. A save exception still reports a technical failure. Each worker publishes its immutable claim revision as `maya.segment`, both in room attributes and in call updates. The panel selects the highest segment and accepts fatal updates only from that worker with a matching segment. A delayed packet cannot close the replacement call. An agent leaving without a validated terminal message leaves recovery controls available.

## Maya's minutes

There is no minutes ledger in the code. The ledger code of #330 (`src/lib/maya-minutes*.ts`) had no caller and was removed on 2026-11-11. Maya's limits are 60 chat messages per child per family day (`CHAT_MESSAGES`, `docs/maya-chat.md`) and CAD 10 per child per family week (`WEEK_CAD`, `docs/maya-spend.md`). A call still lasts at most 10 minutes. Decide a voice limit again before voice calls open to children (#337).

The database objects of migration `add_maya_minutes` stay, unused: the table `maya_minute_grants` (0 rows on 2026-11-11), the functions `grant_maya_minutes` and `maya_minutes_used`, and the triggers `reserve_maya_minutes_on_call` and `settle_maya_minutes`. No code calls the functions, and no call sets `maya_calls.counts_minutes`, so the triggers reserve and settle nothing. `parents.time_zone` stays: the family time zone uses it (`src/lib/family-time.ts`).

The family zone uses a valid stored browser zone, then the postal mapping, then the oldest child's province, then Pacific. The oldest child is the first by `created_at`, then `id`. A child's calls or tests do not affect this selection. Missing local times resolve to the first valid instant at or after the requested time. Repeated local times resolve to the earlier instant.

A crashed call stays live only until the sweep of abandoned calls ends it (#528, `src/lib/maya-call-sweep.ts`, run by `/api/reminders` every 15 minutes). The sweep ends a live call 5 minutes after its own end time (its start, or its creation when Maya never joined, plus its limit), through the call module's public end, and stores the connected seconds from the stored connection events. When those events cannot be read, the end is refused, so a later sweep stores the connected seconds from them rather than 0 seconds. A worker's own end is refused the same way (#586): after a restart it holds none of the earlier events, so it leaves the call live for the sweep. The sweep counts the connected time through the last stored connection event, so the final speech after a "solved" close still counts.

## Weekly recap call coverage

The recap claims all included completed call IDs in `email_log.call_ids`, including calls without notes and notes outside the displayed ten. A sent or claimed recap covers those IDs permanently. A refused send can retry. Unknown delivery stays claimed. `claim_maya_weekly` locks the parent before it checks both the weekly claim and overlapping call IDs. It stores the IDs and unsubscribe hash in the same transaction.

The job releases one delivery slot per parent at Monday 7 a.m. family time. The slot ends at the next Monday midnight. It includes uncovered calls from the last 14 elapsed days that ended before the current local Monday. It defers pending or missing notes until the final local Sunday. Calls expire from the lookback window. Local week labels group the display and do not determine call coverage. A zone change can move a call to another displayed week without duplicating it or hiding it behind an earlier weekly claim.

## Board timing, code portion of #329

The worker stages accepted controller batches before speech starts. Each current offer uses the last word of its controller turn as the cue. `BoardCue.word` can name an earlier word when a more detailed plan is available. The worker keeps separate sentence synthesis streams. TTS word end times are relative to each sentence. The adapter adds the preceding audio duration to each time. A cue clock starts with actual audio output. It advances only through samples forwarded to that output. It releases batches through `maya.board` RPC before the final audio drain. Generating audio does not release a batch. The output adapter uses small frames to bound buffering. It stops its clock on interruption and disconnect. It accounts for gaps when the output runs out of audio.

When a sentence has no word times, its final audio sample supplies the sentence boundary. This also handles a provider that omits only some word times. Child speech invalidates pending timing callbacks before cancellation starts. The receiver cancels staged work and keeps shown work. An absent child cannot receive a stop RPC. The worker invalidates local cues without ending the call during its 30-second reconnect period. The new epoch cancels the old staged work when the receiver returns. A late release from an older epoch is refused. The browser follows the newest worker segment. An older worker cannot send board RPC parts.

The browser keeps the shown event log and epoch in session storage under the call ID. A reconnect reads that log before it starts a new epoch. A replacement worker can read the same receiver log. A page reload can restore it from session storage. Large reset requests travel in ordered RPC parts, each below the LiveKit payload limit. Snapshot storage is best effort if browser storage is unavailable. The worker saves observed receiver events and their times in the existing `board_history` JSON column. This includes shown batches, presentation acknowledgements when available, and cancellations. A replacement worker restores this observed snapshot. The admin voice replay and board view use only this history. The teaching trace keeps accepted plans separately. Voice records with a delivery field use observed history, including an empty log. Records without that field keep their saved board history or the legacy trace fallback. Text calls and old assessment recordings keep their existing replay rules. If a peer stays unavailable, the server keeps the last confirmed observation. It does not turn accepted plans into shown work.

### Timing measurements

The worker writes one structured `board cue` log per released batch. It records the call, utterance and batch IDs, `word` or `sentence` source, audio position in milliseconds, worker time when the cue was due on the output clock, worker time when the browser acknowledged, acknowledgement delay, and returned batch state. It stores no speech text or audio in these logs. The closing `board cue report` groups the samples by source and reports counts, shown counts, and p50/p95 acknowledgement delay. The `fakeAudio` field identifies simulated output. Acknowledgement delay uses one worker clock. It does not measure browser paint or the speaker-to-screen delay on a device.

Local public-interface tests use the fake speech provider, fake voice provider and memory transport with the real board receiver. They cover word release, an interruption, obsolete callbacks, a lost release answer, snapshot recovery, bounded large snapshot transfer, and sentence fallback with fake timestamps disabled. AgentSession tests cover the controller-to-synthesis connection with both timestamp modes. No paid call is needed.

After keys exist, verify these issue criteria in a real call:

- Drawing follows Maya's words in a real call.
- Cue timing is measured and reported.

For that check, compare the actual speaker output and first visible stroke on Chrome and Safari on an iPad. Include interruption and reconnect cases. Save the worker logs and device observations separately. Report word and sentence results separately. Do not report the local fake timings as real audio results.

### PR #450 review corrections

- R450-1: a cancellation-aware output clock replaces completed-run progress events as the cue source. Continuous fake output and the SDK native audio output release intermediate cues before final drain. The native test uses a local AudioSource and a fake track publication, with no room or provider request.
- R450-2: disconnect invalidates local cues immediately. Expected transport failures from an old connection cannot end a reconnected call. Reconnect cancels staged work under a new epoch and saves the receiver snapshot.
- R450-3: voice calls persist the receiver log with event times. Cancelled work stays out of both board views and admin replay. Tests compare the saved replay with the receiver after cancellation and after a worker replacement.
- R450-4: an empty sentence stream cancels its plan. No fallback cue is registered for zero audio. A timing entry alone cannot release a batch before playback starts.
- R450-5: alignment entries are ordered and deduplicated before prefix matching. Repeated approved words with distinct times keep their positions.

- R450-6: legacy voice records keep their saved board history or trace fallback. New records retain the explicit delivery marker from creation, so an empty observed board stays empty.
- R450-7: each audio stream captures its utterance ID and generation. Cancellation returns before empty-output handling. Late synthesis and read results cannot stop a newer plan, even when an utterance ID is reused.

- R450-8: planner interrupt, local detach, and reconnect require a SpeechScope. Timing and playback callbacks require the same token. The output captures each segment's original scope, and TTS labels each frame with it. An obsolete completion or pause cannot stop the current plan or its timer. Stop and release RPCs carry the generation, so a delayed stop cannot cancel a reused utterance ID. Initial connect refuses to clear an existing plan. A serial connection barrier supports an immediate first plan without a delay.

The compile-only checks in `worker/maya-voice/src/speech-scope.types.ts` must fail if an unscoped cancellation API becomes callable. The voice typecheck includes those checks. Production callback tests retain all three newly staged batches when old native output reports an interruption. A separate output test retains the newer cue timer.

- R450-9: the output counts a segment only when the native sink admits it. An interruption before forwarding creates no segment. The production worker test interrupts between capture entry and native forwarding. Old cleanup and the next turn both finish with zero pending segments. A second test cancels while native admission waits for startup.
- R450-10: sender cancellation and every cancel or stop RPC require the original SpeechScope. The receiver rejects missing and obsolete scopes before it changes the plan. Apply and release also require a scope. Reconnect reset carries the plan scope from its status read and rejects a different current plan. Taking the pen requires the receiver's observed scope, or explicit null when no plan exists. The planner cancels its recorded delivery scope before it stages the next plan. A new plan waits for pending priority stops, including when the next turn starts without a delay.

Application audio clear and pause require a SpeechScope. A private adapter implements the SDK's required no-argument media methods. It captures the admitted or in-flight segment's original scope and passes it to the application controller. The controller checks that owner before it clears the native buffer. Native completion retains that same scope. Stream cancellation passes the stream's captured scope as its reason. It acts only on that stream's reader.

The negative type checks now cover sender cancel, receiver pen cancellation, cancel and reset wire shapes, and application audio clear and pause. RPC tests send malformed and obsolete requests through the real browser handler. They retain the newer plan. A delayed priority-stop test also retains and releases the next plan.
