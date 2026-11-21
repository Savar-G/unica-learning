# Maya voice: end of turn, numbers heard two ways, and loaded settings (#1146)

Part of spec #1137. This page records three things: the end-of-turn settings that the comparison round measured, how Maya confirms a spoken number that the speech-to-text can hear two ways, and how a worker reports the settings that it actually loaded.

## Production defaults stay the same

This work changes no production default. Savar decides the production settings after a measurement on the LiveKit Cloud `staging` deployment. The values below are recommendations for staging only.

| Setting | Production default (unchanged) | Staging recommendation |
|---|---|---|
| `MAYA_STT_MODEL` (Inference) | `assemblyai/universal-3-6-pro` | `assemblyai/assemblyai-stt-3-7-realtime-agent` |
| `MAYA_STT_VOICE_FOCUS` | unset | `near-field` |
| `MAYA_TURN_MIN_DELAY_MS` | 100 | 0 |
| `MAYA_STT_MAX_SILENCE_MS` | 1600 | 1400 |
| `MAYA_STT_NUMBER_SILENCE_MS` | 2500 | 1400 |

`voiceTuning()` requires `MAYA_STT_NUMBER_SILENCE_MS` to be at least `MAYA_STT_MAX_SILENCE_MS`, so the two 1400 values go together. Secrets on the LiveKit Cloud project are shared by all deployments, so do not write these values to a Cloud secret. Pass them to the staging worker only.

## What the comparison round measured (2026-11-20)

Source: draft PR #1207 and the shared notes `voice-comparison-notes.md`. Self-hosted `livekit-server --dev` on Savar's MacBook, real LiveKit Inference speech, synthetic child audio, checked path, 2 calls per row (18 planned turns and 2 background clips), one call at a time.

| Row | Useful sound p50 / p95, all turns (ms) | Number-ending turns p50 / p95 (ms) | Final to turn p50 (ms) | Split or lost "four [1 s] teen", "four. no, fourteen" | Wrong number transcripts | Replies to a background voice |
|---|---|---|---|---|---|---|
| Baseline (3.6 Pro, delay 100, max 1600, number 2500) | 3,716 / 6,046 (n 17) | 4,676 / 6,046 (n 8) | 102 | 0 | 1 of 10 ("Four teen.") | 2 of 2 |
| 3.6 Pro, delay 0, max 1400, number 1400 | 3,889 / 5,854 (n 17) | 4,337 / 4,858 (n 8) | 4 | 0 | 1 of 10 ("Four teen.") | 2 of 2 |
| 3.7, delay 0, max 1400, number 1400 | 3,369 / 4,809 (n 18) | 4,596 / 4,809 (n 8) | 4 | 0 | 0 of 10 | 2 of 2 |
| 3.7 near-field, delay 0, max 1400, number 1400 | 3,391 / 5,411 (n 18) | 4,381 / 5,411 (n 8) | 4 | 0 | 0 of 10 | 0 of 2 |

- Normal and number turns are reported separately. Number-ending turns are the slowest group in every row, because AssemblyAI holds a turn that ends in a number word until `max_turn_silence`.
- 1200 ms was also tried. One call dropped on an upstream WebSocket error, and the clean call showed no gain over 1400 ms with only 200 ms of margin above a 1000 ms pause. 1400 ms is the shortest value with no split.
- The sample is small (n 8 for number turns). Treat the p95 values as a direction, not a measure. The staging run must repeat it with more calls.

## A number heard two ways is confirmed before credit

The speech-to-text gives one transcript. Two cases can give the wrong number:

- **A sound-alike number.** "Fourteen" and "forty", "sixteen" and "sixty", and the same numbers in digits ("14" and "40"). In the comparison round, AssemblyAI gave a clearly spoken lone "fourteen" a confidence from 0.63 to 0.86 (n 17, all correct transcripts). So confidence does not separate "fourteen" from "forty".
- **A teen split by a pause.** "four [pause] teen" came back as "Four teen." in 2 of 27 number transcripts on the 3.6 Pro model, and in 0 of 40 on 3.7.

The rule (`childTurnFrom` in `src/lib/maya-voice.ts`, with `src/lib/maya-voice-heard.ts`):

- A short turn (4 words or fewer) with a sound-alike number and a confidence below `SOUND_ALIKE_CONFIDENCE` (0.9) gets the partner as another reading ("Fourteen." also reads "Forty."). A number that goes on ("forty-six", "forty six"), a decimal ("40.5") and a longer sentence are left alone.
- A split teen ("four teen", "six-teen", "fif teen") is uncertain at any confidence, with two readings: the teen and the first word ("Fourteen.", "Four.").
- The worker now sends the other readings with the turn even when no part was below `UNSURE_CONFIDENCE` (0.6). Before, it sent them only for an uncertain turn.

What the session does (`src/lib/maya/session.ts`):

- A turn with another reading earns no credit. Maya may confirm ("Did you say 16?" or "16 or 60?").
- The confirm is offered also when the turn's own reading answers another step and its other reading answers the current one. Example: on 27 + 39, "Six teen." reads as 6 (the tens total), and its other reading 16 is the ones step.
- A plain yes credits the number that Maya named. A plain repeat of that number ("Sixteen.") also credits it, though the speech-to-text hears it two ways again. Without this, a child who said "sixteen" twice would be asked a third time. A repeat that is a split teen again is still uncertain.

Cost: every lone sound-alike answer below 0.9 now gets one confirm turn. On the comparison data that is every lone "fourteen". The confirm protects the credit. It does not make the turn shorter.

Tests: `src/lib/maya-voice.test.ts` ("what the child said"), `src/lib/maya/controller-fixes.test.ts` ("#1146 a step answer heard two ways is confirmed before credit") and `worker/maya-voice/src/call.test.ts` ("a spoken number the speech-to-text could hear two ways", through the worker's LiveKit pipeline with the fake speech-to-text).

## The settings a worker loaded

At the start of each call the worker logs one line (`worker/maya-voice/src/loaded-settings.ts`):

```
[maya voice] loaded settings {"callId":"...","stt":{...},"tts":{...},"turn":{...},"problems":[]}
```

- The values are read back from the objects the worker built, not from the configuration: the speech-to-text model, `min_turn_silence`, `max_turn_silence`, `voice_focus` and the number of keyterms; the voice model and voice id; and the LiveKit session's resolved turn detection, endpointing delays and interruption options.
- `problems` names each value that differs from the configuration, for example `speech-to-text max_turn_silence is 2500, not 1400`. A difference also logs a warning.
- No key or secret is read. The keyterms are counted, not logged, because they are the call's numbers.
- The baseline harness (`scripts/maya-baseline-run`) gets the same report from its worker, writes it to `cases.jsonl` as `settings`, and exits with code 1 when a call's worker loaded other settings or reported none.
- Limit: the direct AssemblyAI plugin keeps its options in a private field, so on that route only the model shows. Production uses LiveKit Inference, where every value shows.

## Not verified

- No real-audio run of the confirm step yet (budget hold on 2026-11-20). The rule is tested with the fake speech-to-text and the session. The next real run should add a "sixteen" or "fourteen" answer case and count confirms and false credits.
- No staging run on LiveKit Cloud with the recommended settings.
- No physical phone or tablet.
