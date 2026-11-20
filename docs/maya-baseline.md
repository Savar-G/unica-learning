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

The child and the worker share the machine clock. `inputEnd` is the end of the last loud 10 ms frame that the child sends, plus the audio still in the source queue. The child measures received audio energy in 10 ms frames and merges sounds with gaps under 250 ms. The worker reports each playout of its audio output (start and finish events, machine clock), and the child matches received sound to those playouts by the onset of the first sound still heard after the answer's playout start:

- An onset before the answer's playout start is not the answer's (the sound began earlier). The turn is `ambiguous`.
- An onset inside another playout's arrival window is `ambiguous`. That window runs from the playout's start to its finish plus its own transit bound: the delay from its start to the first sound that starts during it, or 250 ms when no sound starts during it. Each playout has its own bound; a later playout never sets the bound of an earlier one.
- Any other onset is the answer's, and useful time runs to it. A later playout that merges into the same sound does not change the onset.

Before each prompt, the child waits for the reply to the last one. The worker reports, while the call runs, when each answer starts to play and when each playout starts and finishes. The child speaks again when this turn's answer has started, every playout since then has finished and 2 s passed with no playout and no received sound. Filler alone never ends the wait, because an answer can come many seconds after it. A turn with no answer waits for the full timeout (25 s; 10 s after background speech). The opening waits for its playouts only. The hosted run has no worker reports and still uses the sound-only rule.

An ambiguous turn has no useful time, is kept out of the percentiles and is counted on its own in the report and the budget, never as completed or failed. A filler sound counts only as `deviceFirstSound`.

Known limits: the rule trusts each playout's onset delay as its transit bound, so a playout whose tail arrives later than its onset (network jitter) can still be taken for the answer. A playout with no heard onset widens its window to 250 ms, which turns more turns ambiguous. The worker's playout events mark when frames enter the room's output, not when the child hears them. `deviceBoard` is the receipt of the first accepted board release. `deviceInterruptionStop` is the interruption onset to the end of the sound that it cut. These are loopback receipts, not a browser's playback or a rendered screen. `workerQueue` is the dispatch request to the job's entry.

Each call records each of its nine planned turns once as a device row: the observed turn, or a `failed` row when the dispatch was refused, the room did not connect or the call stopped before that turn. A call whose worker never reports also gets a `failed` worker row for each planned turn. All rows of a run carry the provider label that the runner resolves before the first call, so failures stay in the same group as successes. `cases.jsonl` keeps each step's raw device observation (input end, sounds, the answer's playout mark, the other playouts, board receipt and interruption onset), so a later classifier can run again on the same call.

The runner removes every `SUPABASE*` setting and `LIVEKIT_AGENT_NAME_OVERRIDE` from the environment before the worker starts, and it stops when the server options do not resolve to `maya-baseline`. The worker's AI usage is local-only: each receipt goes to the job's receipt file and never to the hosted ledger, even when a secret key is in the shell.

Cost rows use the provider receipts for model, repair and review requests, each with its request role and the reasoning effort that its request body asked for. Speech estimates come from the worker's own spend ledger and name the speech providers that the run resolved. Transport has no local price. Discarded preparation is already inside the receipts; its rows only show that share, with an unknown effort.

The complex budget comes from one cohort (the same providers, device and network) that can measure useful output, which means that it has answer playout marks. Hosted rows have no such mark, so their timeouts never enter the loopback denominator. When several cohorts can measure useful output, name one (`complexBudget(turns, cohort)`). A named cohort is always used as named, even when none of its turns measured useful output.

The Cloud project's LiveKit Inference quota is shared with production. Since November 20, 2026 the project is on the Scale plan with 50 concurrent connections each for `cartesia/sonic-3.6` and `assemblyai/universal-3-6-pro`. Check that no family voice call is live first, and keep the machine's 1-minute load under 12. Make one probe connection before a run; stop on any HTTP 429. If a room connection times out (`wait_pc_connection`), the server has no UDP candidate the client can reach: use `rtc.udp_port` and no fixed `node_ip`.

## Baseline of November 20, 2026

Source: branch `site/maya-1139-baseline` from `fee7814e6`, on a MacBook M4 Pro (12 cores). Two raw logs hold every row; the report reproduces every figure below.

```sh
node scripts/maya-baseline-report.mjs docs/maya-baseline-runs/2026-11-20-real.log  # real speech, hosted call, concurrency
node scripts/maya-baseline-report.mjs docs/maya-baseline-runs/2026-11-20.log       # first real call, speech doubles under load
```

Median and p95 are nearest rank. "n" counts measured samples; failed turns are listed beside them. Useful sound is measured at the synthetic child on the machine clock. The 1-minute load average at the end of each real-speech call was 1.97 to 4.83. `2026-11-20-real-cases.jsonl` holds the case rows of the 19 loopback calls in `2026-11-20-real.log`, in the same order.

**Classification of these rows.** The device rows of November 20 were classified at run time by the earlier rule: the first sound that started no earlier than 50 ms before the answer's playout mark. That rule can count a filler as useful when the filler starts in those 50 ms, and it counts a filler that runs into the answer as unanswered. The runs kept no raw sounds, so the rows cannot be classified again. A check against the case rows: of the 23 unanswered loopback device turns, 22 had no answer playout at the worker. One complex turn at 8 calls had an answer playout mark, so it may be a filler that ran into the answer. The filler-before-the-mark error cannot be checked from these rows, and these rows have no `ambiguous` outcome. Later runs keep the raw observations in `cases.jsonl` and use the playout matching above.

**Provider history.** At 2026-11-20T18:03:52Z, LiveKit Inference refused a single connection with HTTP 429. After the project moved to the Scale plan, single STT and TTS probes succeeded at 18:28:13Z and 18:28:14Z. LiveKit then raised both models to 50 concurrent connections. No real-speech run after that saw a 429. Runs before the fix are kept apart: one existing-path call that failed on 429 (in `2026-11-20.log`), five calls that failed to connect after a reboot changed the LAN address, and one call that the runner cut short with a 2-second wait. None of those is in `2026-11-20-real.log`.

### Real speech, one call at a time

| Path | Turn type | Turns | Answered | Useful sound at the child (p50 / p95, n) | Worker reply from its speech-end estimate |
|---|---|---:|---:|---|---|
| Existing tutor | Routine | 18 | 15 | 4,803 / 8,308 ms, n 15 | 2,484 / 7,720 ms, n 17 |
| Existing tutor | Complex | 9 | 7 | 2,764 / 3,545 ms, n 7 | 2,288 / 2,988 ms, n 7 |
| Checked exchange and routine | Routine | 12 | 11 | 4,713 / 6,223 ms, n 11 | 2,817 / 4,959 ms, n 11 |
| Checked exchange and routine | Complex | 6 | 6 | 3,090 / 3,610 ms, n 6 | 2,568 / 3,097 ms, n 6 |

Three existing-path calls and two checked calls. A turn without an answer is one where Maya stayed silent for 6 s after her filler, so the child spoke again; the worker records it as interrupted. No routine turn had useful sound within 2 s at the child. Of the 148 completed loopback turns in `2026-11-20-real.log` (19 calls), only 2 were under 2 s: two checked-path complex turns at one call, 1,223 and 1,290 ms. The first-call log `2026-11-20.log` has one more checked-path complex turn under 2 s, at 1,233 ms. None was under 1 s. The #1137 routine targets (median below 1,000 ms, p95 below 2,000 ms) are not met by either path.

Where the time goes, on the worker clock, one call at a time (both paths, n 56): the speech-to-text final arrives 251 ms (p50) after the worker's speech-end estimate, and the worker takes the turn 104 ms later. The first checked sentence follows at 1,939 ms (p50, existing path) and 2,163 ms (checked path) after the turn; the Sonnet 5.5 request itself takes 2,132 ms (p50, n 46). A filler plays at 339 ms (p50, n 40) on the worker clock. In the first call (`2026-11-20.log`, worker and device rows paired in order), the child's useful time exceeded the worker's reply interval by 2,912 ms on "four" and 2,874 ms on "four. no, fourteen", and by 436 to 707 ms on the other six turns. The number-word hold is the likely cause and is not proven.

The existing path sent 36 talk reviews and 49 math reviews over 21 routine turns, and 35 of its requests were aborted. The checked path sent no review request. The checked exchange board showed its change 3,976 and 4,000 ms after the child stopped (n 2); the cue waits for the spoken exchange. Board display for the existing path was seen once (12,665 ms).

**Interruption.** "Wait, I have a question" was played while the answer was audible in 16 of 19 calls (case rows). Across all real runs, Maya's sound stopped 331 ms (p50) and 382 ms (p95) after the interruption onset, n 16. The #1137 target is p95 within 300 ms. Seven of the 16 stops were under 200 ms; some of those may be a natural pause in Maya's speech, because sounds merge only across gaps under 250 ms. False stops and lost child speech were not measured.

**Background speech.** Another voice, 18 dB below the child, produced a worker turn and a Maya sound before the next prompt in 19 of 19 calls; the worker played an answer in 18 of them (case rows).

### Real speech, 2, 4 and 8 calls at once (existing tutor)

| Calls at once | Load (1 min) | Calls that reported | Routine useful (p50 / p95, n of turns) | Complex useful (p50 / p95, n of turns) | Queue: dispatch to job entry |
|---:|---|---:|---|---|---|
| 1 | 2.9 to 4.8 | 3 of 3 | 4,803 / 8,308 ms, 15 of 18 | 2,764 / 3,545 ms, 7 of 9 | 217 / 221 ms, n 3 |
| 2 | 2.1 | 2 of 2 | 4,628 / 7,541 ms, 10 of 12 | 2,888 / 7,318 ms, 5 of 6 | 220 / 221 ms, n 2 |
| 4 | 2.0 to 2.4 | 4 of 4 | 4,619 / 5,976 ms, 23 of 24 | 3,060 / 7,460 ms, 9 of 12 | 229 / 231 ms, n 4 |
| 8 | 2.9 to 3.5 | 8 of 8 | 4,345 / 5,624 ms, 44 of 48 | 2,574 / 7,655 ms, 18 of 24 | 222 / 313 ms, n 8 |

Routine useful time did not grow with concurrency: the p95 fell from 8,308 ms at one call to 5,624 ms at 8. Complex useful time did grow: its p95 rose from 3,545 ms at one call to 7,318, 7,460 and 7,655 ms at 2, 4 and 8 calls, while its median stayed between 2,574 and 3,060 ms. The worker's own complex reply p95 rose the same way (2,988 ms to 6,702, 6,912 and 7,798 ms), so the added time is before playout. Unanswered complex turns grew from 2 of 9 to 6 of 24. The complex samples are small (n 5 to 18), and the cause is not identified. Load is the load average at the end of each call. The earlier 8-call run with the speech doubles, on a host at load 48 to 90, failed 6 of 8 calls at connection; that result reflects host contention.

### Process profile and the native-component question

With real speech, one job process used 15.4 to 32.7 s of CPU over 117 to 177 s of call (about 10 to 20% of one core). Event-loop delay p95 was 11.3 to 12.1 ms. GC paused 249 to 402 times per call, 193 to 417 ms in total; the longest pause was 30 ms. RSS ended at 253 to 332 MB. These figures did not change between 1 and 8 calls at once. The 162 ms GC pause in the earlier run came from the heavily loaded host.

**Native component:** not proposed. The large waits are remote and in the turn design: the full model request (about 2 s) before the first checked sentence, the reviews on the existing path, the 6 s silences after a filler, and the number-word hold. Local CPU, event-loop delay and GC pauses are small and flat under 8 concurrent calls. The rise in complex p95 under concurrency is not explained by these local figures.

### Hosted admin test call

One production admin test call (test child, 52 − 28), through the Aside browser on home Wi-Fi, at 2026-11-20T19:13Z. The stored trace showed that the call ended as `child_stopped` after 57 s, with two child turns and two Maya replies; that trace is in the production database, not in this repository. First sound at the browser was 1,131 ms (routine) and 1,194 ms (complex). Useful sound is not measured on the hosted path: no worker playout mark reaches the browser clock, so a filler cannot be told from the answer. That call also used a 2-second wait, so its second prompt may have cut the first answer short. The runner now uses the 6-second rule and keeps every sound.

The stored production traces of test calls from November 12 to 20 (42 calls) give the hosted worker's decision time: child turn record to the full Maya proposal. Over 132 child turns, 127 got a reply, p50 2,626 ms, p95 5,368 ms. This excludes endpointing, synthesis and playback. **Not reproducible from this repository:** the query read the production database, and its rows are not committed.

### Cost and call frequency, measured

| Run | Work | Requests | USD | Basis |
|---|---|---:|---:|---|
| Existing, 3 calls, 33 worker turns | Sonnet 5.5 proposals and repairs, including 45 discarded preparations (these receipts do not separate repairs) | 63 | 0.3042 | OpenRouter receipts |
| Existing, 3 calls | Haiku 5.5 talk and math reviews (72 talk and 103 math sends by worker count, 68 aborted) | 120 | 0.0523 | OpenRouter receipts |
| Checked, 2 calls, 23 worker turns | Sonnet 5.5 proposals | 18 | 0.0843 | OpenRouter receipts |
| Checked, 2 calls | Reviews | 0 | 0 | none sent |
| Existing, 3 calls | STT 7.4 min; TTS | 3 each | 0.0743; 0.0965 | Ledger estimates |
| Checked, 2 calls | STT 4.0 min; TTS | 2 each | 0.0401; 0.0473 | Ledger estimates |
| All real calls | Transport | 19 calls | unknown | Self-hosted; LiveKit Cloud price not applied |

These receipts predate the request role and effort fields, so each of their rows has the effort `code-default`. Per worker turn, the existing tutor cost USD 0.0108 in model work (1.9 Sonnet requests and 3.6 Haiku receipts), and the checked path cost USD 0.0037 (0.8 Sonnet requests, no reviews). Speech estimates add about USD 0.0052 per turn on the existing path. The worker counts more review sends than receipts because aborted sends have no receipt. Discarded preparation cost is inside the receipts; the worker's own summary has no price for it. The #1045 and #1048 regression cases pass (`-t '#1045|#1048'`, 2 tests).

### Complex-explanation budget

From the one-call existing-path runs: **useful sound at the child within 2,800 ms at the median and 3,600 ms at p95**, with no more than 2 of 9 complex turns unanswered (the baseline failure rate). `complexBudget` computes it from `2026-11-20-real.log`, in the loopback cohort (the only cohort with answer playout marks; the hosted rows are left out). It uses one-call runs only and rounds up to 100 ms. These rows carry the classification limit above. A candidate must meet both percentiles and must not answer fewer complex turns.

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

- Physical phones and tablets, and other networks. No physical device was connected; the device rows are a synthetic Node child on loopback and one Mac browser.
- Useful sound on the hosted path. It needs a worker playout mark that reaches the browser, or captured audio that is transcribed, to tell the filler from the answer.
- False stops and lost child speech during interruption, and the stops under 200 ms checked against captured audio.
- Board display in a real browser for each turn, not only the loopback board release.
- Billed Inference usage and LiveKit Cloud transport usage, to compare with the ledger estimates.
- The routine targets from #1137 (median below 1,000 ms, p95 below 2,000 ms for useful audible output) are not met. The interruption target (p95 stop within 300 ms) is not met: 382 ms, n 16.

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
