# Maya voice architecture: independent research report

Research date: 2026-11-04. Researcher: Codex research sub-agent.

## Recommendation

**Keep LiveKit Cloud and the code-controlled STT -> teaching controller -> TTS architecture. Keep AssemblyAI Universal-3.6 Pro and Inworld TTS-2 as the first test. Prefer LiveKit Inference for these two services if its real Node output passes the existing timing contract. Compare Eleven v4 Turbo before choosing Maya's final voice.**

Do not replace this system with unrestricted native speech-to-speech. The best available evidence does not establish an exact-speech, pre-release review, word-timing, and cancellation contract for those models. GPT-Live explicitly permits paraphrase. This conflicts with D-195. Its independent conversational results make it a useful adult comparison, not an approved teaching voice. [S10][S11][S12]

The current architecture does not prevent a strong human impression. The largest likely problems are incorrect recognition of a child's answer, premature turn endings, delays in the controller and review, and speech that continues after an interruption. Better TTS alone cannot correct these problems. This is an engineering judgement, not a result from a Maya call.

## Scope and evidence limits

- I read the four named local research files and the current voice design from `origin/main`.
- The source snapshot was `5584bf9b036db5533b62376337c4439e2062a02d`.
- I read the worker's `agent.ts`, the Maya model input and prompt, the AI client, and the OpenRouter request adapter at that snapshot.
- The checked source uses completed STT turns, disables preemptive generation, and sends accepted words through `session.say`. The source default LLM is `anthropic/claude-sonnet-5.5`. The runtime `AI_MODEL` value was not inspected.
- The board documentation now describes word cues, an audio-output clock, sentence fallback, cancellation, and receiver history. Its earlier paragraph saying that timing is future work is stale within the same document. I used the later detailed timing section and the brief's current-state description.
- I read D-195, D-196, and D-197. Separate D-162 and D-163 rows were absent from the supplied decision file and the current tracked file. D-183 refers to D-162's earlier no-chat choice and reverses it. I used the brief's explicit D-163 configuration requirement.
- I made no inference calls, opened no accounts, ran no child audio, and changed no repository files. This report is research, not runtime acceptance.

Keenable search was the first web search tool. I fetched the primary pages used below. All source references were checked on **2026-11-04**, unless a reference states a weaker search-index-only status. An undated page has a read date, not an invented publication date. Vendor latency figures are labelled as such. No paid research or provider trial was used.

## Ranked options

The costs below use the source-default-model scenario in the cost section. They are estimates at 120 connected minutes per month. They exclude plan minimum allocation, taxes, extra reasoning tokens, retries, and special child-use contracts. The first-audio ranges are **proposed test ranges**, not measured provider results. They apply to a complete checked math response, from the child's last sound to audible speech. Free talk has an additional review stage.

| Rank | Option | First audio and feel | Estimated CAD/month | D-195 fit | Operating burden |
| --- | --- | --- | ---: | --- | --- |
| 1 | LiveKit Cloud + AssemblyAI U3.6 Pro + existing controller + Inworld TTS-2; prefer Inference for STT/TTS | Test for roughly 0.9-2.0 s on math turns. Warm, directed TTS; natural turn handling still needs tuning. No Maya measurement exists. | 12.73 uncached; 7.94 in the stated cache scenario | Strong input-text control and word times. Audible numbers still need testing. | Lowest change. One Cloud service can cover transport, worker, STT and TTS. Existing OpenRouter remains separate. |
| 2 | Same controller and STT, with Eleven v4 Turbo | Same end-to-end test range. Strongest adult blind-listening evidence among these voices. About 100 ms vendor median inference claim excludes the rest of the call. | 13.63 uncached | Plausible; exact v4 Turbo alignment and cancellation adapter must pass. | Medium. Direct account, separate retention agreement, Text to Dialogue WebSocket adapter. |
| 3 | Same controller and STT, with Cartesia Sonic 3.6 | Same end-to-end test range. Strong adult naturalness evidence; supports timing and delivery controls. No Maya measurement exists. | 14.24 uncached | Strong text and timing interface; pronunciation still needs testing. | Low to medium through LiveKit Inference. Lower change than replacing orchestration. |

These are ranked **feasible teaching architectures**, not a ranking of all voice demos. If Eleven v4 Turbo wins clearly in the controlled test and its privacy terms are acceptable, use it. Its estimated variable premium over Inworld is only **CAD 0.91 per child per month** in this scenario. A contract minimum can change that conclusion. [S01][S05][S06][S07][S08][S09]

ElevenLabs is not an available LiveKit Inference substitute in the current provider guide. That guide says its Inference service ended on August 31, 2026; the direct plugin remains. Do not transfer the gateway's ZDR promise to this direct route. [S66]

## 1. The architecture constraint that decides the choice

D-195 requires code to own every math sentence and work instruction. D-197 requires both code checks and a separate AI review before free talk is heard. A natural voice that can add words before those checks does not satisfy either rule.

Separate these four controls:

1. **Words:** Does the service synthesize supplied text, or generate its own reply?
2. **Permission to speak:** Can the application keep all reply audio unheard until checks pass?
3. **Timing:** Does it return alignment for the actual synthesized audio?
4. **Cancellation:** Can the application stop playback, invalidate pending board work, and remove unheard output from conversational state?

An output transcript does not establish the words a child heard. A server-generated timestamp does not establish when a browser speaker played a word. A tool call does not establish that a related digit was visible at that instant.

### Architecture comparison

| Architecture | Exact code text and review before speech | Board timing | Interruption and waiting | Decision |
| --- | --- | --- | --- | --- |
| STT -> controller -> TTS | The application selects and checks text before synthesis. TTS can still omit or mispronounce words. | Inworld and Cartesia return alignment. Eleven provides alignment interfaces that require model-specific checks. | Transport handles audio; code handles the lesson state, writing waits and deadline. | Best fit. |
| OpenAI Realtime, including `gpt-realtime-2.1-mini` | Automatic response creation can be disabled. Application-triggered responses improve control. I found no documented forced literal-read contract for arbitrary code lines. | No supported output word-alignment contract was established in the pages read. | `response.cancel` and `conversation.item.truncate` are documented. | Useful comparison. Not a demonstrated D-195 substitute. [S13][S14] |
| OpenAI GPT-Live-1 | Backend output can be paraphrased. The model can keep speaking while the application reviews a backend result. | No board-ready output word-alignment guarantee was established. | Full duplex; interruption does not automatically cancel backend work. | Strong conversational comparison; conflicts with the current speech gate. [S10][S11] |
| Gemini 3.8 Live | Native audio replies and tools. No exact-read or pre-speech content-approval guarantee was established. | Transcription is available; that does not establish generated-speech word timing. | Barge-in and VAD are documented. Writing waits still need application policy. | Developer API age terms exclude this product. Cloud is a separate contract question. [S15][S16] |
| Amazon Nova 2.5 Sonic | Released October 5, 2026. AWS documents improved native speech and tools. No exact-read contract was established. | No output word timing contract was established. | Native pauses and interruptions are described. | Additional AWS integration without a proved D-195 advantage. [S17] |
| xAI Grok Voice 3.0 | Bidirectional audio and text over WebSocket. No exact supplied-text mode was established in the STS guide. | Do not confuse STT input timestamps with TTS output timestamps. | Requires client audio and state control. | Not a stronger current fit. [S18][S19] |
| Native free talk plus TTS math | Math can remain code-owned. Native free talk still violates D-197 if the child hears it before review. | Two output paths and potentially different voices and clocks. | Must cancel both paths and keep one conversational state. | More complexity; no clear launch advantage. |
| Native model used only for recognition | All speech still comes from approved TTS text. | Same as a cascade. | Could supply better turn cues, if independently accessible. | Possible later. It gives up much of native speech generation's advantage while retaining its cost. |
| Inworld Realtime with `response.speak` | This **does** document a supplied-text path that bypasses the LLM. Set automatic reply creation off and use the existing controller. | Its extensions document word alignment in audio events. | `response.cancel` and truncation are documented. | Credible integrated alternative, described below. [S20][S21] |

I do not propose relaxing D-195. Relaxing it would replace an enforceable text boundary with probabilistic speech generation. It would require a new safety case, new audible-math tests, and a founder decision. A successful prompt demonstration would not prove that replacement safe.

### A new hybrid worth distinguishing

Inworld Realtime is an integrated **STT/LLM/TTS service**, not evidence that a native model can recite arbitrary math exactly. Its `response.speak` event sends supplied text to TTS unchanged. Its model configuration documents `create_response` and `interrupt_response`. Its provider extensions return alignment. [S20][S21][S22]

This could host the controller externally while Inworld supplies recognition, timing and exact speech. Keep `force_uninterruptible` false. A child must be able to stop Maya. Repeated event IDs do not provide idempotency: the documented event can speak twice if sent twice. The application would need to retain its response ownership and cancellation checks. [S20]

I would not move to it now. LiveKit already carries the browser audio, board RPC and recovery. Inworld's default STT is a different recognizer with no established child-number advantage here. The full replacement rate and effective child-use contract were not verified. It is a useful later operational comparison, not a reason to discard the present worker.

## 2. Transport and orchestration

| Option | What it supplies | What Maya must still supply | Practical judgement |
| --- | --- | --- | --- |
| LiveKit Cloud + Node Agents | WebRTC, hosted worker, reconnection, model adapters, data/RPC, turn and interruption facilities | Checked lesson state, writing waits, board/audio agreement, privacy settings, device tests | Keep it. Most of the integration already exists. |
| Self-hosted LiveKit | Open-source transport and agent control | Server capacity, TURN/network operations, deploys, failover, metrics; Cloud-only enhancements need separate consideration | Poor first choice for one founder before live usage exists. No cost saving was demonstrated. |
| Pipecat Cloud + Daily | Managed agent hosting and Daily WebRTC; active `agent-1x` rate USD 0.01/min; free 1:1 voice transport | Controller adapter, board protocol integration, regression evidence | Credible alternative for a new build. Too little saving to justify a rewrite now. [S23] |
| Direct vendor WebRTC | OpenAI supports direct WebRTC. Gemini's documented core Live connection is WSS, with partner WebRTC paths. Inworld documents WebRTC and WebSocket. | App-controlled speech gate, cancellation, state recovery and board channel | Fewer services can also mean more custom app code. [S14][S15][S22] |
| Vapi, Retell or similar complete platforms | Managed call operations and model pipelines | Evidence that the platform can obey the existing controller and board timing without autonomous speech | No verified advantage for this browser tutoring flow. Their telephone features do not settle Maya's problem. Not fully priced in this research. |

LiveKit's current documentation offers audio turn detection and adaptive interruption handling. The current Maya source selects `turnDetection: "stt"`; it does not establish that those additional services are active. Do not count a new default from a vendor guide as proof of the deployed worker's behavior. Dynamic endpointing is marked Python-only in the turn guide. There is no reason to rewrite Maya in Python just to obtain that feature. [S24]

### iPad Safari and open-microphone audio

WebRTC supports browser echo cancellation. LiveKit distinguishes that from advanced noise suppression and voice isolation. These are different functions. A noise filter does not prove that the agent's speaker audio cannot return through the microphone. LiveKit warns against applying two advanced noise models in sequence. [S25]

Use a direct user action to start audio and request the microphone. LiveKit supplies a start-audio control for autoplay restrictions. Verify the actual playback state after connection and after foreground return. [S26]

Daily documents iOS Safari support for its input noise processor from version 17.4.1. This is a feature-specific statement, not proof of every Safari audio route. [S27]

Recent first-hand reports show why device tests remain necessary:

- A LiveKit user reported speakerphone echo and self-interruption on iPhone Safari and Android on October 15, 2026. That implementation used external avatar audio. It demonstrates a possible routing problem, not a failure rate for a normal LiveKit audio track. [S28]
- A Pipecat issue reported iOS-only self-interruption with Gemini native audio on May 17, 2026. Its native iOS setting does not prove an iPad Safari failure. It does show that changing local turn detectors may not control a model's independent server VAD. [S29]

Test an actual iPad with built-in speakers and the microphone open. Test high volume, a quiet child, Bluetooth route changes, a permission refusal, reconnect, screen lock and return. Headphones are a useful comparison condition, but cannot be the acceptance condition for a family product that expects speaker use.

## 3. STT for children and short number answers

**No current provider was verified as best for Canadian children aged 6-12 on this task.** Adult WER, telephone benchmarks, and a successful adult saying "twenty-seven" cannot establish that result.

DrivenData's published child benchmark is useful independent evidence of the gap. Its experiments were performed in mid-2025, even though the page was indexed as recent in 2026. On conversational MyST school-age speech, Whisper/KidWhisper WER was about 17%/13%. Results for younger children were much worse. This is evidence against transferring adult benchmarks to children. It is not a comparison of current AssemblyAI, Deepgram or Soniox. [S30]

| Candidate | Useful documented capability | Evidence limit and decision |
| --- | --- | --- |
| AssemblyAI U3.6 Pro | Streaming semantic endpointing, contextual prompts, keyterms, mid-session updates. USD 0.45/session-hour. Vendor reports 1.45% short-turn errors and 537 ms median endpoint latency. | Vendor scenario set, not a disclosed Maya child-number test. Keep as baseline. [S02][S03] |
| Deepgram Flux | Integrated end-of-turn prediction; `EagerEndOfTurn`, `TurnResumed`, adjustable thresholds and dynamic keyterms/numerals. Listed English rate USD 0.39/hour before applicable extras. | No matched child-number result found. Good second recognizer in a comparison. Do not repeat the competitor claim that Flux is VAD-only. [S31][S32] |
| Soniox `stt-rt-v5` | Streaming recognition with context; approximately USD 0.12/hour at the published usage assumptions. | Child-information uses may need additional written terms. Low price alone is insufficient. [S33][S34] |
| Speechmatics | Configurable recognition and published guidance on representative accuracy testing | No current matched child tutoring comparison or verified direct rate was established. Keep as a later candidate if the first two fail. [S35] |
| SoapBox Labs | Child-specific speech technology and documented fluency/file workflows | Current general conversational streaming availability and a public production quote were not established. Old free-access posts do not establish a 2026 offer. Ask for a current product demonstration only if child ASR remains the blocker. [S36] |
| Native speech recognizers | May use intonation and conversational context that a text-only cascade loses | No independent child-number advantage was established for the current native models. Do not infer it from expressive output speech. |

### Number handling rules

- Bias the recognizer toward the **domain**, including number words, place names, fractions, operations and units. Do not bias it toward the correct answer alone.
- Keep the incorrect answers that a child might give in the test distribution. The recognizer must preserve a wrong answer so the controller can assess it.
- Preserve self-correction: "um, fifty... no, fifty-six" must not commit the first number early.
- Evaluate semantic number accuracy separately from WER. "Twenty-seven" and "27" represent the same number. "Seven" and "seventy" do not.
- Treat a confidence score as provider-specific evidence. The existing 0.6 threshold is not a calibrated cross-provider probability of being correct.
- Test fillers and disfluencies. A cleaned transcript can remove a hesitation or repair that changes the intended answer.
- Confirm ambiguous numbers before judging the math. Do not ask for confirmation after code accepted an unambiguous answer.
- After two failed voice repairs, offer the existing text/number-entry alternative. Do not make the child repeat indefinitely.

Endpointing and interrupt detection need different settings. Maya can stop playback promptly when the child starts to speak, then wait longer before committing the child's completed answer. Fast speech stopping does not require fast answer commitment.

## 4. TTS: sound, controls, timing and price

There is no evidence-based universal winner for a warm Canadian child tutor. Listen with the same sentences and compare voices without provider labels.

Artificial Analysis's current provider-voice leaderboard places Eleven v4 and v4 Turbo first and second, Sonic 3.6 fourth, Gemini 3.8 Flash TTS fifth, Inworld TTS-2 ninth, and Inworld Flash sixteenth. These are blind adult/general user preferences, not child tutor results. The top two have overlapping score intervals. Do not present their exact order as decisive. [S09]

| TTS candidate | Delivery and timing | Price verified on the read date | Decision |
| --- | --- | --- | --- |
| Inworld TTS-2 | Plain-language delivery direction, speed/delivery controls, original-text token alignment. Vendor claims roughly 90-100 ms first audio in some conditions. | USD 25/M characters on demand; same Build/Ship gateway list rate | Best baseline balance of controls, timing and integration. [S01][S04][S05] |
| Inworld TTS-2 Flash | Lower claimed first-audio delay; word timing available. Its lower listening rank matters more than a few milliseconds if it sounds less patient. | USD 15/M characters | Useful cost/latency control, not automatic default. [S04][S09] |
| Eleven v4 Turbo | Expressive realtime model, vendor median inference around 100 ms; single voice per Text to Dialogue WebSocket. Alignment requires `sync_alignment=true`. Short inputs need explicit flushing. | USD 40/M characters; plan/contract minimums separate | First quality challenger. **Not established as a model-ID-only swap in the existing LiveKit TTS plugin.** [S06][S07][S08] |
| Cartesia Sonic 3.6 | Context-sensitive pacing; compatible control surface from Sonic 3.5; streaming timestamp interfaces | USD 50/M characters on LiveKit Build/Ship; direct/benchmark normalized prices can differ | Strong second quality challenger; gateway reduces direct-provider administration. [S01][S37][S38] |
| AssemblyAI-TTS-1 | Released October 28, 2026. Streaming, word times and cancellation. Dedicated emotion tags, pronunciation dictionaries, speed and SSML were not yet available in its launch description. | USD 15/M characters | Important new low-cost candidate. It appears in the current LiveKit catalog. Newness and limited explicit delivery controls keep it below the first three for Maya. [S03][S39] |
| Google Gemini 3.8 Flash / Flash-Lite TTS | Explicit verbatim transcript field and separate style metadata; streaming. Output word alignment was not established. | Through Dec 31: Flash input USD 0.50/M text tokens, output USD 9/M audio tokens; Lite output USD 6/M. Listed rates rise Jan 1, 2027. | More relevant than Gemini Live for exact words. Timing and Cloud child-use route remain unresolved. [S40][S41] |
| OpenAI Speech API models | Promptable tone and streaming; no board-ready word timing was established | Current guide marks `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` for Jan 6, 2027 shutdown | Do not start a new dependency on that API family now. The recommended Realtime migration needs a separate exact-text assessment. [S42] |
| Hume Octave / EVI | Historically expressive; earlier docs describe timing | Current live docs redirected to a different Audio Decisions product during this research | Search-indexed official Oct 2 notice says TTS/EVI access ends Nov 13, 2026. Live notice could not be recovered. Do not select it without clarification. [S43] |
| Sesame | Strong conversational demonstration is a useful listening reference | A current priced, embeddable production API with these controls was not established | A consumer preview and open research model do not establish a supported Maya service. Production availability remains unverified. [S44] |

### Two important timing details

Inworld's timestamp arrays include punctuation, spaces and sometimes silence tokens. They are not automatically the same list as a controller's whitespace-separated words. The adapter must map the actual provider tokens to the approved spoken text. Its `WORD` mode returns start/end seconds. [S04]

Inworld's **SYNC** mode returns audio and alignment together. **ASYNC** can return timestamps after the corresponding audio. ASYNC improves first audio but may be too late for a board cue. Do not switch to ASYNC merely because a latency guide recommends it. Either prove alignment arrives before each cue, or accept enough buffering to retain synchronization. The gateway's actual behavior needs a real Node check. [S04][S45]

Eleven v4 Turbo buffers roughly 40 characters and eight words before generating audio unless flushed. Maya often says a short line. This can dominate the apparent latency of "Seven" or a short question. A close/flush event completes pending synthesis; it is not evidence of immediate cancellation. The adapter must discard obsolete audio and stop actual playback on interruption. [S08]

### Math pronunciation

Supply a separate, code-written spoken form. Keep the printed expression for the board.

| Printed form | Spoken form for the test |
| --- | --- |
| `3/4` | "three quarters" |
| `27 + 39` | "twenty-seven plus thirty-nine" |
| `0.06` | "zero point zero six" |
| `-8` | "negative eight" |
| `1 3/8` | "one and three eighths" |

Do not let a TTS normalizer decide whether a slash is a date or fraction. This is an application control, not a vendor pronunciation guarantee. Code must preserve D-195 when it produces the spoken form.

Cekura's October 28 comparison provides useful independent test material and unedited output audio. Its accuracy/naturalness estimates use automated scoring. Its numbers/shorthand subset favors Inworld TTS-2 over several otherwise high-ranked voices. Those results do not establish Canadian classroom pronunciation or human preference. Use its samples as additional evidence, not as the acceptance test. [S46]

## 5. What must feel human

| Moment | Required behavior | What the stack can supply | What Maya must enforce |
| --- | --- | --- | --- |
| The child finishes a clear answer | Respond without a long unexplained pause | Fast STT, TTS streaming, warm worker | Measure endpointing + full controller + review + synthesis + audible playback. |
| The child says "Wait" | Stop speech and unshown drawing promptly | WebRTC playback control and provider cancellation | Invalidate all pending audio/board work, then process the completed child turn. |
| The child says "mm-hm" while Maya explains | Continue if it is acknowledgement, stop if it is an answer or objection | Adaptive interruption models can help | State matters. "Yes" can be the answer to the current question. Never treat it as a backchannel in every state. |
| The child writes quietly | Stay quiet | Any architecture can remain connected without generating speech | Controller-owned writing wait. Do not let an idle model fill the silence. |
| The child says "I'm stupid" | Acknowledge calmly and avoid judging intelligence | Expressive voice and reviewed free talk | D-197 review and approved fallback. No diagnosis or attachment claim. |
| Maya draws a digit | The sound and visible mark agree | TTS alignment and RPC | Actual device playback and visible paint, not synthesis time or RPC receipt alone. |
| The child asks "Why?" midway | Stop, retain the shown work, and answer at the same step | Native models are naturally good at this pattern | Cascade must preserve controller state and use approved explanatory lines. |
| A review is slow | Avoid a long blank call | A short approved phrase can be available locally | No unreviewed free-talk streaming. A sound or backchannel cannot conceal a slow substantive answer in the latency report. |

Do not add random hesitations or frequent "mm-hm" sounds to create apparent humanity. They can become distracting and can imply agreement with an incorrect answer. Use a small set of approved neutral reactions only where the lesson state permits them.

The source's model request is non-streaming structured JSON. Its prompt, offers, schema, recent turns, and possible reasoning work all precede an accepted response. Free talk adds a separate semantic review. Thus a 50 ms TTS improvement may have little effect on a two-second controller delay. Measure these stages before changing providers.

LiveKit's adaptive interruption and a native model's full-duplex behavior are useful, but neither supplies Maya's writing policy or D-195. A good result needs short turns, one question at the end, correct silence, accurate numbers and a warm adult voice together.

## 6. Cost model

These are **planning scenarios**, not measurements or invoice predictions. USD/CAD = **1.40** is an explicit planning assumption, not a verified exchange rate. All rates were read on 2026-11-04.

### Common usage assumptions

- 120 connected minutes/month, or twelve 10-minute calls.
- STT connected for the full call, including writing silence.
- Maya speaks for 50% of the call, at 120 words per spoken minute.
- Six characters per word including spaces gives `0.50 x 120 x 6 = 360` characters per connected minute.
- Three controller requests per connected minute. Automatic extra turns and retries can increase this.
- For the source-default-model scenario: **6,000 total input tokens and 400 total billed output tokens per controller request**, at Sonnet 5.5 USD 2/M input and USD 10/M output. This is an assumption, not a token count of a real request.
- One free-talk review per connected minute: 2,000 input and 100 output tokens at Haiku 5.5 USD 0.10/M and USD 0.50/M, for prompts below 100,000 tokens. Actual OpenRouter route and fees need verification. [S47][S48]
- LiveKit agent hosting allowance USD 0.010/min, plus USD 0.001/min as a transport/data reserve. Actual included allowances can reduce that reserve. This is not a quoted bundled LiveKit rate. [S01]

### Source-default LLM calculation

```text
Controller input/min = 3 x 6,000 x 2 / 1,000,000 = USD 0.036
Controller output/min = 3 x 400 x 10 / 1,000,000 = USD 0.012
Review/min = (2,000 x 0.10 + 100 x 0.50) / 1,000,000 = USD 0.00025
Total LLM/min = USD 0.04825

AssemblyAI STT/min = 0.45 / 60 = USD 0.0075
Inworld TTS-2/min = 360 x 25 / 1,000,000 = USD 0.009
LiveKit allowance/min = USD 0.011
Total/min = 0.04825 + 0.0075 + 0.009 + 0.011 = USD 0.07575
10-minute call = 0.07575 x 10 x 1.40 = CAD 1.0605
120 minutes/month = 0.07575 x 120 x 1.40 = CAD 12.726
```

Reasoning tokens still cost money when reasoning text is hidden. The 400-output-token assumption must include all billed output, or be increased. The input allowance must include the system prompt, schema, offers and history. The old report's 2,000-token input **per turn** and 180 output tokens **per minute** are not verified budgets for the current controller.

### Comparable options

| Stack / scenario | USD per connected minute | CAD per 10-minute call | CAD per 120-minute month |
| --- | ---: | ---: | ---: |
| Inworld TTS-2 + current-model scenario | 0.07575 | 1.06 | 12.73 |
| Eleven v4 Turbo + same model scenario | 0.08115 | 1.14 | 13.63 |
| Cartesia 3.6 via gateway + same model scenario | 0.08475 | 1.19 | 14.24 |
| AssemblyAI-TTS-1 or Inworld Flash at USD 15/M + same model scenario | 0.07215 | 1.01 | 12.12 |
| Inworld TTS-2 + specified cached-input scenario below | 0.04725 | 0.66 | 7.94 |
| GPT-Live-1 voice alone | 0.05000 | 0.70 | 8.40 |
| GPT-Live-1 + same controller/review budget | 0.09825 | 1.38 | 16.51 |

The two GPT-Live rows exclude application hosting and any LiveKit bridge. Keeping the same request budget is a like-for-like cost illustration, not a verified Live integration. A smaller backend can reduce cost but changes the comparison. GPT-Live bills connected duration, so writing silence is not free. [S11]

For the cached-input scenario, each controller request has 5,000 cached input tokens at USD 0.10/M and 1,000 new input tokens at USD 2/M. Output stays 400 tokens at USD 10/M. The review allowance is unchanged:

```text
LLM/min = [3 x (5,000 x 0.10 + 1,000 x 2 + 400 x 10)] / 1,000,000
          + 0.00025
        = USD 0.01975
Full stack/min = 0.01975 + 0.0075 + 0.009 + 0.011 = USD 0.04725
```

This assumes cache hits after warm-up. It omits cache-write premiums. The current request code does not by itself prove those hits. Do not budget this saving until usage records establish it. [S47]

The earlier roughly CAD 9 estimate is plausible in some usage and cache conditions. It is not established for the current source default. The first account trial must capture actual billed tokens and cost for normal, free-talk, repair, interrupted and writing-heavy calls separately.

### Minimums and other native options

LiveKit Build lists 1,000 agent minutes without a plan charge. Ship starts at USD 50/month and includes 5,000 agent minutes. Do not add USD 50 and USD 0.01 for the first 5,000 minutes. For 120 minutes used by one child, a Ship plan plus the uncached STT/TTS/LLM scenario is about **CAD 80.88 for the fleet**, before allowance adjustments. At that volume the unused minimum dominates. Use Build for the eligible initial trial and verify its limits. [S01]

An always-reserved Pipecat `agent-1x` slot at USD 0.0005/min is about USD 21.60 per 30-day month, before active usage. This can exceed its small transport saving at low volume. Self-hosting has no honest per-child price until concurrency, idle capacity and operations are known. [S23]

Other native model prices do not provide a cheaper eligible tutor by themselves:

- Realtime 2.1 Mini lists audio USD 10/M input and USD 20/M output, with USD 0.30/M cached input. Text is separate. Audio history, cache hit rate, input silence behavior and truncation affect the bill. No full-call figure is claimed here. [S14]
- Gemini 3.8 Live lists USD 3/M input and USD 12/M output audio tokens at 25 tokens/second. With child speech at 30% and Maya speech at 50%, fresh audio alone is `450 x 3/M + 750 x 12/M = USD 0.01035/min`. Google also bills accumulated session context on later turns. Fresh-audio price is not full-call price. [S49]
- Grok's listed STS price is USD 0.08/min, or CAD 13.44 at 120 minutes before application and other applicable charges. [S19]
- The current AWS Nova 2.5 Sonic price table could not be extracted. No firm rate is quoted. [S50]
- Eleven's native Realtime service lists USD 0.08/min plus LLM use. It does not remove D-195 or D-197. [S06]

At the weekly product limit, `30 x 52 / 12` is about **130 minutes per average month**, not 120. Multiply the 120-minute figures by 1.0833 for that annual average. A month with five weekly resets can allow 150 minutes. This is calendar arithmetic, not a proposed change to the product limit.

## 7. Children's use and data handling

**No provider in this report has completed Unica's launch approval.** A provider's adult account age is not automatically a ban on a parent's child using a downstream application. Conversely, an API with no explicit child clause is not positive approval for child audio.

| Provider / route | Established in the current primary pages | Unresolved action before child audio |
| --- | --- | --- |
| LiveKit Inference | ZDR and no training by default across its models. Direct provider plugins are outside that promise. Observability is separate and can retain audio/transcripts. | Confirm the exact downstream age range and provider chain in writing. Disable recording and audio/transcript observability. Confirm locations. [S03][S51] |
| AssemblyAI direct | Streaming audio/transcripts have zero retention when model-training opt-out applies. Metadata can remain. | Verify effective opt-out before the first request, child use and region. Generic streaming privacy does not establish TTS coverage. [S52][S53] |
| Inworld direct | ZDR can now be self-managed at Developer and above; lower plans can have support/contract settings. Workspace overrides can defeat the organization default. Usage metadata and cloning source audio have exceptions. | Verify the actual workspace setting, training terms and downstream child use. Its account terms require an adult; they do not settle this child service. [S54][S55] |
| ElevenLabs direct | API ZRM is available for eligible Enterprise customers, with `enable_logging=false`; web UI traffic is excluded. Default data retention and model-improvement controls are separate issues. | Obtain eligible coverage and age permission. A standard paid account is not proof of ZRM. The direct contract may dominate the CAD 0.91 variable premium. [S56] |
| Cartesia direct | Enterprise ZDR is documented. Terms offer a training data-control request. Its general privacy page says services are not intended for children. | Resolve that scope in writing for the API. Gateway ZDR does not by itself settle all child-use terms. [S57][S58][S59] |
| OpenAI direct | Under-13 personal data requires API ZDR first. Realtime is ZDR eligible; GPT-Live is eligible with limitations. Live session storage is off by default, separate from default abuse retention. | Obtain effective ZDR and the right endpoint coverage. Parental permission alone does not replace that provider requirement. [S60][S61] |
| Gemini Developer API / AI Studio | Current terms prohibit clients directed at or likely accessed by people under 18. Paying does not remove the age clause. | Exclude this route for Maya. Google Cloud terms are a separate assessment. [S16] |
| Google Cloud | Zero-retention guidance requires attention to abuse logging and optional Live session resumption. Resumption can retain session material for up to 24 hours. | Confirm the applicable Cloud contract, child use, logging exemption and region. Leave resumption off if ZDR is required. [S62] |
| Soniox direct | Real-time content is transient by default; terms prohibit training use of customer content. Children's information can need additional written terms. | Obtain those terms before child testing. [S34] |
| AWS / xAI | A current complete child-use approval was not established in this research. | Obtain contract and retention evidence before considering production. Do not infer approval from an education example. |

The proposed Inference route reduces the direct-key and opt-out work. It **does not** authorize replacing the current privacy marker with an unverified operator assertion. The implementation must later add route-specific evidence and preserve the fail-closed gate.

OpenRouter also processes the child's transcript and the review input. STT/TTS ZDR leaves this separate path untouched. Its provider logging guide distinguishes ZDR, safety retention and other retention. Confirm the effective account settings and eligible route for both the controller and reviewer. A prohibition on training is not the same as zero retention. [S63]

For Canadian use, the joint meaningful-consent guidance requires attention to the child's capacity, parent/guardian involvement and clear third-party disclosure. Its general under-13 position must not be simplified into a claim that every Canadian privacy statute uses the same age rule. For covered US use, the FTC treats a child's voice recording as personal information. Its temporary speech-conversion policy is narrow and does not establish an exception for this whole tutoring service. This report does not provide legal approval. [S64][S65]

No stored child audio means more than turning off an app recording switch. Check provider logs, Cloud session observability, error traces, trial playgrounds and external evaluation tools. Do not send a child's audio to an additional benchmark or AI judge during the listening test. No voice cloning is needed.

## 8. One-day comparison that can settle the next step

The test can select a voice and reject a poor audio stack in one day. It cannot establish population-wide child ASR accuracy or complete vendor contracts in one day.

### Before the test

Use real provider accounts. Use adults for the first pass. Complete the existing child-use and retention gates before a real child uses an external provider. If those gates cannot be completed that day, the child section remains pending. Adult imitation of a child's voice is not a substitute for it.

Keep the controller, worked question, sentences, device, volume and network fixed. Change one provider at a time. Use stock adult voices. Compare:

1. Inworld TTS-2, with two suitable voices screened down to one.
2. Eleven v4 Turbo, with the same screening.
3. Cartesia Sonic 3.6, with the same screening.
4. One short adult GPT-Live-1 conversation as a reference for timing and interruptions. It is not a launch candidate merely because it sounds best.

If time permits, add AssemblyAI-TTS-1 as a fourth TTS. Do not enlarge the test until the main comparison is complete.

### Exact listening sentences

Use approved controller lines where they already exist. Any new phrase below is a test stimulus, not automatically approved product copy.

- "I'm Maya, an AI math helper."
- "What have you tried?"
- "What is seven plus nine?"
- "Write six in the ones column."
- "Carry one ten to the tens column."
- "Twenty-seven plus thirty-nine is sixty-six."
- "Three quarters is the same as six eighths."
- "Zero point zero six."
- "Negative eight."
- "Thanks for telling me."
- "I'm sorry your grandma is sick."
- "Take your time."

Include the short line "Seven." Test it after the preceding sentence ends. This exposes text buffering, clipped initial sounds and overacting. Test the printed forms `3/4` and `27 + 39` once to expose provider normalization, then repeat with code-written spoken forms. Do not use a dangerous raw-symbol reading as the production format.

### Human listening pass

Present A/B pairs in random order, without provider names. Savar, two parents and, once permitted, at least one child choose which voice they would want to hear for ten minutes. Ask each listener separately about warmth, clarity, patience and unwanted dramatic delivery. Compare the same scripts, not different demo content.

Proposed preference rule: switch from Inworld only if the challenger wins at least 70% of at least 20 parent pair choices, the child does not reject it, and all correctness and timing gates pass. This is a small product decision rule, not a statistically established population preference.

### Real child speech pass

Use live, consented speech. Store no child audio. Keep only the minimum permitted test log: stimulus ID, intended value, recognized value, timing and error category. Do not retain names or unrelated personal speech. Without audio recordings, exact later audit is limited; a second adult observer can confirm the intended utterance live.

Compare AssemblyAI and Flux on roughly 50-100 short turns if the child remains comfortable. Include wrong answers and corrections:

```text
seven
twenty-seven
um, fifty-six?
thirteen / thirty
fourteen / forty
fifteen / fifty
sixteen / sixty
sixty... no, sixty-six
three quarters
zero point zero six
I don't know
wait, I'm writing
no, I meant seventy
```

Use the recognizer's original result before any expected-answer correction. Balance quiet and ordinary room-noise conditions. Stop if the child becomes tired. One child supplies an early failure check, not age/accent coverage.

### Full call pass and rejection conditions

State the rejection conditions before looking at results:

| Claim | Result that rejects it | Minimum check |
| --- | --- | --- |
| The voice preserves code math | Any altered number, operation, place or work instruction | Listen to every generated test sentence. Require zero such failures. |
| It responds promptly | End-of-child-turn to substantive audible response p50 above 1.0 s or p95 above 1.8 s | At least 30 complete turns per finalist. Separate math, reviewed free talk and repairs. Report cold start separately. |
| It lets the child interrupt | Speech-stop p95 above 250 ms, or any obsolete unshown board batch released after cancellation | At least 20 interruptions across early, middle and late speech. |
| It respects writing time | Any unsolicited speech in the controller's protected writing interval | Three writing pauses, including "I need more time." |
| It hears number answers sufficiently well for this screen | More than 2% semantic number/operator errors, or any misheard answer silently accepted as correct | Use the whole labelled set. Report errors and denominators by provider and condition. Confirmation can make the interaction safe, but does not turn an ASR error into a correct first recognition. |
| Board and speech agree | Wrong mark, wrong order, stale mark, or absolute speech-to-visible-mark offset p95 above 200 ms | At least 20 adult turns with visible word-linked marks on the physical iPad. |
| Open-microphone use works | Maya's speaker audio becomes a child answer or creates a self-interruption loop | Ten adult speakerphone turns at high volume, followed by permitted child checks. |
| Cost is understood | Missing usage records, missing billed reasoning, or billed total outside the declared scenario without explanation | Complete 10-minute normal, writing-heavy and free-talk-heavy adult calls. Include discarded audio and retries. |

These are proposed product thresholds. They are not vendor guarantees or research-derived clinical thresholds. The p95 estimates from these small samples are rough. Count the full samples and all failures, not one good recording.

Use an adult-only screen/audio recording or device loopback to compare audible words with visible board marks. Do not record the child's audio to obtain this timing evidence. The current worker's RPC acknowledgement delay cannot establish speaker-to-screen timing.

For interruption, test the complete immediate path: child speech starts, playback stops, old board callbacks become invalid, the child completes a corrected answer, and the next response uses the corrected state. A cancellation API call alone cannot pass that check.

Test the laptop first for a usable reference, then the actual iPad Safari. Include a newly started worker followed immediately by a call. Include reconnect during speech and during a writing wait. Do not pass a provider from its playground alone.

## 9. What would change my recommendation

1. **Change the voice to Eleven v4 Turbo** if the blind parent/child comparison wins clearly and its direct privacy agreement, short-line flush, timing and cancellation pass. The variable price difference is small.
2. **Change STT** if Flux or a child-specific service reduces semantic number errors and repair loops on the same live child trials without causing premature turn endings.
3. **Replace LiveKit with an integrated service** if a prototype demonstrates the same controller, exact lines, word-linked board, interruption, Safari speakerphone behavior and recovery with less operating work. Inworld `response.speak` is the most concrete documented candidate found here.
4. **Adopt native speech generation** only if a provider establishes an exact-read mode, a pre-audible review gate, output alignment and reliable cancellation, then passes adversarial audio tests. Alternatively Savar must explicitly change D-195/D-197 and accept a different safety boundary. Native conversational quality alone does not meet that condition.
5. **Revise the cost estimate** when actual request sizes, reasoning, caching, speech ratio and retry invoices replace the assumptions. If the controller is the dominant cost or delay, TTS substitution is the wrong first fix.

The strongest case against my first choice is that Inworld is not the adult naturalness leader, and no real child audio or complete Maya latency result supports it yet. The strongest case for it is the fit between checked words, alignment, cancellation and the existing code, with a current low-administration ZDR route. It is the right first controlled test, not a proved final voice.

## Source register

All pages below were read or searched on **2026-11-04**. Dates in descriptions are publication, release or benchmark dates when established. Sources with extraction or live-verification limits are marked. Local research from October 29 was treated as leads, not current provider evidence.

- **S01:** [LiveKit Cloud plans and model rates](https://livekit.com/pricing.md). Current page, undated.
- **S02:** [AssemblyAI Universal-3.6 Pro Realtime](https://www.assemblyai.com/blog/universal-3-6-pro-realtime). Vendor benchmark and USD 0.45/hour; exact publication date not established from fetched text.
- **S03:** [LiveKit Inference](https://docs.livekit.io/agents/models/inference/). Current model catalog, ZDR and routing boundary.
- **S04:** [Inworld timestamps](https://docs.inworld.ai/tts/capabilities/timestamps). Raw page read; original-token mapping and SYNC/ASYNC contract.
- **S05:** [LiveKit Inworld TTS](https://docs.livekit.io/agents/models/tts/inworld/). Current Node Inference options and direct-plugin distinction.
- **S06:** [ElevenLabs API prices](https://elevenlabs.io/pricing/api). Current per-character and native Realtime list rates.
- **S07:** [ElevenLabs September 28, 2026 changelog](https://elevenlabs.io/docs/changelog/2026/9/28). v4/v4 Turbo and API route.
- **S08:** [ElevenLabs realtime Text to Dialogue](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd). Buffering, flush, alignment and one-voice restriction.
- **S09:** [Artificial Analysis provider-voice TTS leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice). Current blind-listening ranking, counts and score intervals.
- **S10:** [OpenAI GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation). Paraphrase, speech during review, independent backend cancellation.
- **S11:** [OpenAI GPT-Live-1 model](https://developers.openai.com/api/docs/models/gpt-live-1) and [getting started](https://developers.openai.com/api/docs/guides/live). USD 0.05/min plus backend usage.
- **S12:** [Artificial Analysis speech-to-speech comparison](https://artificialanalysis.ai/speech-to-speech). Search-indexed table reports GPT-Live Sol/low 1.24 s and Astra/medium 1.34 s; the live page extraction omitted the detailed table. These figures were not treated as Maya measurements or used as a launch forecast.
- **S13:** [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations). Automatic response controls, cancellation and truncation.
- **S14:** [OpenAI Realtime 2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini). Current modalities, transport and token prices.
- **S15:** [Google Cloud Live overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api). Current model and transport overview; old Vertex URL redirects here.
- **S16:** [Gemini API terms](https://ai.google.dev/gemini-api/terms). Redirected to [current terms](https://aistudio.google.com/docs/terms), effective March 23, 2026; age restriction covers downstream API clients.
- **S17:** [AWS Nova 2.5 Sonic model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-5-sonic.html). Release date October 5, 2026. [AWS service card](https://docs.aws.amazon.com/pdfs/ai/responsible-ai/nova-2-5-sonic/nova-2-5-sonic.pdf) provides additional stated use cases; its examples are not child-use permission.
- **S18:** [xAI speech-to-speech](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech). Current protocol documentation; old voice-agent URL redirects here.
- **S19:** [xAI models and pricing](https://docs.x.ai/developers/models). USD 0.08/min STS; output word timing not established in S18.
- **S20:** [Inworld configuring realtime models](https://docs.inworld.ai/realtime/usage/using-realtime-models). Raw exact-speech and turn-control sections read.
- **S21:** [Inworld Realtime provider extensions](https://docs.inworld.ai/realtime/provider-data). Alignment in `response.output_audio.delta` and request options.
- **S22:** [Inworld Realtime overview](https://docs.inworld.ai/realtime/overview). Integrated STT/LLM/TTS and WebRTC/WebSocket.
- **S23:** [Pipecat Cloud pricing](https://www.daily.co/pricing/pipecat-cloud/). Active and reserved agent rates, free 1:1 voice transport.
- **S24:** [LiveKit turn handling](https://docs.livekit.io/agents/logic/turns/) and [June 30, 2026 turn-handling account](https://livekit.com/blog/turn-detection-and-interruption-handling). Python-only labels and detector/interrupt distinction.
- **S25:** [LiveKit noise and echo cancellation](https://docs.livekit.io/transport/media/noise-cancellation/). Raw page read; browser AEC, noise suppression, voice isolation and filter-stacking cautions.
- **S26:** [LiveKit media controls](https://docs.livekit.io/frontends/agents-ui/media-controls) and [StartAudio](https://docs.livekit.io/reference/components/react/component/startaudio). Autoplay/user gesture controls; search-indexed official documentation.
- **S27:** [Daily input settings](https://docs.daily.co/reference/daily-js/instance-methods/update-input-settings). iOS Safari 17.4.1 feature support; official search-indexed text.
- **S28:** [LiveKit speakerphone echo report](https://community.livekit.io/t/mobile-speakerphone-echo-makes-the-agent-interrupt-itself-mid-call/2268). October 15, 2026, first-hand developer report; search-indexed, not a reproduced Maya defect.
- **S29:** [Pipecat issue 4509](https://github.com/pipecat-ai/pipecat/issues/4509). May 17, 2026, first-hand native iOS/Gemini report; search-indexed, not Safari evidence.
- **S30:** [DrivenData child ASR benchmarking](https://drivendata.co/blog/child-asr-benchmarking). Raw page read. Experiments in mid-2025; publication date not asserted from index metadata.
- **S31:** [Deepgram Flux agent guide](https://developers.deepgram.com/docs/flux/agent). Integrated turn signals and tuning.
- **S32:** [Deepgram pricing](https://deepgram.com/pricing.md). Current listed English Flux and optional feature rates; official search-indexed pricing.
- **S33:** [Soniox pricing](https://soniox.com/pricing). Token-based rates and approximate hourly conversion; official search-indexed pricing.
- **S34:** [Soniox service terms](https://soniox.com/policies/terms-of-service). Children's information, no-training scope and transient realtime processing.
- **S35:** [Speechmatics accuracy benchmarking](https://docs.speechmatics.com/tutorials/accuracy-benchmarking). Representative-data guidance; official search-indexed text. No current Maya-specific score established.
- **S36:** [SoapBox fluency API](https://docs.soapboxlabs.com/technical-docs/online-technical-documentation/fluency-(online)). Official search-indexed technical description; current general live-conversation API and price not established.
- **S37:** [Cartesia Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest) and [2026 changelog](https://docs.cartesia.ai/changelog/2026). Snapshot `sonic-3.6-2026-08-27`; vendor naturalness and compatibility claims.
- **S38:** [Cartesia streaming TTS](https://docs.cartesia.ai/2026-03-01/api-reference/tts/sse). Timestamp, normalization and generation-control interface.
- **S39:** [AssemblyAI-TTS-1 launch](https://www.assemblyai.com/blog/text-to-speech-api). October 28, 2026. Raw benchmark and limitation sections read. Its 47 ms lab comparison is vendor-run, even though the post also links independent evaluations.
- **S40:** [Google Gemini TTS overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview). Explicit verbatim text, separate style, streaming and output limits.
- **S41:** [Google Cloud TTS prices](https://cloud.google.com/text-to-speech/pricing). Current promotional 3.8 rates and announced January 1, 2027 rates.
- **S42:** [OpenAI TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech). Raw deprecation notice read: January 6, 2027 shutdown.
- **S43:** [Hume old changelog](https://dev.hume.ai/voice/changelog) and [old general changelog](https://dev.hume.ai/changelog). Official search-indexed October 2 notice reports November 13 sunset. Both live fetch routes redirected and did not expose it. This is explicitly weaker than live notice verification.
- **S44:** [Sesame terms](https://sesame.com/terms). Current primary terms found; a production API rate/control contract was not established. No inference from a consumer price is used.
- **S45:** [Inworld latency guide](https://docs.inworld.ai/tts/best-practices/latency). Alignment buffering and ASYNC recommendation.
- **S46:** [Cekura TTS benchmark](https://benchmarks.cekura.ai/text-to-speech). Updated October 28, 2026. 104 sentences, repeated requests, audio samples and automated scoring limits.
- **S47:** [Anthropic prices](https://platform.claude.com/docs/en/about-claude/pricing). Sonnet 5.5, Haiku 5.5 and cache rates; current primary pricing page.
- **S48:** [OpenRouter Sonnet 5.5 providers](https://openrouter.ai/anthropic/claude-sonnet-5.5/providers). Current USD 2/M input and USD 10/M output listing. Actual account route not checked.
- **S49:** [Google model pricing](https://cloud.google.com/model-garden/pricing). Gemini 3.8 Live rates, 25 audio tokens/second and session-context billing; old Vertex pricing URL redirected here.
- **S50:** [AWS Bedrock pricing](https://aws.amazon.com/bedrock/pricing/). Nova 2.5 dynamic rate table was not extractable. Rate remains unverified.
- **S51:** [LiveKit ZDR explanation](https://livekit.com/blog/how-we-handle-zero-data-retention-in-livekit). August 13, 2026. Distinguishes Inference from observability and recordings.
- **S52:** [AssemblyAI retention and training](https://www.assemblyai.com/docs/data-retention-and-model-training). Streaming opt-out boundary and metadata retention.
- **S53:** [AssemblyAI terms](https://www.assemblyai.com/legal/terms-of-service). No positive downstream under-13 permission established from extracted page.
- **S54:** [Inworld ZDR](https://docs.inworld.ai/portal/zero-data-retention). Raw page read; Developer-and-above controls, workspace overrides, content and metadata exceptions. This operational page is more specific than the pricing page's narrower add-on description.
- **S55:** [Inworld terms](https://inworld.ai/terms). Effective June 11, 2025 in fetched page; adult contracting age does not settle downstream use.
- **S56:** [ElevenLabs Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode). Enterprise eligibility, per-request flag, coverage and UI exclusion.
- **S57:** [Cartesia terms](https://www.cartesia.ai/legal/terms). Effective June 14, 2024 in fetched page; account age and training opt-out.
- **S58:** [Cartesia privacy](https://cartesia.ai/legal/privacy). Official search-indexed child privacy clause; application to downstream API use remains unresolved.
- **S59:** [Cartesia ZDR](https://docs.cartesia.ai/enterprise/zero-data-retention). Official search-indexed Enterprise coverage and metadata exceptions.
- **S60:** [OpenAI under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance). Under-13 personal-data requirement and age-appropriate controls.
- **S61:** [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Realtime/Live retention table, Live optional recording, ZDR eligibility and Canada storage versus processing distinction.
- **S62:** [Google Cloud ZDR](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention) and [Live resumption guidance](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/multimodal-faqs). Live content retention with resumption; some detail recovered from official search-indexed text, not a complete effective project configuration.
- **S63:** [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging). Retention tiers and account/request routing controls.
- **S64:** [Canadian meaningful-consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/). Primary regulator guidance. No project legal assessment was performed.
- **S65:** [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions). Child voice information and narrow temporary speech-conversion enforcement policy.
- **S66:** [LiveKit ElevenLabs guide](https://docs.livekit.io/agents/models/tts/elevenlabs/). Current guide states that Inference service ended August 31, 2026; direct plugin remains available.

[S01]: https://livekit.com/pricing.md
[S02]: https://www.assemblyai.com/blog/universal-3-6-pro-realtime
[S03]: https://docs.livekit.io/agents/models/inference/
[S04]: https://docs.inworld.ai/tts/capabilities/timestamps
[S05]: https://docs.livekit.io/agents/models/tts/inworld/
[S06]: https://elevenlabs.io/pricing/api
[S07]: https://elevenlabs.io/docs/changelog/2026/9/28
[S08]: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd
[S09]: https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice
[S10]: https://developers.openai.com/api/docs/guides/live-delegation
[S11]: https://developers.openai.com/api/docs/models/gpt-live-1
[S12]: https://artificialanalysis.ai/speech-to-speech
[S13]: https://developers.openai.com/api/docs/guides/realtime-conversations
[S14]: https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
[S15]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api
[S16]: https://aistudio.google.com/docs/terms
[S17]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-5-sonic.html
[S18]: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
[S19]: https://docs.x.ai/developers/models
[S20]: https://docs.inworld.ai/realtime/usage/using-realtime-models
[S21]: https://docs.inworld.ai/realtime/provider-data
[S22]: https://docs.inworld.ai/realtime/overview
[S23]: https://www.daily.co/pricing/pipecat-cloud/
[S24]: https://docs.livekit.io/agents/logic/turns/
[S25]: https://docs.livekit.io/transport/media/noise-cancellation/
[S26]: https://docs.livekit.io/frontends/agents-ui/media-controls
[S27]: https://docs.daily.co/reference/daily-js/instance-methods/update-input-settings
[S28]: https://community.livekit.io/t/mobile-speakerphone-echo-makes-the-agent-interrupt-itself-mid-call/2268
[S29]: https://github.com/pipecat-ai/pipecat/issues/4509
[S30]: https://drivendata.co/blog/child-asr-benchmarking
[S31]: https://developers.deepgram.com/docs/flux/agent
[S32]: https://deepgram.com/pricing.md
[S33]: https://soniox.com/pricing
[S34]: https://soniox.com/policies/terms-of-service
[S35]: https://docs.speechmatics.com/tutorials/accuracy-benchmarking
[S36]: https://docs.soapboxlabs.com/technical-docs/online-technical-documentation/fluency-(online)
[S37]: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
[S38]: https://docs.cartesia.ai/2026-03-01/api-reference/tts/sse
[S39]: https://www.assemblyai.com/blog/text-to-speech-api
[S40]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview
[S41]: https://cloud.google.com/text-to-speech/pricing
[S42]: https://developers.openai.com/api/docs/guides/text-to-speech
[S43]: https://dev.hume.ai/voice/changelog
[S44]: https://sesame.com/terms
[S45]: https://docs.inworld.ai/tts/best-practices/latency
[S46]: https://benchmarks.cekura.ai/text-to-speech
[S47]: https://platform.claude.com/docs/en/about-claude/pricing
[S48]: https://openrouter.ai/anthropic/claude-sonnet-5.5/providers
[S49]: https://cloud.google.com/model-garden/pricing
[S50]: https://aws.amazon.com/bedrock/pricing/
[S51]: https://livekit.com/blog/how-we-handle-zero-data-retention-in-livekit
[S52]: https://www.assemblyai.com/docs/data-retention-and-model-training
[S53]: https://www.assemblyai.com/legal/terms-of-service
[S54]: https://docs.inworld.ai/portal/zero-data-retention
[S55]: https://inworld.ai/terms
[S56]: https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
[S57]: https://www.cartesia.ai/legal/terms
[S58]: https://cartesia.ai/legal/privacy
[S59]: https://docs.cartesia.ai/enterprise/zero-data-retention
[S60]: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
[S61]: https://developers.openai.com/api/docs/guides/your-data
[S62]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention
[S63]: https://openrouter.ai/docs/guides/privacy/provider-logging
[S64]: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/
[S65]: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
[S66]: https://docs.livekit.io/agents/models/tts/elevenlabs/
