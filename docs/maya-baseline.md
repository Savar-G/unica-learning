# Maya response baseline (#1139)

Run this on the pre-rebuild call path. The local commands use provider doubles and in-memory stores. They make no model or speech service requests.

```sh
maya_capture=node_modules/.cache-maya-baseline.log
MAYA_BASELINE_LOG=on npm test -- src/lib/maya-chat-streaming.test.ts -t '#1139' --disableConsoleIntercept > "$maya_capture"
MAYA_BASELINE_LOG=on npm run voice:test -- src/call.test.ts src/stream.test.ts -t '#1139' --disableConsoleIntercept >> "$maya_capture"
node scripts/maya-baseline-report.mjs "$maya_capture"
```

The report groups turns by evidence source, mode, turn type, provider, device, network and concurrency. Each group shows all outcomes and the sample size for each phase. The median and p95 use nearest rank. An absent measurement has zero samples and null percentiles. A recorded zero is a measurement. An incomplete request stays in the count.

| Evidence | What it measures |
|---|---|
| Simulated chat | Child input at the call interface to the checked text and board dispatch callbacks and the saved result. Two independent calls run together. One provider double times out. The report counts the timeout even when the fallback succeeds. |
| Simulated voice | A controlled transcription hold, answer and filler playback at the LiveKit worker output, and word-cued and sentence-cued releases to an in-memory board receiver. These checks use a controlled media clock. The worker process profile uses the local runtime clock. |
| Voice worker | With local `MAYA_BASELINE_LOG=on`, the worker emits structured samples at call close. It reports its speech end estimate, final transcript, final-to-turn delay, admission, provider response body, checked sentence, synthesis frames, worker playout and board cue acknowledgement. Rows with either speech provider set to fake carry the simulated label. |
| Device | Reserved for measured useful output, board presentation and interruption stop on the child's device. The local probes do not produce these marks. |

An acknowledgement is filler. Its time is in `workerFiller`. The answer's worker playout is a separate proxy. `workerReply` needs a speech-end estimate. `turnToWorkerReply` uses worker turn admission as its start. `modelFirstChunk` is the first HTTP body chunk. The checked sentence has its own mark. `boardPlanReady` measures staging, and `boardCueAcknowledgement` is the first shown or presented cue's round trip. The worker joins the acknowledgement to the staged turn and batch IDs. Chat dispatch and board acknowledgement do not measure a physical screen update.

Read the intervals on their own clocks. Admission and final-to-turn delay cover different steps. Provider requests, reviews, synthesis and board delivery can overlap. The three request durations use the first request of each role. Do not add these durations to obtain the response time. Process profiles show user and system CPU, event-loop delay, GC pauses, heap use and RSS. The final-to-turn interval includes SDK endpointing and dispatch. A worker scheduler queue measurement still needs a controlled multi-call run. A call that does not reach the worker is outside the worker sample set.

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

- Capture child input and useful output on the same device clock, or measure the offset and its uncertainty. Record the last audible child sound, first useful Maya audio, visible text and board update, and interruption stop. Use the speech cases and matched conditions in #1137.
- Run the same cases on the required device and network groups and at each planned concurrency level. Record requests that fail before reaching the worker, timeouts with and without fallback, aborted turns and incomplete board delivery. Compare the sample sizes and failure rates with latency.
- Measure actual model, review, repair, discarded preparation, STT, TTS and transport usage. Keep estimates and billed amounts separate. Profile the worker under the same concurrent load before proposing a native component.
- Keep the routine targets from #1137 at median below 1,000 ms and p95 below 2,000 ms for useful audible output. Set and record a separate complex-explanation budget from matched device samples before comparing candidates. The fake clocks give no basis for a device budget.

A faster result fails the comparison if it cuts off the child, uses filler as the endpoint, loses a required board update, or excludes failures.

## First matched browser samples

On November 19, 2026, a MacBook M4 Pro ran the existing tutor path and the checked exchange from the source tree of `7c5f92599`. The real admin voice panel and board renderer connected to an isolated LiveKit room on the same machine. Both runs used the same 1.660-second synthetic prompt, AssemblyAI Universal 3.6 Pro and Cartesia Sonic 3.6 through LiveKit Inference. The viewport was 1440 by 900. Each run had one call and one child turn. The clock was the browser performance clock, from the last 20 ms input window above the audio threshold. The audio marks measure energy in the received stream. The board marks measure changes to the rendered SVG.

| Path | First received sound | Next sound | Board changes | Tutor requests |
|---|---:|---:|---|---|
| Existing tutor | 1,191 ms, filler | 2,610 ms | 11,019 ms | One Sonnet 5.5 proposal, four Haiku 5.5 math reviews, two Haiku 5.5 talk reviews |
| Checked exchange | 1,095 ms, answer | 5,676 ms | 3,767 ms and 5,546 ms | Zero model and review requests for this code-written turn |

The transcript matched the synthetic input in both calls. In the checked call, word cues showed five tens and two ones, then four tens and twelve ones. The stored trace records each action once, with the exchange after the starting state. Both calls ended as `child_stopped`. The checked explanation kept the subtraction answer hidden. The browser measurement covers received audio and rendered SVG. It does not independently transcribe the returned audio or measure the physical speaker and display.

These are single observations. Hosted load, physical devices, interruption and false stops, total billed costs, and the complex-turn budget still need measurement. The isolated browser harness had a failed setup attempt when the room expired before the browser joined. It produced no turn timing.

The existing tutor's seven OpenRouter receipts reported USD 0.0243625 for this turn. These receipts exclude speech and transport.

The checked routine chat path at `bf76f87ff` answered “What do I do first?” for the same question in 2,852 ms at the public call interface. It made one Sonnet 5.5 proposal and zero math or talk-review requests. The OpenRouter receipt reported USD 0.021969. This separate chat sample measures one routine turn. It does not measure browser rendering or playback.

At `ddfa6616f`, the actual desk voice controls and board ran in the same isolated setup at a 390 by 844 viewport with reduced motion. The synthetic prompt asked how to regroup. The paper option hid the exchange button. After switching back to the board, Shift+Tab focused the button and Enter submitted the action while Maya was speaking. The receiver retained the first drawing and showed one exchange. The board changed from 27 to 36 paths, and the transcript asked how many ones remained without giving the target answer. The stored trace records the first prompt as interrupted and the child action as shown. The call ended as `child_stopped`. Physical touch and audible stop timing still need measurement.

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
