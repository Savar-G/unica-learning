# Maya voice calls (#326)

An admin speaks to Maya as a test child on an assessment question. The call runs in Maya's voice worker (`worker/maya-voice`), a LiveKit Agents for Node worker outside the Vercel build. The worker wraps Maya's controller through the text adapter: the speech-to-text turns the child's speech into child turns, Maya's session (`src/lib/maya`) answers, and the voice says only the words the session accepted, plus a code-written acknowledgement when a turn is slow (below). LiveKit never asks a model itself.

Everything runs with **fake providers** until the accounts below exist. The fake speech-to-text hears typed words from the call page, and the fake voice is silent. Nothing is paid and no account is needed. The real route is LiveKit Inference (D-238): speech-to-text and the voice through the LiveKit project's own key. The direct AssemblyAI and Inworld plugins stay as options (D-163). Packaging and deploying the worker, and the listening test that picks the voice: [Deploying Maya's voice worker](maya-voice-deploy.md).

## How a call runs

1. Admin, `/admin/maya`: choose **Speak**, then **Talk to Maya** on a test question. `POST /api/admin/maya/voice` makes the call's record (`maya_calls`, `mode = 'voice'`, not started) and mints its token.
2. The call page checks the microphone (a level bar), then **Connect** asks `POST /api/admin/maya/calls/<id>/token` for a fresh token and joins the room `maya-call-<call id>`.
3. The token admits one participant, `child-<child id>`, to that one room, for 5 minutes (`VOICE_TOKEN_TTL_SECONDS`). It allows the microphone and data, and no admin, create, list or record rights, and no metadata changes. Its attributes name the call, the parent and the child. It also asks LiveKit to dispatch the worker `maya-voice` with the call id (`src/lib/maya-voice-token.ts`).
4. The worker checks that the room is the call's own and that the joiner is the call's own child, with the token's family attributes (`checkJoiner`). It ignores anyone else. It then opens the call (`openVoice`) and records the speech-to-text and voice ids on it.
5. Maya opens the call when the child is there. First she says the fixed greeting once (`GREETING_TEXT`, "Tuning for children" below), then her first line. Each finished child turn goes to the call's session. Preemptive generation is disabled. Only a completed child turn can change the call. Silence checks stop while the child is absent. Closing starts at 9 minutes. An independent deadline stops media at 10 minutes, including during speech or model work. A restored worker schedules these timers again.
6. After each saved turn the worker sends `{ revision }` on the `maya.call` data topic, and the page reads the call again (`GET /api/admin/maya/calls/<id>`) for the transcript and board.
7. **Hang up** (RPC `maya.hang_up`) ends the call as "Child stopped". A dropped connection ends it as a technical issue if the child is not back within 30 seconds. The session's own end (solved, safety) keeps the saved call live until the final speech handle completes. Then the worker saves the terminal outcome, sends the terminal update, and disconnects. The 10-minute media deadline takes priority. A fatal session closure saves a technical outcome. A lost write or failed save stops media and sends a technical failure to the client. A room disconnect alone leaves the browser recovery controls available until the server confirms an outcome.

The saved live state keeps the accepted final words until playback completes. A replacement worker replays that saved response once, waits for playback, then completes the call. Recovery uses the saved accepted output. The independent deadline stays active during replay.

### What is stored

| Where | What |
|---|---|
| `maya_calls` (existing columns) | The transcript and board (`trace`), the outcome, `speech_to_text` and `voice` (provider ids, never keys), `connected_seconds`, and the mishearing counts `mishearing_confirmations` (numbers Maya asked to confirm) and `mishearing_corrections` ("no, I said ..."). |
| `maya_calls.live` | While live: the session and, under `acknowledged`, the acknowledgement phrases saved before they are said, and the greeting's id `greeting.hello` (ids only). Dropped when the call ends. |
| `maya_call_connections` (new, migration `add_maya_call_connections`) | One row per `agent_joined`, `agent_left`, `child_joined` and `child_left`, with the database receipt time. `append_maya_call_connection` checks the expected revision, raises it and inserts the event in one transaction. It serializes with replacement claims. Receipt times stay in order across worker clocks. `agent_joined` renews a 15-second connection lease every 5 seconds. Each new worker first closes the previous segment with `agent_left`. Connected seconds count overlapping child presence and valid worker leases. A crash can add at most 15 seconds after the last renewal. Reconnect gaps and longer crash gaps are excluded. |

The app does not save audio. The worker starts its session with `record: false`. This setting does not establish the retention policy of LiveKit Cloud, LiveKit Inference, AssemblyAI, or Inworld. Their effective settings and contracts must be verified before any claim that those systems do not store audio. The speech-to-text confidence marks a child turn as uncertain below 0.6, so Maya confirms the number. A cancelled call that Maya never joined writes no learning event and no parent note (#904 review): no talk happened. The saved JSON state keeps a cancellation marker until cleanup succeeds. Each recovery attempt reads that marker.

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

Before `child-use-approved`: get a written answer from LiveKit (and, through it, the providers of the chosen models) that a service for children aged 6 to 12 may use them, with parent consent, under the agreed processing locations. ZDR is not that answer.

**Decision for `child-use-approved` (D-336).** Savar's statement, 2026-11-12: an executive at LiveKit gave approval for child use (verbal). No written answer was asked for. Set `child-use-approved` only together with `livekit-inference-zdr`, after step 1 above is done and the LiveKit CLI is linked to the project. The marker records Savar's decision; it cannot verify an external contract.

**The weekly voice time (D-336).** A child has 30 minutes of voice a family week. The desk checks the week before every ticket (start, reconnect, a repeated start), with the call it gives a ticket for counted at its whole limit. A child has at most one live family call (index `maya_calls_one_live_family_call`), so that read is exact and nothing adds to the week while the call runs. Over the week, or when the week cannot be read, no ticket is given, and a call Maya has not joined ends without an event or a note; a joined call keeps running.

**Privacy gate set (2026-11-12).** Savar confirmed on 2026-11-12 that agent observability (session recording and audio) is off in the LiveKit project `unica-ai-teacher` and that a billing alert is set. The voice lead checked the project settings read-only the same day: "Agent observability" is off, and the agent page says "Observability is disabled for this project". No billing alert or usage limit shows on the Build plan (next invoice USD 0.00); set it when the project moves to Ship. With Savar's child-use statement above, the Cloud worker runs with `MAYA_VOICE_PRIVACY_CONFIRMED=livekit-inference-zdr,child-use-approved`, `MAYA_STT=inference` (`assemblyai/universal-3-6-pro`) and `MAYA_TTS=inference` with Maya's voice (D-338): `MAYA_TTS_MODEL=cartesia/sonic-3.6`, `MAYA_VOICE=f786b574-daa5-4673-aa0c-cbe3e8534c02` (Cartesia "Katie"; also the code's default when `MAYA_VOICE` is not set). Production `LIVEKIT_*` and `MAYA_VOICE_ENABLED` stay off until Savar approves after the real-voice test call and the voice pick.

**Anthropic's guidelines for products serving minors (D-336).** Anthropic's Usage Policy (effective 2026-11-12) requires the guidelines of its support article "Responsible Use of Anthropic's Models: Guidelines for Organizations Serving Minors". Maya meets the AI disclosure (her opening, the notice, the privacy page), adult control of access (only a signed-in parent opens the desk; the PIN closes it; the notice agreement opens Maya), content limits (code-written math lines, free talk off in chat and voice, NEVER_SAY guards, code-written safety guidance) and monitoring (safety alerts to the team, transcripts for the team and the parent). Age check: the child never has an account; an adult creates the family account and gives the child's grade, and Maya opens only for Grade 3 and up. The Chief of Staff judged this adequate on 2026-11-12. The desk shows "Don't tell Maya your full name, address or phone number." until the child's first chat or call (approved by Savar, 2026-11-12). Still open with Savar: a public statement of child privacy law compliance, and Anthropic's own child-safety system prompt.

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
| `MAYA_VOICE` | No | Optional | The voice id. Maya's voice is Cartesia "Katie", `f786b574-daa5-4673-aa0c-cbe3e8534c02` (D-338), the default with the default model. Needed with another Inference model or with `inworld`. |
| `MAYA_TTS_MODEL` | No | Optional | With `inference`: `cartesia/sonic-3.6` (default, D-338) or `inworld/inworld-tts-2`. With `inworld`: default `inworld-tts-2`; `inworld-tts-2-flash` is the cheaper option. |
| `OPENROUTER_API_KEY`, `AI_MODEL` | Already set | Yes | Maya's model. Without the key the worker uses the fake rule player. |
| `MAYA_REVIEW_MODEL` | Already optional | Optional | The free-talk review model. |
| `MAYA_USD_TO_CAD`, `MAYA_MONTHLY_ALERT_CAD`, `MAYA_STT_USD_PER_MINUTE`, `MAYA_VOICE_USD_PER_1K_CHARS` | Optional | Optional | Maya's spending cap (`docs/maya-spend.md`). Use the same values as the web app. |
| `SUPABASE_URL` | No | Yes | `https://cdjobwsyzndtltzfpyqa.supabase.co`. |
| `SUPABASE_SECRET_KEY` | Already set | Yes | The worker's own key `maya_voice_worker` (step 4), not the web app's. |
| `MAYA_ACK_LIMIT_MS` | No | Optional | The child's end of speech to the acknowledgement, in ms. Default 1200. `0` turns it off. |
| `MAYA_VOICE_LOAD_LIMIT` | No | Optional | 0 to 1: the machine load above which the worker takes no new call. LiveKit's default otherwise. |
| `MAYA_STT_MIN_SILENCE_MS` | No | Optional | AssemblyAI `min_turn_silence` for a normal turn. Default 400. Whole number, 0 to 2000. |
| `MAYA_STT_MAX_SILENCE_MS` | No | Optional | AssemblyAI `max_turn_silence` for a normal turn. Default 1600. 100 to 10000, not less than the minimum. |
| `MAYA_STT_NUMBER_MIN_SILENCE_MS` | No | Optional | `min_turn_silence` for the one turn after Maya asks for a number. Default 512. 0 to 2000. The worker never uses less than `MAYA_STT_MIN_SILENCE_MS`. |
| `MAYA_STT_NUMBER_SILENCE_MS` | No | Optional | `max_turn_silence` for the one turn after Maya asks for a number. Default 4500. 100 to 10000, not less than `MAYA_STT_MAX_SILENCE_MS` or `MAYA_STT_NUMBER_MIN_SILENCE_MS`. |
| `MAYA_TURN_MIN_DELAY_MS` | No | Optional | LiveKit endpointing `minDelay`, added after the speech-to-text end of turn. Default 100. 0 to 2000. |
| `MAYA_NUMBER_CONTINUE_MS` | No | Optional | The one extra wait after a transcript that ends in a number word that can go on. Default 1500. 0 turns it off. 0 to 3000. |
| `MAYA_INTERRUPT_MIN_MS` | No | Optional | Speech this long stops Maya (LiveKit interruption `minDuration`). Default 300. 0 to 2000. |
| `MAYA_INTERRUPT_MIN_WORDS` | No | Optional | Words the speech-to-text must have heard before speech stops Maya (`minWords`). Default 0. 0 to 5. |

A real provider set without its privacy confirmation, key or voice, or with an Inference model off the allow list, or with a tuning value outside its bounds, stops the worker's job with a clear log line. It never falls back to the fake quietly (`voiceProviders`, `src/lib/maya-voice.ts`). With `inference`, the worker uses `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, which LiveKit Cloud injects.

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

## Tuning for children

Source: the research report `.design/research/maya-voice-2026-11-12/voice-research-stt.md` and LiveKit Agents for Node 1.9.5 as installed. All numbers below are starting points. No real call has run, so no number is measured. Check each one with the 40-answer test and with children's calls.

**Speech-to-text silence limits.** Before this work the worker set no silence limit.

- Through Inference, `inference.STT` sends the model options it is given and nothing else (`connectWs` in `inference/stt.js`). The worker gave none, so the gateway default applied. LiveKit's AssemblyAI page lists `min_turn_silence` 100 and gives `max_turn_silence` no default.
- Through the direct plugin, a Universal-3 model with no `mode` and no limit gets 100 ms for both limits (`#connectWS` in the plugin's `stt.js`). A turn then ends 100 ms after the last word. A child who thinks between "fifty" and "six" is cut off.

The worker sends `min_turn_silence` 400 ms and `max_turn_silence` 1600 ms to every AssemblyAI model for a normal turn (`makeProviders`, `worker/maya-voice/src/providers.ts`). These replaced 512 ms and 3000 ms on 2026-11-12. AssemblyAI ends a turn that reads complete at `min_turn_silence`. It holds a turn that reads unfinished, or that ends in a number that can continue, until `max_turn_silence` ([turn detection](https://www.assemblyai.com/docs/streaming/turn-detection), read 2026-11-12). Its "balanced" preset uses 128 ms and 1280 ms, and "max_accuracy" uses 512 ms and 2560 ms. The research note says that 100 ms to 128 ms can cut a child's pause in a sentence. 400 ms is between the two presets. 1600 ms is a little above "balanced" and near the 1.64 s that AssemblyAI measured for its slowest tenth of held turns. A normal turn that reads complete now ends about 112 ms sooner. A normal turn that reads unfinished ends up to 1400 ms sooner. The number turn keeps the long limits (below). It does not use `mode: "max_accuracy"`. LiveKit says explicit limits win over a mode. The mode's own numbers come from AssemblyAI's page, not from LiveKit's, and they are not settings. The two numbers are settings. `language` stays `en`. LiveKit's page lists `en-CA`, but nobody has tested it on a call, so the worker keeps `en`. The direct plugin has no `language` option, so a Universal-3 model there gets `languageCodes: ["en"]`. LiveKit's `AssemblyAIOptions` type still lists the old name `min_end_of_turn_silence_when_confident`. The worker sends the name on LiveKit's page, `min_turn_silence`, as plain data. A real call must confirm that the gateway reads it.

**Turn delay.** LiveKit adds the endpointing `minDelay` after the speech-to-text end of turn. Its default is 500 ms (`turn_config/endpointing`). The worker sets 100 ms for real providers (`MAYA_TURN_MIN_DELAY_MS`). It does not set 0. LiveKit logs a warning when a transcript arrives after the turn is committed, and the warning tells the operator to raise `minDelay`. The fakes and the tests keep their own timing.

**A longer wait for a number.** When Maya's last accepted line asks for a number, the next child turn waits longer: `min_turn_silence` 512 ms (`MAYA_STT_NUMBER_MIN_SILENCE_MS`) and `max_turn_silence` 4500 ms (`MAYA_STT_NUMBER_SILENCE_MS`); `turnSilences` in `src/lib/maya-voice.ts` gives both pairs. The rule is `asksForNumber` in `src/lib/maya-voice.ts`: the session is in `ASSESS`, `MODEL_EXAMPLE`, `TRY_TARGET`, `GUIDE_TARGET` or `CHECK`, and her last sentence is a "what" or "how many" question, or a request to try, add, subtract, multiply or divide. The controller is not changed. The worker puts the normal limits back when the child's turn arrives, so the long limits apply to one turn only. A check-in or an answer that does not ask for a number keeps the normal limits. Both routes have a live update of both limits: `STT.updateOptions({ modelOptions })` for Inference (it sends `session.update`, and the SDK keeps the keyterms), and `updateOptions({ minTurnSilence, maxTurnSilence })` for the plugin (it sends `UpdateConfiguration`). Whether AssemblyAI applies the new limit in the middle of a session is not verified. A failed update changes nothing.

**A number word that can go on.** When a final transcript ends in "twenty" to "ninety", "hundred", "thousand", "and" or a tens number in digits, the worker waits once, at most 1500 ms (`MAYA_NUMBER_CONTINUE_MS`, `endsInOpenNumber`), before it sends the turn. If the speech-to-text gives more words in that time, the worker does not answer the first words. It reads them with the next turn as one answer ("fifty" and "six" become "fifty six"). If no words come, it sends the turn as it was. Each answer waits at most once. The wait is only for real providers. It adds up to 1.5 s to an answer that ends in a tens word, such as "forty".

**Keyterms.** The worker passes `callKeyterms(package)` at the start of the call (`keyterms_prompt` for AssemblyAI through Inference, `keytermsPrompt` for the plugin, `keyterm` for Deepgram Flux). The terms are the right answer and the likely wrong answers, together: the stored wrong answers, the operands, the answer plus or minus 1 and 10, and its digits reversed. Each is in digits and in words. Then come the number words that sound alike (thirteen and thirty, up to nineteen and ninety) and a few math words. The limits are 100 terms and 50 characters each. The function reads numbers only, never the question's text, so it holds no name. It never boosts only the right answer: a model told to expect one answer can hear that answer in what the child said. The research report says that boosting can pull a transcript toward a context term (one secondary source), so code still checks what was heard against what is expected. LiveKit also sends Maya's accepted words to AssemblyAI as `agent_context` (`_pushConversationItem`), because the worker says them with `addToChatCtx`. The words hold no child name.

**Interruption.** LiveKit's defaults are `minDuration` 500 ms, `minWords` 0, `falseInterruptionTimeout` 2000 ms with resume on, and `mode` unset (`turn_config/interruption`). The worker sets `minDuration` 300 ms and `minWords` 0 for real providers (`MAYA_INTERRUPT_MIN_MS`, `MAYA_INTERRUPT_MIN_WORDS`).

- Speech of 300 ms pauses Maya's audio. The child hears her stop within about 300 ms plus the voice activity detector's delay. If no words follow within 2000 ms, LiveKit resumes her. If words follow, the speech is interrupted for good.
- `minWords` above 0 counts words in the speech-to-text's current transcript. It keeps a noise with no words from pausing Maya. It also delays the stop until the first partial transcript, which can be later than 300 ms. The worker keeps 0. Set 1 if noise pauses her too often in the pilot.
- These options do not tell "mm-hm" from a turn. A "mm-hm" that lasts 300 ms pauses her. If the speech-to-text returns it as words, it becomes a child turn. LiveKit's adaptive interruption detector can classify such sounds (`mode` unset uses it only when the worker runs on LiveKit Cloud or in dev mode, `resolveInterruptionDetector`). The worker does not set `mode`. Nobody has tested that detector with this worker.
- How safety guidance is queued is unchanged ("Safety guidance goes first" below).

**The greeting.** Before her first line, Maya says one fixed line: "I can make mistakes, so tell me if something sounds wrong." (`GREETING_TEXT`). The worker says it with `session.say`, as it says other code lines. It has an empty board plan, as an acknowledgement has, so it sends no batch. The opening's board is staged after the greeting has played, because a new plan takes the audio from the old one. The worker saves `greeting.hello` (`GREETING_ID`) in `live.acknowledged` before it says the line, and does not say it if the id is there or the call has started. A worker that takes over, or a child who rejoins before the opening is saved, does not hear it twice. It is not in the call's transcript. The 20 s limit on its playback (`GREETING_HOLD_LIMIT_MS`) stops a greeting whose audio never ends, so the opening is not held for ever.

**The listening test.** The operator report now has the columns "Files with word start times" and "First audio, median / slowest (ms)" for every voice. An Inworld TTS-2 candidate with "reasoning" on is not in the kit. Inworld's own field is `synthesisContext.reasoning` set to `REASONING_ON`. LiveKit Agents 1.9.5 has no option for it, in the Inference `InworldOptions` or in the plugin. The name the gateway would pass on is not known. Add the candidate when an SDK version types it.

**What the tests prove.** `worker/maya-voice/src/tuning.test.ts` runs the greeting, the longer limit and the number wait through LiveKit's pipeline with the fake voice and a speech-to-text the test drives. It proves the order of events: the greeting is first and once, the limit changes at the right turns, and "fifty" plus "six" reach the call as one answer. `providers.test.ts` proves what each route is given. `src/lib/maya-voice.test.ts` proves the settings, the keyterms and the two rules. None of this proves what AssemblyAI or LiveKit does with the settings. That needs a real call.

## Silence: each turn's time and the acknowledgement (#532)

A child's turn runs behind the speech. `llmNode` returns its stream at once, so the session is not silent just because the model is working.

**The acknowledgement.** When the turn is not ready 1200 ms after the child's end of speech (1500 ms before 2026-11-12) (`ACK_LIMIT_MS`, `MAYA_ACK_LIMIT_MS`), the worker says one phrase from `ACK_PHRASES` (`src/lib/maya-voice-ack.ts`), for example "Hmm, let me think."

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
| `boardMs` | The ready answer to its words given to the voice. A child's reply no longer waits for later saves or for its board plan here, so it is close to 0. |
| `voiceMs` | Words given to the voice, to the first sound. The first sound also waits for the board plan, if the plan takes longer than the voice. |

The parts add up to `answerMs`. More fields, outside that sum:

| Field | Meaning |
|---|---|
| `sttWaitMs` | The child's own end of speech to the speech-to-text's final transcript. It holds AssemblyAI's end-of-turn silence, which `heardMs` does not see. |
| `speechEnd` | Where that end of speech came from: `stt_words` (the end time of the last word in the final transcript, from the time the first audio frame went to the speech-to-text) or `vad` (LiveKit's first end of speech before the final transcript; in a real call its voice activity detector, which reports about 250 ms after the true end). Null: neither was seen, and `sttWaitMs` and `waitMs` are null. |
| `waitMs` | The whole wait of an answered turn: the child's own end of speech to the answer's first sound. |
| `stageMs` | The ready answer to its board plan on the child's screen. It runs beside `voiceMs`. |

What the code can see, and what it cannot. From LiveKit Agents 1.9.5 (`voice/audio_recognition.js`), the `stoppedSpeakingAt` that starts `answerMs` is the time the speech-to-text's end of speech arrived, not the child's last word: the Inference route sends the end of speech right after the final transcript, and that event sets the time to "now". So `heardMs` (about 105 ms in the call of 2026-11-12) is only LiveKit's `minDelay`, and the silence before it was not measured. `sttWaitMs` now shows it. The worker cannot see the true end of the child's voice on the device, the network time from the device to LiveKit, or how long AssemblyAI waits inside its own silence check. If the provider gives no word times, the `vad` mark is late by the detector's silence window, so `sttWaitMs` is then too small by about 250 ms. `outcome` is `answered`, `no_words` (the session said nothing) or `interrupted`; only `answered` has parts.

**What the fakes prove, and what they do not.** `worker/maya-voice/src/silence.test.ts` runs a whole call through LiveKit's pipeline with the fake speech-to-text and voice on a frozen clock. It proves the order: a fast turn has no phrase, a slow turn has the phrase at the limit and then the answer, a child who talks cancels it, the phrase sends no board batch, no phrase comes twice, and the parts match exact known delays. The R577 tests delay the board and the save to prove that a late answer cannot replace a newer board, that danger known during a delay stops the phrase, and that a replacement worker reads a phrase already heard. They also measure, on the clock the hold runs on, the time from a finished safety or deadline turn to its words being queued. It proves nothing about real times, because no real model, speech-to-text or voice ran. These stay open until the accounts exist:

- Whether 1200 ms is the right limit, and how often a real turn passes it.
- Whether LiveKit's `stoppedSpeakingAt` from AssemblyAI is the child's true end of speech. If it comes late, `heardMs` and every total are too small.
- Whether the first playback event marks real sound on a device. It marks the first frame given to the output, not the speaker.
- How the gap between the phrase and the answer sounds, as the voice starts the answer only after the phrase has played.
- How a phrase sounds to a child. Savar has not read the phrases yet (`docs/maya-practice-lines.md`).
- How long the reply takes to stop on a real output. The tests prove the words are queued at once. LiveKit plays them when the stopped reply has unwound.

## The voice does not wait for the board's saves

A child's reply goes to the voice as soon as the call accepted it and saved the turn (`VoiceCall.child` waits for that save). Before 2026-11-12 the reply also waited for every later save and for its board plan to reach the child's screen (`boardMs` 468 ms and 949 ms in the call of 2026-11-12). Now:

- The reply does not wait for later saves (the connection lease, the receiver snapshots). A failed save still stops media, as everywhere in a call.
- The board plan is staged first, then the words go to the voice at once. The voice makes the first sentence while the plan goes out. No audio frame plays before the plan's batches are on the receiver (`board.sent`, waited for in `boardAudio`), so a cue word is never heard before its batch is staged. The order of plan, then sound, is kept. A plan that cannot be sent has no sound, and the call ends as before.
- The save of the receiver's snapshot after a plan is no longer between the plan and the sound. It runs after the sends, outside the order of the sends and releases.
- A turn that no longer owns the reply stages nothing and writes no words. A turn that loses the reply after its words went to the voice makes no sound: its plan is retired, so its audio stream closes before the first frame.
- While one sentence plays, the voice already makes the next one (`boardAudio`), so there is no gap of the voice's first-audio delay between sentences. A cut speech retires the sentence made ahead. The words are counted for spend when the voice returned audio for them, as before, so a sentence made ahead and then cut can count.

The session returns the whole reply at once (the controller has no partial output), so the first sentence cannot start before the reply is accepted. It starts as soon as it is accepted.

**What the tests prove.** `silence.test.ts` holds a board send and proves, with and without word times, that the words reach the voice before the send ends and that the first sound comes only after it (`boardMs` 0, `stageMs` and `voiceMs` equal to the held time). It proves that a reply cut while its plan goes out makes no sound and shows no batch. `speech-audio.test.ts` proves the next sentence is made while the current one plays, that a cut stream retires it, and that a plan that failed to send plays nothing. Without the wait for the plan, the test with no word times fails. None of this proves real times.

## Math symbols are spoken as words

In a real call on 2026-11-12, the voice (Cartesia sonic-3.6 through LiveKit Inference) read "We're doing 52 − 28 today." as "52 28". It did not say the minus sign. Now the worker changes math notation into words before the text goes to the voice: "52 − 28" goes as "52 minus 28".

- The module is `src/lib/maya-voice-spoken.ts`. `spokenMath(text)` gives the spoken text. `spokenWords(text)` gives the spoken form of each word of the text, one entry for each word that `speechWords` (board-speech) counts.
- Only the text sent to the voice changes. The board, the stored transcript and the call session keep Maya's own text.
- `countedSynthesis` in `worker/maya-voice/src/speech-audio.ts` is the one place where text goes to the voice, so every line is changed: replies, acknowledgements, the greeting, guidance and `session.say`. It changes the text one sentence at a time, so a sign is never read apart from its number at a chunk break.
- Spend counts the spoken text, because the voice receives and bills that text.
- `boardAudio` changes the whole reply first, so a sign and its number stay together when a sentence break falls between them ("Find it: ? − 28 = 24."). It then sends each spoken sentence.
- Board cues still count the words of Maya's own text (`cue.word`). The voice gives times for the words it said ("three quarters" for "3/4"). For each word n, `boardAudio` compares what the voice said with the spoken form of words 1 to n (and also with the written form, for a voice that gives back the text it received). Thus a cue at word n fires when the voice reaches the spoken words of word n. When the voice gives no word times, the cue fires at the end of its sentence, as before.
- LiveKit's own record of Maya's speech (its chat context and room transcript, built from the voice's word times) now has the spoken words. It had the voice's words before this change too. No code reads it for Maya: the call's transcript comes from the call session.

| Written | Spoken |
|---|---|
| `52 − 28`, `52-28`, `52 – 28` | 52 minus 28 |
| `3 + 4 = 7` | 3 plus 4 equals 7 |
| `3 × 4`, `3 * 4`, `3 x 4`, `3x4` | 3 times 4 |
| `12 ÷ 4`, `12 / 4` (spaces) | 12 divided by 4 |
| `52 − 28 = ?` | 52 minus 28 equals what? |
| `? + 5 = 8`, `__ + 5 = 8` | what plus 5 equals 8, blank plus 5 equals 8 |
| `−5` (no number before it), `x = −5` | negative 5, x equals negative 5 |
| `3/4`, `1/2`, `2/3`, `5/8`, `7/20` | three quarters, one half, two thirds, five eighths, 7 over 20 |
| `2 1/2`, `2½`, `½`, `¾` | two and one half, one half, three quarters |
| `<`, `>`, `≤`, `≥`, `≠` | less than, greater than, less than or equal to, greater than or equal to, is not equal to |
| `25%` | 25 percent |
| `3²`, `2³`, `10⁴`, `x²` | 3 squared, 2 cubed, 10 to the power of 4, x squared |
| `cm²`, `12 m²` | square centimetres, 12 square metres |
| `5 cm`, `1 cm`, `250 g`, `500 mL`, `2 L` | 5 centimetres, 1 centimetre, 250 grams, 500 millilitres, 2 litres |
| `$5`, `$1`, `$3.25`, `$0.50`, `25¢` | 5 dollars, 1 dollar, 3 dollars and 25 cents, 50 cents, 25 cents |
| `3:30`, `3:05`, `3:00`, `3:00 p.m.`, `3pm` | three thirty, three oh five, three o'clock, three p.m., 3 p.m. |
| `2:3` | 2 to 3 |
| `26 R 1` | 26 remainder 1 |
| `90°`, `√9` | 90 degrees, the square root of 9 |

Digits stay digits where the voice reads them well. Decimals (`2.5`) and thousands (`1,081`) do not change. These stay as they are: hyphenated words ("twenty-seven"), a dash between words ("wait - no"), "and/or", dates (`2026-11-12`, `11/12/2026`), a phone-like `604-555-1234`, "I'm", and the letters "x", "m" and "R" when they are not between numbers or after a number.

Rules to know:

- `h:mm` with two minute digits is a time. One digit after the colon is a ratio. Thus `2:30` is always "two thirty", also when the text means a ratio.
- A dash between two numbers is a minus, so a range such as `5-10` is read as "5 minus 10". Write ranges with "to".
- A fraction with no spaces (`12/4`) is a fraction ("twelve quarters"). With spaces (`12 / 4`) it is a division.
- `spokenMath` never throws, and it gives the same text when it is applied again.

**What the tests prove.** `src/lib/maya-voice-spoken.test.ts` checks each form above, the text that must not change, idempotence, and that streamed text is the same as the whole text for every chunk break. `speech-audio.test.ts` runs `boardAudio` through `countedSynthesis`, as `ttsNode` does, with a fake voice. It proves that the voice and the spend count receive the spoken text, that a cue on "24" in "52 − 28 = 24" and a cue on a fraction fire at the word time of their spoken words, that the word count stays correct in a later sentence, and that the sentence end is used when there are no word times. Without the spoken prefixes, the two fraction cue tests fail. Without the change, 9 worker tests fail. **Not verified:** how Cartesia reads each spoken form. Nobody listened to it yet.

## Interim words on the call screen

LiveKit Agents for Node 1.9.5 sends the child's transcript to the room as text streams on the topic `lk.transcription` (`ParticipantTranscriptionOutput` in `voice/room_io/_output.js`): one stream for each interim transcript and one for each final, with `lk.transcription_final`, `lk.segment_id` and `lk.transcribed_track_id` (the child's microphone track). This happened before this work too. The call screens now show those words as the child's last bubble, in light text, while Maya hears them (`src/lib/maya-voice-hearing.ts`, used by `src/components/maya-voice-room.ts`, shown by `src/components/desk-voice.tsx` and the admin transcript in `src/components/admin-maya.tsx`).

- Only the call's own child's words show: the stream must name this device's microphone track and come from the child's identity or the call's current Maya worker. With no track named, only the child's own identity counts. Maya's own words on that topic are not shown.
- When a saved turn arrives (the `maya.call` revision) and the screen has read the call again, the final words seen before it leave the line, because the saved transcript now holds them. Words heard after that stay. The line is empty after the call ends or the room drops.
- The line is never saved and never sent anywhere. A screen reader reads the saved turn, not the line.
- Not verified: whether LiveKit Inference sends AssemblyAI's partial transcripts as interim results to the room in a real call.

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

The worker stages accepted controller batches before their speech is heard: a reply's words can go to the voice while its plan goes out, but no audio frame plays before the plan is on the receiver ("The voice does not wait for the board's saves"). Each current offer uses the last word of its controller turn as the cue. `BoardCue.word` can name an earlier word when a more detailed plan is available. The worker keeps separate sentence synthesis streams. TTS word end times are relative to each sentence. The adapter adds the preceding audio duration to each time. A cue clock starts with actual audio output. It advances only through samples forwarded to that output. It releases batches through `maya.board` RPC before the final audio drain. Generating audio does not release a batch. The output adapter uses small frames to bound buffering. It stops its clock on interruption and disconnect. It accounts for gaps when the output runs out of audio.

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
