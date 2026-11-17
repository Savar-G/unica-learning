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

A faster result fails the comparison if it cuts off the child, uses filler as the endpoint, loses a required board update, or excludes failures. The credit hold leaves all device and hosted criteria open.

## Matched routine-turn probe (#1140)

```sh
MAYA_BASELINE_LOG=on npm test -- src/lib/maya-checked-routine.test.ts -t '#1110' --disableConsoleIntercept > node_modules/.cache-maya-routine.log
node scripts/maya-baseline-report.mjs node_modules/.cache-maya-routine.log
```

The probe uses the same fake proposal, reviewer responses, package and child input in both policies. It alternates the order of parent and candidate across three pairs per mode and review response. The parent path runs with the candidate off. The `held` case reproduces the false review refusal, so a parent fallback and the candidate's accepted question are different outputs. Compare request counts in both cases, and use the `pass` case for matching output. `voiceCallFinished` ends at the public voice call's return, not synthesis or playback. `chatFinished` ends at the public chat call's return. Both include in-process work with fakes and neither establishes device latency.
