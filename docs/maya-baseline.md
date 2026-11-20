# Maya response baseline (#1139)

Run this on the pre-rebuild call path. The local commands use provider doubles and in-memory stores. They make no model or speech service requests.

```sh
maya_capture=node_modules/.cache-maya-baseline.log
MAYA_BASELINE_LOG=on npm test -- src/lib/maya-chat-streaming.test.ts -t '#1139' --disableConsoleIntercept > "$maya_capture"
MAYA_BASELINE_LOG=on npm run voice:test -- src/call.test.ts src/stream.test.ts -t '#1139' --disableConsoleIntercept >> "$maya_capture"
node scripts/maya-baseline-report.mjs "$maya_capture"
```

The report groups turns by evidence source, mode, turn type, provider, active teaching settings, device, network and concurrency. Each group shows all outcomes and the sample size for each phase. The median and p95 use nearest rank. An absent measurement has zero samples and null percentiles. A recorded zero is a measurement. An incomplete request stays in the count.

| Evidence | What it measures |
|---|---|
| Simulated chat | Child input at the call interface to the checked text and board dispatch callbacks and the saved result. Two independent calls run together. One provider double times out. The report counts the timeout even when the fallback succeeds. |
| Simulated voice | A controlled transcription hold, answer and filler playback at the LiveKit worker output, and word-cued and sentence-cued releases to an in-memory board receiver. These checks use a controlled media clock. The worker process profile uses the local runtime clock. |
| Voice worker | With local `MAYA_BASELINE_LOG=on`, the worker emits structured samples at call close. It reports its speech end estimate, final transcript, final-to-turn delay, admission, provider response body, checked sentence, synthesis frames, worker playout and board cue acknowledgement. Rows with either speech provider set to fake carry the simulated label. |
| Device | Useful output, board presentation and interruption stop at the child. The in-process probes do not produce these marks. `scripts/maya-baseline-run` produces them for a synthetic child on loopback; `hosted.mjs` produces them in a real browser. |

Append device observations as one `[maya baseline] ` line per attempted turn. Use the device clock for each interval. For example, this fixture records a timeout before any useful output:

```text
[maya baseline] {"v":1,"evidence":"device","mode":"voice","turnType":"routine","provider":"fixture","teaching":"checked-exchange+checked-routine","device":"fixture","network":"loopback","concurrency":1,"outcome":"timeout","ms":{},"counts":{"requestTimeout":1}}
```

The timeout row has no measured useful output. For completed turns, `deviceUseful` is the time from the end of child input to the first useful response. `deviceBoard` uses the same start and ends when the board shows the change. `deviceInterruptionStop` starts at the onset of the child interruption. For voice, use captured audio to identify useful speech and the stop. Older rows without a teaching label form a separate group.

An acknowledgement is filler. Its time is in `workerFiller`. The answer's worker playout is a separate proxy. `workerReply` needs a speech-end estimate. `turnToWorkerReply` uses worker turn admission as its start. `modelFirstChunk` is the first HTTP body chunk. The checked sentence has its own mark. `boardPlanReady` measures staging, and `boardCueAcknowledgement` is the first shown or presented cue's round trip. The worker joins the acknowledgement to the staged turn and batch IDs. Chat dispatch and board acknowledgement do not measure a physical screen update.

Read the intervals on their own clocks. Admission and final-to-turn delay cover different steps. Provider requests, reviews, synthesis and board delivery can overlap. The three request durations use the first request of each role. Do not add these durations to obtain the response time. Process profiles show user and system CPU, event-loop delay, GC pauses, heap use and RSS. The final-to-turn interval includes SDK endpointing and dispatch. A worker scheduler queue measurement still needs a controlled multi-call run. A call that does not reach the worker is outside the worker sample set.

## Repeatable real-audio run

`scripts/maya-baseline-run/` runs whole voice calls with real speech and model providers. It uses a self-hosted LiveKit server, in-memory call stores and a synthetic child process. It reads no database and writes no hosted row. The worker registers as `maya-baseline` on the local server only. It never registers as `maya-voice`, so it cannot take a family call or lose a test room to the Cloud worker. The runner refuses a LiveKit URL that is not a loopback address.

```sh
# 1. A local LiveKit server on 127.0.0.1:7180 (keys: devkey/secret).
livekit-server --config <file with port 7180, bind 127.0.0.1, rtc ports 7181-7189, keys devkey: secret>
# 2. Providers. LiveKit Inference reads the Cloud key only for speech; rooms stay on the local server.
export LIVEKIT_API_KEY="$(security find-generic-password -s unica-livekit-api-key -w)"
export LIVEKIT_API_SECRET="$(security find-generic-password -s unica-livekit-api-secret -w)"
export MAYA_OPENROUTER_API_KEY="$(security find-generic-password -s unica-maya-openrouter -w)"
export MAYA_STT=inference MAYA_TTS=inference MAYA_VOICE_PRIVACY_CONFIRMED=livekit-inference-zdr,child-use-approved
# 3. Calls, one at a time with real speech.
node --conditions=react-server scripts/maya-baseline-run/run.mjs --out <dir> --teaching existing,checked --calls 4
# Worker queue and process load with the speech doubles (no Inference use):
node --conditions=react-server scripts/maya-baseline-run/run.mjs --out <dir> --speech fake --teaching existing --calls 8 --concurrency 8
# 4. Hosted samples: one production admin test call through the Aside browser, test child only.
node scripts/maya-baseline-run/hosted.mjs --out <dir>
# 5. The report, and the two regression cases.
node scripts/maya-baseline-report.mjs <dir>/capture.log
npx vitest run src/lib/maya-text-two-layer-final.test.ts src/lib/maya-practice/tutor-practice.test.ts -t '#1045|#1048'
```

The runner needs macOS (`say` and `afconvert` make the prompts). Each call plays nine child turns from macOS speech at 24 kHz: "What do I do first?", "Can you show me how to regroup?", "four", "four", one second of silence and "teen", "four. no, fourteen", "Why do we have to trade a ten for ten ones?", background speech in another voice 18 dB lower, the regroup question again with "wait, I have a question" played while the answer is audible, and "um", three seconds of silence and "is it thirty four?". "Stop" ends the call by design, so the interruption does not use it. The question is 52 minus 28. The routine and complex labels come from the child's request, not from Maya's reply.

The child and the worker share the machine clock. `inputEnd` is the end of the last loud 10 ms frame that the child sends, plus the audio still in the source queue. The child measures received audio energy in 10 ms frames and merges sounds with gaps under 250 ms. Useful output is the first received sound at or after the worker's answer playout mark. A filler sound before it counts only as `deviceFirstSound`. `deviceBoard` is the receipt of the first accepted board release. `deviceInterruptionStop` is the interruption onset to the end of the sound that it cut. These are loopback receipts, not a browser's playback or a rendered screen. `workerQueue` is the dispatch request to the job's entry. A call that does not report becomes one `failed` row for each planned turn.

Cost rows use the provider receipts (`AI_USAGE_RECEIPT_FILE`) for model and review requests, and the worker's own spend ledger for speech estimates. Transport has no local price. Discarded preparation is already inside the receipts; its rows only show that share.

The Cloud project's LiveKit Inference quota is shared with production. On the Build plan it is 5 STT and 5 TTS connections and USD 2.50 of credits a month (LiveKit docs, read 2026-11-20). The plan of `unica-ai-teacher` was not verified. Run real-speech calls one at a time. Do not run them beside another real-speech run. Check that no family voice call is live first.

## Baseline of November 20, 2026

Source: branch `site/maya-1139-baseline` from `fee7814e6`, on a MacBook M4 Pro (12 cores). Other agents loaded the same machine; the 1-minute load average was 4 to 90 during the runs. The capture is `docs/maya-baseline-runs/2026-11-20.log`; `node scripts/maya-baseline-report.mjs docs/maya-baseline-runs/2026-11-20.log` reproduces every figure below. Median and p95 are nearest rank. "n" counts samples.

**Provider block.** LiveKit Inference returned HTTP 429 to every STT and TTS connection after the first real-speech call. At 2026-11-20T18:03:52Z, one probe connection with retries off returned `Unexpected server response: 429`, while no other real-speech run was active on the machine. A lone refused connection points to a spent monthly allowance, not only to parallel use. The project plan was not verified. Production voice uses the same account. All real-speech and hosted runs stopped there. The real-speech matrix below therefore has one completed call and one failed call.

### Real speech, one call each, self-hosted room

| Path | Turn type | Outcomes | Useful sound at the child (p50 / p95, n) | Worker reply from its speech-end estimate | First checked sentence from turn start |
|---|---|---|---|---|---|
| Checked exchange and routine | Routine | 5 completed | 3,669 / 5,579 ms, n 5 | 2,667 / 3,095 ms, n 5 | 2,128 / 2,491 ms, n 5 |
| Checked exchange and routine | Complex | 3 completed | 3,420 / 3,779 ms, n 3 | 2,842 / 3,131 ms, n 3 | 2,130 / 2,507 ms, n 3 |
| Existing tutor | All 9 | 9 timeouts | none | none | none |

The existing-tutor call failed at its start: Inference returned 429 to both speech services, and the worker ended the call as a provider failure. The child heard no answer. These nine rows stay in the counts as failures.

In the checked call, a routine turn waited for the whole Sonnet 5.5 response before it spoke. Its first checked sentence (2,128 ms) matches the full model request (2,082 ms). The code-written exchange turn needed no model request: 797 ms worker reply and 1,233 ms useful sound at the child. A filler came first in 6 of 8 turns, at 310 to 393 ms on the worker clock.

The child clock was later than the worker's speech-end estimate by 436 to 707 ms on six turns. On the two turns that ended in a number word ("four", and "four. no, fourteen") it was later by 2,912 and 2,874 ms. The worker's reply interval does not include that wait. The number-word hold is the likely cause; it is not proven.

Background speech in another voice, 18 dB below the prompts, produced a final transcript and a Maya reply (1 of 1 calls). The interruption case did not run: the first call used "stop", which ends a call by design, and later calls were blocked. Board display on the child was not measured in the completed call; that build stamped every board message instead of the release, so its board times are left out.

### Hosted worker decision time

Production admin test voice calls from November 12 to 20 (42 calls, test children only) store a time for each child turn and each Maya turn. The Maya time is the moment the full proposal returns. The interval excludes endpointing, synthesis and playback. Streamed speech can start before it ends.

| Child turns | Maya replied next | Another child turn came first | p50 | p95 | Range |
|---:|---:|---:|---:|---:|---:|
| 132 | 127 | 5 | 2,626 ms | 5,368 ms | 0 to 10,585 ms |

No browser sample on the hosted path was taken. The hosted runner (`hosted.mjs`) is written but has not run yet; it waits for Inference to accept connections. Its filler rule (a sound shorter than 1 s followed by a longer one) is a guess until it is checked against worker playout marks.

### Worker queue, CPU, event loop and memory (speech doubles)

These calls use the real model and reviews but the speech doubles, so they use no Inference. The doubles have no voice detector and send silence, so they show the model path and the job scheduler, not the cost of real audio. The 1-minute load average was 48 to 90 during the 8-call batch.

| Parallel calls | Calls that reported | Queue: dispatch to job entry | Turn to worker reply, routine (p50 / p95, n) | Failed turns |
|---:|---:|---|---|---:|
| 1 | 2 of 3 | 253 / 307 ms, n 2 | 2,222 / 5,399 ms, n 12 | 9 |
| 4 | 4 of 4 | 217 / 2,392 ms, n 4 | 2,927 / 4,564 ms, n 25 | 0 |
| 8 | 2 of 8 | 1,375 and 6,060 ms | 1,795 / 9,565 ms, n 12 | 54 |

At 8 parallel calls, 2 child connections timed out (`wait_pc_connection timed out`) and 4 jobs did not connect to their rooms within 10 s. The agent SDK logged "process not scheduled" (CPU contention) and 17 event-loop stalls. The host was already loaded, so this run does not separate Maya's own work from other load. Repeat it on an idle host before drawing a capacity limit.

Per job process, one call used 7.9 to 10.8 s of CPU over 76 to 83 s with the doubles, and 16.1 s over 107 s with real speech (about 15% of one core). Event-loop delay p95 was 12.1 to 17.8 ms. GC paused 98 to 215 times per call, 206 to 1,170 ms in total; the longest single pause was 162 ms. Heap ended at 96 to 130 MB and RSS at 221 to 268 MB.

**Native component:** not proposed. The largest measured waits are remote: the full model response (about 2 s), the number-word hold (about 2.4 s) and the job queue under load. Local CPU is about 15% of a core per call. A GC pause of up to 162 ms is the largest local stall seen; reduce allocation in the call loop before considering a native component.

### Cost and call frequency, measured

| Path | Work | Requests | USD | Basis |
|---|---|---:|---:|---|
| Checked, real speech, 9 turns | Sonnet 5.5 proposals | 8 | 0.0549 | OpenRouter receipts |
| Checked, real speech, 9 turns | Reviews | 0 | 0 | none sent |
| Existing, doubles, 4 parallel, 36 turns | Sonnet 5.5 proposals and repairs, including 35 discarded preparations | 71 | 0.3416 | OpenRouter receipts |
| Existing, doubles, 4 parallel, 36 turns | Haiku 5.5 talk and math reviews (111 talk and 144 math sends by worker count, 91 aborted requests) | 168 | 0.0714 | OpenRouter receipts |
| Real-speech calls | STT, 7.2 call minutes | 2 calls | 0.0720 | Ledger estimate at USD 0.01 a minute |
| Real-speech calls | Transport, 14.4 participant minutes | 2 calls | unknown | Self-hosted; LiveKit Cloud price not applied |

Per turn, the existing tutor sent about 2 Sonnet requests and 4.7 Haiku reviews and cost USD 0.0115 in model work. The checked path sent 0.9 Sonnet requests, no reviews, and cost USD 0.0061. Reviews are counted on refused and aborted attempts. The worker counts 255 review sends against 168 receipts; aborted sends have no receipt. Discarded preparation cost is "unknown" in the worker's own summary, but its requests are inside the receipts. TTS spend was not captured for the completed real call: the ledger seam was added after it ran. The #1045 and #1048 regression cases pass (`-t '#1045|#1048'`, 2 tests).

### Complex-explanation budget

Not set. The budget needs at least five completed complex turns on the existing path with real speech, measured at the child. There are none: the three attempted turns failed on Inference 429. `complexBudget` in `src/lib/maya-baseline.ts` computes it from the capture when those turns exist: the p50 and p95 of useful sound, rounded up to 100 ms, with the failure count as a separate limit. Set it from the next real-speech run.

## Cost and call frequency

These are code defaults and request scopes. Record the actual model, effort, provider and rates for each future measurement run.

| Work | Code default | Scope and frequency |
|---|---|---|
| Lesson proposal | Claude Sonnet 5.5 through OpenRouter, low effort, 1,500 output tokens | The current turn and its teaching brief. Count each physical request, including its repair when it runs. Worker HTTP observations also count each retry they see. The chat probe counts calls to the provider doubles. |
| Free-talk review | Claude Haiku 5.5, minimal effort for conversational turns, 1,000 output tokens | Selected sentences with child input and nearby conversation. Count calls on accepted and refused proposals. |
| Math review | Claude Haiku 5.5 at medium effort. The configured retry defaults to Sonnet 5.5 at low effort. Each permits 1,500 output tokens. | A sentence with its math context. Count additional sends for hedges and retries. #1045 records completed speculative math reviews on a later code-refused attempt. The worker counts sends separately, including those that are still pending or aborted. |
| Discarded preparation | Lesson model and effort | Include discarded work outside the final turn in the call profile. Its cost field separates reported, estimated and unknown amounts. A zero and a missing price are different. Do not add turn discard counts to the call total. |
| STT, TTS and transport | See [Maya spend](maya-spend.md) | The existing ledger estimates STT from covered minutes and TTS from characters. The baseline counts synthesis requests. Match usage and invoices to compare provider spend. Transport charges need separate LiveKit usage data. |

#1048 adds the math review prompt and observed requests to the dry estimate for tutor practice. The estimate uses simulated traffic and a margin. Live repair, review, hedge and retry frequency require measurement. Pending provider requests may still cost money. HTTP 408 and 504 count as worker request timeouts. Client aborts are reported separately because they can have different causes.

## Evidence still required

- Real-speech calls on the existing tutor, and enough complex turns to set the complex-explanation budget. They are blocked while LiveKit Inference returns 429. Rerun `run.mjs --teaching existing,checked --calls 4` one call at a time when a single probe connection succeeds.
- Hosted browser samples (`hosted.mjs`), interruption stop with real speech, false stops and lost child speech, and board display at the child. The background-speech false reply needs more than one sample.
- The same cases on physical phones and tablets and on other networks. No physical device was connected.
- A concurrency run with real speech, and the 8-call batch again on an idle host. Real-speech concurrency needs an Inference plan whose connection limits allow it without touching production calls.
- TTS characters from the ledger for a real call, billed Inference usage, and LiveKit Cloud transport usage.
- Keep the routine targets from #1137 at median below 1,000 ms and p95 below 2,000 ms for useful audible output. The checked routine turn measured 3,669 / 5,579 ms at the child (n 5), so the current path does not meet them.

A faster result fails the comparison if it cuts off the child, uses filler as the endpoint, loses a required board update, or excludes failures.

## First matched browser samples

On November 19, 2026, a MacBook M4 Pro ran the existing tutor path from the source tree of `7c5f92599`. That commit does not contain the checked exchange (#1143, `29cca6dfd`). The checked run needed #1143 at `29cca6dfd` or a later commit. Its exact source commit was not recorded. The real admin voice panel and board renderer connected to an isolated LiveKit room on the same machine. Both runs used the same 1.660-second synthetic prompt, AssemblyAI Universal 3.6 Pro and Cartesia Sonic 3.6 through LiveKit Inference. The viewport was 1440 by 900. Each run had one call and one child turn. The clock was the browser performance clock, from the last 20 ms input window above the audio threshold. The audio marks measure energy in the received stream. The board marks measure changes to the rendered SVG.

| Path | First received sound | Next sound | Board changes | Tutor requests |
|---|---:|---:|---|---|
| Existing tutor | 1,191 ms, filler | 2,610 ms | 11,019 ms | One Sonnet 5.5 proposal, four Haiku 5.5 math reviews, two Haiku 5.5 talk reviews |
| Checked exchange | 1,095 ms, answer | 5,676 ms | 3,767 ms and 5,546 ms | Zero model and review requests for this code-written turn |

The transcript matched the synthetic input in both calls. In the checked call, word cues showed five tens and two ones, then four tens and twelve ones. The stored trace records each action once, with the exchange after the starting state. Both calls ended as `child_stopped`. The checked explanation kept the subtraction answer hidden. The first browser measurement covers energy in the received stream and changes to the rendered SVG.

A second checked browser call at `9b6c5305b` captured 216,680 bytes from the received audio track. AssemblyAI transcribed that capture and confirmed the five tens and two ones, the trade of one ten for ten ones, and the four tens and twelve ones that still make 52. The target answer remained hidden. The receiver again showed each action once.

These are single observations. Hosted load, physical devices, interruption and false stops, total billed costs, and the complex-turn budget still need measurement. The isolated browser harness had a failed setup attempt when the room expired before the browser joined. It produced no turn timing.

The existing tutor's seven OpenRouter receipts reported USD 0.0243625 for this turn. These receipts exclude speech and transport.

The checked routine chat path at `bf76f87ff` answered “What do I do first?” for the same question in 2,852 ms at the public call interface. It made one Sonnet 5.5 proposal and zero math or talk-review requests. The OpenRouter receipt reported USD 0.021969. This separate chat sample measures one routine turn. It does not measure browser rendering or playback.

At `ddfa6616f`, the actual desk voice controls and board ran in the same isolated setup at a 390 by 844 viewport with reduced motion. The synthetic prompt asked how to regroup. The paper option hid the exchange button. After switching back to the board, Shift+Tab focused the button and Enter submitted the action while Maya was speaking. The receiver retained the first drawing and showed one exchange. The board changed from 27 to 36 paths, and the transcript asked how many ones remained without giving the target answer. The stored trace records the first prompt as interrupted and the child action as shown. The call ended as `child_stopped`. Physical touch and audible stop timing still need measurement.

## Touch input check for #1142

On November 19, 2026, Safari on an iPhone 17 Pro simulator ran the desk chat controls and board at `65c1ff411`. The local harness used synthetic input, a model double, and the public Maya call interface with an in-memory store. A simulator tap on **Exchange one ten** changed the visible board from five tens and two ones to four tens and twelve ones. Maya said the total was still 52 and asked how many ones remained. The board and reply kept the target answer hidden. In a first run, **Use paper** hid the action, and **Use board** restored it.

The touch request included the lesson, turn, board revision, and object. The result advanced one session revision and added one drawing. Replaying the request at its original revision returned the same board with no extra drawing or reply. The saved end-of-call trace passed validation. This check covers touch input in simulator Safari. It leaves physical-device playback and interruption timing to the release and voice checks.

## Speech synthesis sample for #1148

The installed LiveKit Inference SDK sent two fixed regrouping sentences to Cartesia Sonic 3.6. Three trials used two parallel streams, one per sentence. Three trials used one stream with the second sentence submitted 700 ms after the first. All six returned 13 timed words. The one-stream trials used one segment with increasing word times and returned audio before the second sentence was submitted.

| Synthesis | SDK streams per reply | First frame samples (ms) | Aligned sentence gap samples (ms) |
|---|---:|---|---|
| Separate | 2 | 542, 194, 198 | 159, 239, 159 |
| One stream | 1 | 196, 199, 194 | 260, 158, 205 |

The one-stream trials had a longer median aligned gap. The sample covers provider output before the worker trims and plays the frames. It leaves the audible gap, board fallback, cancellation, reconnect, and billed cost comparisons open.

## Matched routine-turn probe (#1140)

```sh
MAYA_BASELINE_LOG=on npm test -- src/lib/maya-checked-routine.test.ts -t '#1110' --disableConsoleIntercept > node_modules/.cache-maya-routine.log
node scripts/maya-baseline-report.mjs node_modules/.cache-maya-routine.log
```

The probe uses the same fake proposal, reviewer responses, package and child input in both policies. It alternates the order of parent and candidate across three pairs per mode and review response. The parent path runs with the candidate off. The `held` case reproduces the historical false review refusal. The candidate discards the historical explain-back and gives the currently approved solved reply. Compare request counts, not parity of the historical and current wording. `voiceCallFinished` ends at the public voice call's return, not synthesis or playback. `chatFinished` ends at the public chat call's return. Both include in-process work with fakes and neither establishes device latency.
