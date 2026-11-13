# Maya voice: infrastructure, orchestration, turn-taking, model speed

Read date for every source: 2026-11-12 unless another date is given. Tools: Keenable search and fetch, OpenRouter MCP (live endpoint stats, last 30 minutes). I did not run any call tests. Claims marked "unverified" have no primary source.

## Bottom line

Keep LiveKit Agents for Node on LiveKit Cloud. No alternative found passes all four hard constraints (exact code-approved words, word timings, ZDR, child use) and is also better. The real gains are configuration: lower the end-of-turn delay, give children longer pauses, and cut the model's first-token delay.

## Comparison table

| Option | Says code's exact text | Word timings for the board | ZDR | Child use (6-14) | Better than LiveKit here? |
|---|---|---|---|---|---|
| LiveKit Agents (Node) + Cloud + Inference | Yes (cascade) | Yes (TTS timestamps; verify in a real call) | Yes, default, all plans, every Inference LLM/STT/TTS (livekit.com/blog/how-we-handle-zero-data-retention-in-livekit, 2026-08-13) | No age clause found in LiveKit's ZDR text; not a child-use approval | Baseline |
| Pipecat + Pipecat Cloud | Yes | Yes | You choose providers | Same as providers | No. Python only; $0.01/min hosting (tradeswithai.com, 2026-10-27). Bluejay/G2 run: median turn 3.55 s vs LiveKit 3.30 s, vendor-run, config dependent (getbluejay.ai, 2026-11-02) |
| Vapi / Retell | Unverified | Unverified, not exposed in what I found | Vapi HIPAA is a USD 2,000/month add-on (retellai.com, 2026-11-07) | Unverified | No. They are phone-first orchestrators on top of the same models; they would hide the TTS timing path the board needs |
| ElevenLabs Agents | Unverified | Possible only on the TTS API | Enterprise only, API only (jazz.security, 2026-11-06) | Blocked in practice: ElevenAI terms (updated 2026-11-11) exclude under-18 users and children unless a written agreement allows it (news.sulat.com, 2026-11-11); general ToS bars under-18 (earlier research) | No |
| OpenAI GPT-Live 1 / Realtime 2.x | No. Model rewords backend text (flaviocopes.com, 2026-11-05). LiveKit issue 7996 (2026-10-20) confirms no mode where it speaks only supplied text | No timing fields (OpenAI guide, in earlier report) | Needs approval | Needs ZDR before under-13 data | No. Nothing new since the earlier council |
| Gemini Live | n/a | n/a | n/a | Still barred. Terms: no service "likely to be accessed" by under-18s. Google staff on 2026-10-22 forum answer only point to the terms and say talk to Cloud sales for Vertex (discuss.ai.google.dev, 2026-10-22). No exception found | No |
| Hume EVI | n/a | n/a | n/a | n/a | Dead. EVI and TTS APIs shut down 2026-11-13 (developersdigest.tech, 2026-10-20) |
| Ultravox | No (own speech model) | No | Unverified | Unverified | No. Inworld bought it 2026-09-30 (stork.ai, 2026-11-12); own model only |

## Verdict per layer

### 1. Orchestration and hosting: KEEP LiveKit Agents (Node) on LiveKit Cloud

Evidence:
- Node has the audio turn detector (v1, `@livekit/agents` 1.4.7 or later), adaptive interruption, STT endpointing, VAD and manual turns (docs.livekit.io/agents/logic/turns/turn-detector and /turns/).
- Node gaps I could confirm: **dynamic endpointing is Python only**; several manual-turn helpers are Python only (same docs page). Node preemptive generation: docs do not say; the agents-js repo has telemetry for "a discarded preemptive generation" (commit 72898e1, 2026-09-26), so it exists, but docs-level support is unverified.
- Agents-js is moving fast in October (adaptive interruption without word timestamps, AssemblyAI U3.6 Pro word timings for interruption; commits d3a0abe and f6ea8df, 2026-09-22/25).
- Cloud agent hosting regions: us-east, eu-central, ap-south only. No Canada agent region (community.livekit.io, 2026-10-07). Canada pinning exists for SIP. Ask LiveKit in writing whether Canadian child audio hosted in us-east meets your consent text.
- Pricing: Build USD 0, Ship USD 50/month with 5,000 agent minutes then USD 0.01/min (superdupr.com, 2026-10-25). No Inference model is free any more (usagepricing.com, 2026-10-15). Inworld TTS-2 is the cheaper end; Cartesia Sonic 3.6 is USD 0.03/min.

Would reverse: a measured real-call failure of word timings through Inference in Node, or LiveKit refusing the child-audio terms.

### 2. Models on LiveKit Inference: KEEP, but Claude is NOT on Inference

LiveKit Inference LLMs are OpenAI, Gemini, DeepSeek, Gemma, Kimi, Grok. No Anthropic (docs.livekit.io/agents/models/llm). Maya's model stays on OpenRouter through the Anthropic or OpenAI-compatible plugin. That means Maya's text path has its own ZDR question: check OpenRouter's ZDR setting and pin providers (Anthropic, Bedrock or Vertex) to ZDR endpoints. I did not verify this. STT and TTS can stay on Inference with ZDR.

### 3. Turn-taking: SWITCH LATER (by configuration), start now with three settings

Evidence:
- LiveKit's own eot-bench (numbers reproduced by third parties, 2026-10): LiveKit Turn Detector v1 false cut-offs 9.9% at 300 ms wait, 4.5% at 600 ms, 543 ms mean wait at 5% cut-offs. Smart Turn v3.2 (Pipecat): 35.2% / 14.8% / 1,051 ms. Deepgram Flux needs +603 ms to halve its cut-offs from 10% to 5% (evalgent.com, 2026-10-04; huggingface.co cards, 2026-10-02). These use adult audio. **No benchmark of children's speech exists in anything I found.** DrivenData work in the earlier report covers STT only.
- Pipecat's own Smart Turn author-side tests show long pauses (1.5 s or more) remain the weak spot: 50-60% false alarms (huggingface.co/OpenHRI/smart-turn-streaming, 2026-09-29). A child pausing to work out 7 + 8 is exactly that case.
- Trap in the current build (`turnDetection: "stt"`): LiveKit adds `min_delay` (default 0.5 s) after the STT's own end-of-turn signal, "in addition to" the STT delay (evalgent.com, 2026-10-04, quoting docs.livekit.io/reference/agents/turn-handling-options). Lowering it to about 0.1 s recovers about 400 ms in their worked example. Measure it on Maya's worker first.
- LiveKit staff on 2026-11-09: for hesitant speakers use dynamic endpointing (learns the user's pause length, upward only). That is Python only, so on Node set it by hand.

Do now (config, no switch):
1. Lower `min_delay` for STT mode; test.
2. Make the controller own patience. It knows when it has asked a number question. Raise the end-of-turn silence then (AssemblyAI `UpdateConfiguration` for `max_turn_silence`; Deepgram Flux `Configure` for `eot_timeout_ms` and `eot_threshold`, both mid-stream per Deepgram docs read via zian.ai 2026-09-18). Flux's 5,000 ms default timeout still fires even at threshold 1.0.
3. Test LiveKit audio turn detector v1 (served on Inference in every region) against STT endpointing on recorded children saying "um, fifty... six".

Would reverse: a recorded set of children's turns where v1 cuts off more than 10% of mid-thought pauses, then move to a manual or controller-gated commit.

### 4. Language model speed: SWITCH LATER (voice path uses a faster model plus caching)

OpenRouter live stats (first-token latency, last 30 minutes, 2026-11-12; mixed workloads, so they overstate a short prompt):

| Model / provider | p50 | p90 | Notes |
|---|---|---|---|
| Sonnet 5.5, Anthropic | 1.49 s | 3.46 s | USD 2 / 10 per M |
| Sonnet 5.5, Azure (global) | 0.93 s | 2.45 s | |
| Sonnet 5.5, Google Vertex Europe | 0.86 s | 2.39 s | low volume (7,104 requests) |
| Sonnet 5.5, Amazon Bedrock | 2.36 s | 5.50 s | slowest of the big routes |
| Haiku 5.5, Anthropic | 1.18 s | 2.79 s | USD 0.10 / 0.50 per M |
| Haiku 5.5, Google Vertex Europe | 0.48 s | 2.03 s | low volume |
| Haiku 5.5, Bedrock us-east-1 | 0.76 s | 3.95 s | low volume |
| GPT-6.1 Terra, OpenAI default | 2.99 s | 6.56 s | slower; not an upgrade |

Findings:
- Sonnet 5.5 mandates reasoning (OpenRouter model data), so even at effort low the first token waits behind thinking. Haiku 5.5 does not remove the first-token delay either: 1.2 s p50 direct. Provider choice moves p50 by 1.5 to 2 times; model size alone does not.
- OpenRouter shows `supports_implicit_caching: false` for both Claude models. Caching needs explicit `cache_control` breakpoints. Cache reads cost USD 0.10 per M (Sonnet 5.5) and USD 0.01 per M (Haiku 5.5). Put the stable prompt and the question package first. Unverified: whether it cuts first-token time for Maya's prompt size.
- No model fixes the real problem in the earlier report: Maya's worker waits for the whole controller turn (structured output, repair, review) before speaking. Speed comes from the pre-rendered code acknowledgement and streaming the first approved sentence.

Do now: pin provider order for Sonnet 5.5 (Azure global or Vertex first, Anthropic fallback; check each is ZDR). Measure p50 and p95 from the worker's own traces. Test Haiku 5.5 for the proposal step on easy question types; keep Sonnet 5.5 for hard ones.

Would reverse: Haiku 5.5 proposals failing the code controller's guards more often (more repair calls), which erases the speed gain.

## Not verified, so do not rely on it

- Any exact-read mode with word timings in Realtime, Vapi, Retell or ElevenLabs Agents.
- ElevenLabs v4 Turbo timing through LiveKit: the Python plugin returns chunk-relative timings for v4 (livekit/agents issue 7773, 2026-10-13). Node plugin state unknown. Another reason not to switch voice now.
- Children's speech accuracy of any turn detector.
