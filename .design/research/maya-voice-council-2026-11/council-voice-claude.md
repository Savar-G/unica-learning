# Council report: Maya's voice architecture (Claude member)

Date: 2026-11-04. All web sources were read on 2026-11-04 unless marked. Money is USD unless marked CAD. USD/CAD = 1.40 is a planning rate (the same one the 2026-10-29 research used), not a live quote. Keenable tools were not available in this session, so I used WebSearch and WebFetch. No paid calls were made. No repository file was changed.

## 1. Recommendation in one sentence

Keep the cascade (LiveKit Agents, AssemblyAI Universal-3.6 Pro, Inworld Realtime TTS-2) but change three parts of it: route STT and TTS through LiveKit Inference instead of direct plugins (zero data retention by default, one account), fix Maya's own turn latency (instant code-written acknowledgement, a faster turn model, voice-tuned turn detection), and pick the voice by a blind listening test against ElevenLabs v4 Turbo and Cartesia Sonic 3.6 before settling on Inworld.

The provider choice is not the main risk to "wow". The main risk is that the worker waits for the whole controller turn (a structured-output call to Claude Sonnet 5.5 through OpenRouter, sometimes a repair call, sometimes an 8-second-capped review) before it hands a single word to the TTS. That will likely put 2 to 4 seconds of silence after each child turn. No vendor fixes that for us.

## 2. What I checked in the code

- `worker/maya-voice/src/agent.ts` (origin/main): `llmNode` awaits `this.call.child(...)` and then enqueues the full text in one piece. Nothing is spoken until the controller has finished, saved, and returned. `turnDetection: "stt"` (AssemblyAI's punctuation-based end of turn), `preemptiveGeneration` off, Silero VAD for real STT.
- `src/lib/maya-model.ts`: one structured-output request per proposal, `effort: "low"`, `maxTokens: 4000`, 30 s timeout, through `AI_MODEL` (default `anthropic/claude-sonnet-5.5`). A refused proposal triggers a repair request.
- `src/lib/maya-talk-review.ts`: free-talk review with an 8 s limit (`REVIEW_TIME_LIMIT_MS`), on Claude Haiku 5.5 by default.
- `docs/maya-voice.md`: the direct-provider privacy gate (AssemblyAI opt-out, Inworld retention, child-use approval), `record: false`, board release on TTS word times with a sentence-boundary fallback. Word timing in a real call is not yet verified.

I did not find any measured turn latency for Maya's controller. That number is the first thing to measure (section 9).

## 3. Architectures

### (a) Cascade: STT, then Maya's controller, then TTS

Fits D-195 fully: the TTS says the exact string code accepted. The board can be timed from TTS word timestamps. Cancelling is local (stop the audio track, cancel unshown strokes). This is what is built.

Latency evidence: a 2026 study that built a cascade from scratch reported a median of 958 ms end to end with a cloud LLM, and 755 ms from final transcript to first audio (arXiv 2603.05413, cited by Cartesia's article https://www.cartesia.ai/learn/speech-to-speech-vs-cascaded, read 2026-11-04). A separate deployment study reported a median of 758 ms from final VAD to first server audio over 36 turns (Voice-Light, arXiv 2609.20995). These are single systems, not independent head-to-head tests. They assume the LLM streams its first sentence to the TTS. Maya's controller does not stream today.

### (b) Native speech-to-speech

**OpenAI GPT-Live 1** (`gpt-live-1`, API since about 2026-09-10 per secondary reports; model page https://developers.openai.com/api/docs/models/gpt-live-1.md). Full duplex, delegates reasoning and tools to a backend agent, $0.05 per session minute billed per second, silence and backend work included in billed time, backend tokens extra (https://developers.openai.com/api/docs/guides/voice-latency-cost). The key test fails on OpenAI's own words (https://developers.openai.com/api/docs/guides/live-conversations):
- "`session.commentary.append`: provide information for the model to say aloud, which it may paraphrase."
- An acknowledgment "does not confirm that the greeting was spoken or played"; the model may "paraphrase the greeting, add words, or remain silent."
- "For predictable greeting playback, exact wording, or a known playback-completion point," play a verified recording through your application.
- "WebSocket `session.output_audio.delta` events have no timing fields," and transcript times "describe context delivery, not speech or playback."

So GPT-Live cannot say a code-written math line exactly, cannot be held back until guards pass (it speaks in its own loop), and gives no word timings for the board. OpenAI tells you to play your own audio when wording matters. That is a cascade.

**OpenAI Realtime (gpt-realtime-2 / 2.1)**: same core problem (a prompt asking for a verbatim line is a request, not a guarantee). D-195 exists because free sentences were never airtight; "please say exactly this" has the same weakness. Not verified: any 2026 exact-read mode in Realtime. I searched and found none.

**Gemini 3.8 Live**: fastest in the one recording-based board I found (861 ms, Coval 30-day board dated 2026-10-31, as reported by Cartesia, a TTS vendor). But the Gemini API terms say "You will not use the Services as part of a website, application, or other service that is directed towards or is likely to be accessed by individuals under the age of 18" (https://aistudio.google.com/docs/terms, effective 2026-03-23). Excluded on the Developer API. The Google Cloud route has separate terms that nobody has confirmed for this use.

**Others**: ElevenLabs Realtime v1 Mini/Max ($0.08/min plus LLM, https://elevenlabs.io/pricing/api), Grok Voice 3.0, Amazon Nova Sonic, Qwen, Phonic. Same D-195 problem as GPT-Live (I found no exact-read mode with word timings for any of them), plus unsettled child-use terms. Hume: its pricing page was reported removed on 2026-10-15 (usagepricing.com, secondary) and I could not confirm EVI's status; I would not build on it now. Sesame: no public conversational API found (its open CSM-1B is a TTS model only).

**Do speech-to-speech models win on latency?** Not clearly in 2026. Recording-based voice-to-voice times on the Coval board (2026-10-31, via https://www.cartesia.ai/learn/speech-to-speech-vs-cascaded): Gemini 3.8 Live 861 ms, Eleven Realtime v1 Mini 1,402 ms, GPT Realtime 2 1,576 ms, GPT-Live-1 1,780 ms. Weak evidence: two reads of the same page gave different numbers (a search summary showed GPT-Live at 1,163 ms), the board's sample size is not shown, and the publisher sells a cascade TTS. Artificial Analysis lists time to first audio of 0.57 s (Eleven Realtime v1 Max) to 1.34 s (GPT-Live-1 Astra medium) (https://artificialanalysis.ai/speech-to-speech, "as of July 2026" snapshot). A good cascade is in the same range.

### (c) Hybrids

1. **Speech-to-speech for free talk, our TTS for math lines.** Two different voice engines in one call: the child will hear the voice change between "That's a great question!" and "Seven plus nine is sixteen." OpenAI's Marin and Cedar voices are Realtime-only per a secondary source (chatforest.com), so matching voices is not available as far as I could find. It also keeps a full-duplex model listening while our TTS plays, so both systems must agree on who has the floor. It doubles the privacy gate (child audio to OpenAI needs approved ZDR, per https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance: do not process personal data of children under 13 "without first implementing zero data retention"). High build cost, high operating burden, unproven gain.
2. **Realtime model only as ears and timing.** Possible (use its transcription and turn events, discard its speech), but it pays a $0.05/min session for what a $0.0075/min STT does, and GPT-Live transcript events "have no item ID or event that marks a completed conversational turn" (live-conversations guide). No advantage found.
3. **Code-written acknowledgements and backchannels through the same TTS.** This is the hybrid I recommend: within the cascade, pre-render a bank of short math-free phrases ("Mm-hm.", "Okay, let me look.", "Take your time.") in Maya's own voice and play one the moment the child's turn ends, while the controller works. D-195 safe (no number, no step), D-197 safe (code bank, no AI words), same voice, zero added latency.

## 4. Transport and orchestration

**LiveKit Cloud (keep).** Already built and tested. Pricing (https://livekit.com/pricing, read 2026-11-04): Build $0 with 1,000 agent minutes; Ship from $50/month with 5,000 agent minutes then $0.01/min, 150,000 WebRTC minutes then $0.0005/min. Turn detector and adaptive interruption are free on LiveKit Cloud.

**LiveKit Inference (change to it).** "Neither LiveKit nor the underlying model providers log, store, or train on your data," on every plan, for every STT/TTS/LLM it serves; observability and custom voices are separate (https://docs.livekit.io/agents/models/inference). It serves AssemblyAI Universal-3.6 Pro ($0.0075/min), Deepgram Flux ($0.0065/min Build/Ship), Inworld Realtime TTS 2.0 and 2.0 Flash, Cartesia Sonic 3.6, AssemblyAI TTS-1, Gemini TTS. It does not serve ElevenLabs or Soniox. This replaces two items of the privacy gate in `docs/maya-voice.md` (the AssemblyAI opt-out and Inworld retention) with one contract term, and Inworld's own ZDR is not offered below its Growth plan (https://inworld.ai/pricing). Child-use permission is still a separate question: LiveKit's ZDR is not a child-use approval.

Word timings through Inference: a merged agents-js PR (#1311, April 2026, https://github.com/livekit/agents-js/pull/1311) maps aligned transcripts to Cartesia `add_timestamps`, ElevenLabs `sync_alignment` and Inworld `timestamp_type: 'WORD'`. That is a PR description, not reference docs. Verify in a real call that the Node worker gets Inworld word times through Inference. If not, keep the direct Inworld plugin for TTS (TTS receives only Maya's text, which carries no child data if names stay out).

**Adaptive interruption (turn on, then test).** LiveKit's model separates backchannels ("mm-hm") from real barge-in. Vendor figures: 86% precision and 100% recall at 500 ms overlap, 51% of VAD false positives rejected; a false interruption resumes playback (https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/, Python agents 1.5.0 notes). Caveats: it runs on LiveKit Cloud's inference service (child audio goes there; confirm it is under the same ZDR), the docs say it can mistake a real interruption for a backchannel at the start or end of the agent's turn, and a community thread reports a Node error "failed to detect interruption after 3 attempts" (https://community.livekit.io/t/adaptive-interruption-error-nodejs-agents-sdk/670). For a child, "wait" or "why?" must always win; test that.

**Pipecat with Daily.** A credible alternative (Pipecat Cloud about $0.01/min, 1:1 Daily transport free per the 2026-10-29 research), Python only. Switching would throw away the tested TypeScript worker, board sync and recovery work for at most a cent a minute. Not worth it.

**Vendor WebRTC direct (OpenAI).** Only relevant if you pick GPT-Live, which I do not.

**iPad Safari and echo.** I found no 2026 measurement. Older reports: Safari on iOS letting the OpenAI Realtime assistant "respond to itself" (https://community.openai.com/t/realtime-api-echo-cancellation-bug-on-ios-safari/1075890, undated), echo cancellation off for the first ~10 s on iOS WebRTC (OpenAI community thread, undated), iPad WebRTC echo after 2 minutes (WebKit bug 239285, 2022). The worker already has `aecWarmupDuration`. Treat iPad speaker mode with the mic open as a must-test case: a self-interrupt there would ruin the call for a child.

## 5. STT for children

**No independent child-speech result exists for any current commercial streaming STT.** The newest independent work, DrivenData (published 2026-10-23, tests from mid-2025, https://drivendata.co/blog/child-asr-benchmarking), tested only open Whisper and KidWhisper: 13 to 17% WER for grades 3 to 5, 40 to 76% for pre-K to grade 1. Commercial claims are adult audio: AssemblyAI's own board lists Universal-3.6 Pro Realtime at 5.19% WER (https://www.assemblyai.com/benchmarks, vendor-run); Artificial Analysis lists ElevenLabs Scribe v2 at 2.3% (via the-decoder.com); Coval reported Deepgram Nova-3 at 25.3% in its voice-agent set, an outlier. None of this predicts a 7-year-old saying "um, fifty... six?".

What matters for Maya is exact numbers in short answers and not cutting a child off mid-number. AssemblyAI Universal-3.6 Pro has the best fit I found:
- Keyterms prompting up to 100 terms, included in the price, and changeable mid-stream (https://www.assemblyai.com/pricing, updated 2026-10-27; https://www.assemblyai.com/docs/streaming/universal-3-pro).
- `UpdateConfiguration` can change `keyterms_prompt`, `min_turn_silence` and `max_turn_silence` during a session. The controller knows the expected answer and the likely wrong answers for each step, so it can boost "fifty-six", "sixteen", "sixty" before the child answers, and lengthen the silence allowance when it asked a number question.
- End of turn is punctuation-based; AssemblyAI states 88% turn detection accuracy with its default prompt. For children who pause mid-number, 88% is not enough on its own; give the controller the right to wait for "fifty..." when the step expects a two-digit answer.

Deepgram Flux: built-in end-of-turn about 260 ms (vendor), eager end-of-turn events, on LiveKit Inference at $0.0065/min; accuracy "comparable to Nova-3" per vendor. Worth testing as the second ear. ElevenLabs Scribe v2 Realtime ($0.39/hour) has the best independent adult WER I found but is not on LiveKit Inference, and ElevenLabs' privacy policy says its service is not directed to children under 13 (secondary summary, conductatlas.com); it would receive child audio, so its terms matter more than for TTS.

The confidence-below-0.6 confirmation (`docs/maya-voice.md`) is the right safety net. Keep it, and count wrong numbers that came back with confidence above 0.6: those are the dangerous errors.

## 6. TTS: the voice

Artificial Analysis Speech Arena (blind pairwise votes, https://artificialanalysis.ai/text-to-speech/leaderboard, read 2026-11-04, no page date; prices per 1M characters):

| Rank | Model | Elo | Price | On LiveKit Inference |
|---|---|---|---|---|
| 1 | ElevenLabs Eleven v4 (Sep 2026) | 1334 | $80 | No |
| 2 | ElevenLabs Eleven v4 Turbo (Sep 2026) | 1331 | $40 | No |
| 4 | Cartesia Sonic 3.6 (Aug 2026) | 1293 | $49 | Yes |
| 5 | Google Gemini 3.8 Flash TTS | 1282 | $16.5 | Yes (terms issue) |
| 9 | Inworld Realtime TTS-2 (Aug 2026) | 1266 | $20.8 | Yes |
| 14 | AssemblyAI TTS-1 (Oct 2026) | 1221 | $15 | Yes |
| 16 | Inworld Realtime TTS-2 Flash | 1215 | $10.4 | Yes |

Read this with care: listeners are adults judging generic sentences, not children judging a patient tutor. 65 Elo points (ElevenLabs v4 Turbo over Inworld TTS-2) means v4 Turbo wins roughly 59% of pairings: a real but modest preference, which your own ears should confirm.

Per candidate:
- **Inworld Realtime TTS-2** (current choice): word timestamps in sync mode on the WebSocket, with timestamps in each audio chunk (https://docs.inworld.ai/tts/capabilities/timestamps); Inworld notes timestamps can add latency. Vendor TTFB under 100 ms P99 server-side (2026-10-29 research). $25/M on demand. Terms: account holder must be 18; no clause on end users' ages; "We will not train our generally available models on any Materials that are not publicly available" (https://inworld.ai/terms, effective 2025-06-11).
- **ElevenLabs Eleven v4 Turbo** (launched 2026-09-28): highest arena score at a realtime price ($0.04/1K characters, about 100 ms per ElevenLabs). One independent launch-day test measured about 90 ms to first audio after a flush and 138 ms in a streamed pipeline, and found v4 Turbo works only on the Text to Dialogue WebSocket while the TTS WebSocket returns HTTP 400 (https://micdrop.dev/blog/eleven-v4-turbo-voice-agent.md, 2026-09-29, single machine, single source). Whether that endpoint returns character alignment for the board is **not verified**. ElevenLabs' general terms bar under-18 users and allow training unless you opt out (2026-10-29 research). TTS would only receive Maya's text.
- **Cartesia Sonic 3.6**: word timestamps (`add_timestamps`, https://docs.cartesia.ai/api-reference/tts/websocket), speed and volume controls, on LiveKit Inference, vendor first audio under 90 ms. Direct ZDR needs an enterprise plan (https://docs.cartesia.ai/enterprise/zero-data-retention); Inference covers it.
- **OpenAI TTS**: `gpt-4o-mini-tts` is scheduled for removal on 2027-01-06 (2026-10-29 research); not a base for a new product.
- **Gemini 3.8 Flash TTS**: good arena score and price, but the Developer API terms exclude a service likely used by under-18s even if only Maya's text is sent. Only via Google Cloud after a terms check.

**How they read math.** I found no vendor test of reading "3/4" or "27 + 39". Do not let the TTS decide: since code writes every math line (D-195), code should also write the spoken form in words ("twenty-seven plus thirty-nine", "three quarters") and keep digits on the board. That removes text-normalization differences between vendors and makes word timestamps match the words code wrote. The worker's alignment code already prefix-matches approved words.

## 7. What makes a call feel human, and who provides it

| Feature | Cascade (LiveKit) gives | Speech-to-speech gives | What we must build |
|---|---|---|---|
| First-word delay under ~1 s | Possible if the controller is fast; today it is not | Built in, about 0.9 to 1.8 s measured on recordings | Instant code acknowledgement from a pre-rendered bank; faster turn model; stream the first accepted sentence |
| Barge-in | VAD or adaptive interruption; the worker already cancels unshown strokes | Built in | Test "wait", "why?", "stop" on iPad speakers |
| Backchannels from Maya ("mm-hm" while the child talks) | No | GPT-Live is full duplex and can do it | Optional later; risky with children (talking over them) |
| Ignoring the child's own "mm-hm" | Adaptive interruption | Built in | Tune; never ignore "wait" or "no" |
| Waiting through silence while the child writes | Controller clocks already do this | Model-driven, hard to control | Already built; tune check-in timing by age |
| Emotion and pacing | Voice choice, speed control, short sentences | Natural prosody | Pick the voice by ear; slow speed slightly for ages 6 to 8 |
| Exact math words | Yes | No (paraphrase) | Already built |
| Board in time with words | TTS word timestamps (Inworld, Cartesia; ElevenLabs alignment unverified for v4 Turbo) | No timing fields | Built; verify on real audio (#330) |

## 8. Cost per 10-minute call and per child per month (120 minutes)

Assumptions, stated so they can be checked: Maya speaks about 360 characters per call-minute (from the 2026-10-29 research); 25 Maya turns per 10-minute call; each turn proposal reads about 5,000 input tokens and writes about 700 output tokens including low-effort thinking (an estimate; I could not find measured token counts); about 10 free-talk reviews per call at about 1,500 input and 200 output tokens; prompt caching through OpenRouter at a 90% hit rate on the input. Claude prices from Anthropic's current table: Sonnet 5.5 $2/$10 per million input/output tokens, cache read $0.20; Haiku 5.5 $0.10/$0.50. OpenRouter routes at or near these rates; not verified per route.

Turn model cost per call:
- Sonnet 5.5, cached: 25 x (4,500 x 0.20 + 500 x 2 + 700 x 10) / 1,000,000 = 25 x 0.0089 = $0.22 per call = **$0.022/min**.
- Sonnet 5.5, no cache: 25 x (5,000 x 2 + 700 x 10) / 1,000,000 = $0.425 per call = $0.0425/min.
- Haiku 5.5, no cache: 25 x (5,000 x 0.10 + 700 x 0.50) / 1,000,000 = $0.021 per call = $0.002/min.
- Review on Haiku 5.5: 10 x (1,500 x 0.10 + 200 x 0.50) / 1,000,000 = $0.0025 per call, rounded into the above.

Per call-minute:

| Item | Option 1: LiveKit + Inference (U3.6 Pro, Inworld TTS-2) | Option 2: same, ElevenLabs v4 Turbo direct | Option 3: GPT-Live 1 + controller backend + our TTS for math lines |
|---|---|---|---|
| Agent / session | 0.0100 (LiveKit agent) | 0.0100 | 0.0500 (GPT-Live minute, silence billed) |
| WebRTC | 0.0010 | 0.0010 | 0 (direct WebRTC; app hosting not priced) |
| STT | 0.0075 | 0.0075 | 0 (included) |
| TTS | 0.0090 (360 x 25/M) | 0.0144 (360 x 40/M) | 0.0090 (math lines) |
| Turn model (Sonnet 5.5 cached) | 0.0220 | 0.0220 | 0.0220 |
| **Total USD/min** | **0.0495** | **0.0549** | **0.0810** |
| 10-minute call | USD 0.50, CAD 0.69 | USD 0.55, CAD 0.77 | USD 0.81, CAD 1.13 |
| 120 min/month | USD 5.94, **CAD 8.32** | USD 6.59, **CAD 9.22** | USD 9.72, **CAD 13.61** |
| With Haiku 5.5 as the turn model | USD 3.54, CAD 4.96 | USD 4.19, CAD 5.86 | USD 7.32, CAD 10.25 |

Fixed costs: LiveKit Ship is $50/month (CAD 70) and includes 5,000 agent minutes, about 41 children at full use. Below that, the fixed fee is the largest per-child cost (10 children at full use: CAD 7 each). The Build plan (free, 1,000 minutes) is enough for testing. These prices fit the earlier CAD 9 estimate. The turn model is the largest variable item, so measure real token counts before changing the price.

## 9. Children's use and data

- **STT is the sensitive part**: it receives the child's voice. Through LiveKit Inference, LiveKit says neither it nor the provider logs, stores or trains on the data. Directly, AssemblyAI offers zero retention of streaming audio and transcripts only for customers opted out of training, and keeps billing metadata (https://assemblyai.com/docs/data-retention-and-model-training); its documents do not mention children. Neither settles whether a service for 6 to 12 year olds is permitted: ask LiveKit (and through it the provider) in writing.
- **TTS receives only Maya's code-written text**, which never has the child's name in voice calls (`docs/maya-voice.md`). Inworld's "you must be at least 18" binds the account holder (Savar), not the listener. ElevenLabs' and Cartesia's policies say they are not directed at children; that concerns their own users. This is a much smaller question than STT, but get a one-line written answer anyway.
- **OpenAI** (only relevant for options with GPT-Live or Realtime): under-13 personal data only after approved ZDR; use the current flagship models for minors (https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance, no date on page).
- **Google Gemini Developer API**: forbidden for services likely accessed by under-18s (terms effective 2026-03-23).
- **Adaptive interruption and the turn detector** run on LiveKit Cloud inference; confirm they are under the same ZDR statement. Not verified.

## 10. Ranked top 3

| Rank | Option | First-word delay | Feel | CAD per child per month (120 min) | D-195 fit | Operating burden |
|---|---|---|---|---|---|---|
| 1 | LiveKit Cloud + Inference (AssemblyAI U3.6 Pro, Inworld TTS-2 or Cartesia Sonic 3.6 by ear) + instant code acknowledgement + faster turn model | Estimate about 0.3 s to the acknowledgement and 1.0 to 1.5 s to the answer after the fixes; today likely 2 to 4 s (not measured) | Good voice, exact math, board in sync; no Maya backchannels | 8.32 (Sonnet 5.5), 4.96 (Haiku 5.5), plus the Ship fee | Full | Lowest: one vendor account (LiveKit) for transport, STT and TTS; worker already built |
| 2 | Same, with ElevenLabs Eleven v4 Turbo as the voice (direct) | Same; v4 Turbo first audio about 90 to 140 ms in one test | Best-rated voice in blind adult votes | 9.22 (Sonnet), 5.86 (Haiku) | Full, if alignment works | Medium: a second vendor contract, training opt-out, v4 Turbo only on the Text to Dialogue WebSocket per one source, word alignment unverified |
| 3 | GPT-Live 1 for listening and free talk, our TTS for math lines, Maya's controller as backend | 0.9 to 1.8 s measured on recordings (Coval, weak) | Most natural turn-taking and free talk; voice changes for math lines | 13.61 | Poor alone (paraphrases); partial with the split | Highest: two speech systems, floor control between them, OpenAI ZDR approval for under-13, silence billed |

## 11. The strongest evidence

For the pick:
- OpenAI's own guide: commentary "may paraphrase"; for "exact wording" play a verified recording through your application; output audio events have "no timing fields" (https://developers.openai.com/api/docs/guides/live-conversations, read 2026-11-04). The best speech-to-speech product sends exact speech back to a cascade.
- Recording-based voice-to-voice times do not favour speech-to-speech: GPT-Live-1 1,780 ms and GPT Realtime 2 1,576 ms on the Coval board dated 2026-10-31 (via https://www.cartesia.ai/learn/speech-to-speech-vs-cascaded), against about 958 ms median for a cascade built from scratch (arXiv 2603.05413).
- LiveKit Inference ZDR by default on every plan for AssemblyAI U3.6 Pro, Inworld TTS-2 and Cartesia Sonic 3.6 (https://docs.livekit.io/agents/models/inference, read 2026-11-04).
- AssemblyAI keyterms and turn-silence settings can be changed mid-session (https://www.assemblyai.com/docs/streaming/universal-3-pro), which fits a controller that knows the expected answer.

Against the pick:
- ElevenLabs Eleven v4 and v4 Turbo lead the blind voice arena (1334 and 1331 Elo) over Inworld TTS-2 (1266), and ElevenLabs is not on LiveKit Inference (https://artificialanalysis.ai/text-to-speech/leaderboard, read 2026-11-04).
- Gemini 3.8 Live was fastest on the Coval board (861 ms) and would feel more fluid; only its terms keep it out.
- No current child-speech accuracy figure exists for AssemblyAI, Deepgram or anyone else (DrivenData, 2026-10-23). The STT choice is a guess until a child speaks into it.
- Our own pipeline, not the vendor, sets the first-word delay today, and I could not find a measurement of it.

## 12. A one-day listening test

Accounts: LiveKit Cloud (Build plan, free) with Inference; ElevenLabs API key (TTS only); optional OpenAI key for an adult-only GPT-Live reference call. No child audio goes anywhere except through LiveKit Inference, with a parent's consent (a child known to Savar), and nothing is recorded: log transcripts and timings only.

**Morning, part A: the voice (about 2 hours).** Render the same 12 sentences with 2 voices each from Inworld TTS-2, Inworld TTS-2 Flash, Cartesia Sonic 3.6 and ElevenLabs v4 Turbo (8 voice files per sentence). Write numbers in words, as code will. Sentences:
1. "Hi! I'm Maya. Let's look at this one together."
2. "Hmm, that's a tricky one. What did you try first?"
3. "Let's try an easier one first. What is twenty-seven plus thirty-nine?"
4. "Seven ones plus nine ones makes sixteen ones. We write the six and carry the one ten."
5. "Three quarters of the pizza is left. How many quarters were eaten?"
6. "Take your time. I'll wait while you write it on your paper."
7. "Good question! We carry because ten ones make one ten."
8. "Oops, that's okay. Mistakes help us learn. Let's look again."
9. "Is it thirteen or thirty?"
10. "Fourteen, forty, fifteen, fifty."
11. "You stuck with it the whole time. That was real effort."
12. "Okay, bye for now! See you next time."
Shuffle and rename the files so nobody knows the vendor. Three listeners: Savar, one parent, one child aged 6 to 12. Each picks a favourite per sentence and flags any misread word.
Pass bar: one voice is the first choice of at least 2 of 3 listeners overall; zero misread numbers in sentences 3 to 5 and 9 to 10; and word timestamps come back for sentence 4 (check the JSON). If ElevenLabs wins but returns no alignment on the v4 Turbo endpoint, it fails.

**Midday, part B: the ears (about 2 hours).** In one LiveKit room, send the child's microphone to two STTs at once (AssemblyAI U3.6 Pro with keyterms set to the expected answers, and Deepgram Flux), laptop first, then iPad Safari. The child says 40 short answers from a printed card: "seven", "twenty-seven", "um, fifty... six?", "thirteen", "thirty", "fourteen", "forty", "sixteen", "sixty", "zero", "I don't know", "why?", "wait", "no, I said sixteen", "three quarters", a whispered "eight", one answer with a sibling or TV in the background, and so on.
Pass bar per STT: at least 38 of 40 numbers exactly right; no wrong number with confidence of 0.6 or more; zero cut-offs in the middle of a two-part number ("fifty... six" must come out as 56, not 50); median time from the end of the child's speech to the final transcript at or under 500 ms.

**Afternoon, part C: the whole call (about 3 hours).** Five real 10-minute calls on iPad Safari using the speaker (no headphones), with the child and a workbook question, using the winning voice and ear. Run two worker builds: today's, and a fast-path build that plays a pre-rendered acknowledgement at end of turn and uses Haiku 5.5 for the turn proposal. Film the iPad with a phone to time sound and strokes.
Pass bar: median from end of the child's speech to Maya's first sound at or under 1.0 s, and to the first word of the answer at or under 1.8 s; zero self-interruptions from Maya's own voice; Maya stops within 300 ms of "wait" or "why?"; each board stroke appears within 250 ms of its word on the video; the child, asked "do you want to talk to Maya again?", says yes. Then do one 10-minute adult-only GPT-Live call as a reference for feel. If GPT-Live feels clearly better to Savar and the fast-path cascade misses the delay bar, revisit option 3.

## 13. What would change my mind

- A speech-to-speech model that offers an exact-read mode in its own voice, with word timings and a hard hold until code releases the line, plus approved under-13 ZDR. Then a single-voice hybrid becomes worth it.
- Part C: the fast-path cascade still has a median over 1.5 s to the first word of the answer after the fixes. Then the latency case for speech-to-speech becomes real.
- Part B: both cascade STTs miss 38 of 40 on a child's numbers and nothing (keyterms, longer turn silence) fixes it.
- Part A: ElevenLabs v4 Turbo wins clearly and its alignment works. Then option 2 becomes option 1, at about CAD 0.90 more per child per month and one more contract.
- LiveKit Inference does not return Inworld or Cartesia word times to the Node worker, or LiveKit will not confirm in writing that its ZDR and terms cover a service for children. Then use direct plugins with the existing privacy gate.

## Not verified

Coval board numbers (only via a vendor article, and two reads disagreed); every vendor latency figure; ElevenLabs v4 Turbo alignment and endpoint support; LiveKit Inference word timestamps in agents-js; adaptive interruption under ZDR; Maya's real token counts and turn latency; child-use permission from any provider; iPad Safari echo behaviour in 2026; Hume EVI's status; GPT-Live's ZDR eligibility (stated "with limitations" in the 2026-10-29 research, not rechecked).
