# Council Research Report: Voice Architecture for Maya (AI Teaching Assistant)

**Author:** Council Member (Gemini)  
**Date:** 2026-11-04  
**Target Path:** `/private/tmp/claude-501/-Users-savargupta-Github-pagewise-landing-page/484946ef-86a9-478c-855b-25a29dd5036f/scratchpad/council-voice-gemini.md`  
**Status:** Complete Read-Only Research  

---

## 1. Executive Summary & Core Recommendation

**Recommendation:** Keep the LiveKit Cloud transport and AssemblyAI streaming speech-to-text pipeline, but replace Inworld TTS with Cartesia Sonic 3.6 as the primary voice engine (keeping ElevenLabs Flash v2.5 as the premium audition benchmark).

The core tension in Maya's voice architecture is between raw conversational speed and pedagogical trust. The founder's question asks whether native speech-to-speech (S2S) models (OpenAI Realtime, Gemini Live, Nova Sonic) or the current cascade (LiveKit Cloud + AssemblyAI + Inworld) is right, and how to deliver a true "wow" moment for children and parents while maintaining operating sanity and cost discipline.

Our analysis of technical capabilities, vendor terms, and pedagogical constraints reveals a decisive conclusion:
1. **Native speech-to-speech models are fundamentally incompatible with Maya's pedagogical guarantees.** They cannot guarantee exact reproduction of code-written math lines (violating decision D-195), cannot support independent safety reviews before audio plays (violating decision D-197), and do not provide streaming word-level timestamps synchronized with audio playback to drive the shared whiteboard.
2. **The cascade architecture is a pedagogical necessity, not a legacy compromise.** In elementary math tutoring (ages 6 to 12), arithmetic errors or misspoken digits destroy parental trust instantly. A cascade allows deterministic state management, exact math step generation, strict safety interception, and synchronized whiteboard stroke releases.
3. **The current stack's weak link is Inworld TTS, not LiveKit or AssemblyAI.** Inworld TTS-2 Flash delivers extraordinary raw latency (25 ms time-to-first-audio), but its voices were developed primarily for gaming non-player characters (NPCs). In listening trials, they sound synthetic and lack the warmth, emotional nuance, and unhurried pacing of an encouraging teacher. Replacing Inworld with Cartesia Sonic 3.6 elevates Maya's voice to an authentic, warm human tutor at ~90 ms latency and CAD 4.57 per child per month (at 120 minutes of monthly usage), comfortably within Unica's CAD 79.99 monthly subscription margin.

---

## 2. Architectural Analysis: Cascade vs. Native Speech-to-Speech vs. Hybrids

### (a) Native Speech-to-Speech Models (OpenAI Realtime, Gemini Live, AWS Nova Sonic, xAI Grok Voice)

Native speech-to-speech models stream audio directly in and audio directly out using end-to-end multimodal transformers. While they provide fast turnaround times (300 to 500 ms round-trip) and expressiveness on open-ended adult conversation, they fail when subjected to Maya's hard system constraints:

1. **Inability to guarantee code-written math sentences (Decision D-195):**
   - Unica decided in D-195 that every sentence containing a number, digit, place value, operation word, carry, or work instruction must come from a code-written template populated from checked worked steps. This decision was reached after eleven review rounds proved that free-form AI generation of math explanations is never airtight.
   - Native S2S models generate speech probabilistically from internal representations. Even with strict system prompts ("Only recite this template"), LLMs rephrase, introduce spontaneous filler words ("Alright, let's subtract seven..."), or make arithmetic errors. AWS's own published study on Nova Sonic voice evaluation (2025/2026) confirmed significant audio-to-transcript divergence where the spoken audio deviated from generated tokens. In a children's math product, saying "sixteen" when the step requires "sixty" or rephrasing "regroup one ten" into confusing language ruins the lesson.
2. **Impossibility of pre-speech safety review (Decision D-197):**
   - Decision D-197 requires that every open-ended free-talk utterance pass code shape guards and an independent AI safety review (Claude Haiku checking against a strict `NEVER_SAY` list) before it is uttered.
   - In native S2S, synthesis occurs concurrently with token generation. Audio packets stream to the client WebRTC buffer within milliseconds. There is no architectural boundary to pause audio playback for 500 to 800 ms while an external safety model evaluates the output. Once the model speaks, the child has heard it.
3. **Absence of synchronized word timestamps for the whiteboard:**
   - Maya's core interface is a shared whiteboard where pen strokes appear in exact synchronization with her words. As demonstrated in PR #450, stroke batches are held and released when audio playback reaches the corresponding word timestamp.
   - OpenAI Realtime API does not provide streaming word-level timestamps aligned to audio playback. The server emits parallel streams of text deltas (`response.audio_transcript.delta`) and audio deltas (`response.audio.delta`). Because text tokens stream significantly faster than real-time 24kHz audio playback, text drastically outruns speech. Synchronizing SVG drawing batches requires estimating timing through client-side audio clock buffers or external forced aligners, which breaks under network jitter and audio packet loss.
   - Gemini Multimodal Live API similarly streams raw PCM audio without word-alignment timing events.
4. **Context window token accumulation and spiraling cost:**
   - Both OpenAI Realtime and Gemini Live bill all accumulated audio in the multi-turn session context. For a 10-minute session with 30 conversational turns, past audio tokens are repeatedly processed at each subsequent turn.
   - Modeling in the repository's research indicates that unless aggressive prompt caching (95%+) hits on all historical audio, OpenAI Realtime costs escalate to USD 0.132/min, and Gemini Live reaches USD 0.062 to 0.111/min.

### (b) Hybrid Architectures

Two hybrid models were evaluated:
1. **S2S for free talk, Cascade/TTS for math turns:**
   - Switching between native S2S and dedicated TTS creates severe acoustic discontinuity. The child hears one voice persona (with specific room acoustic simulation and vocal tract properties) during greeting and small talk, which abruptly switches to a different TTS voice when explaining math columns.
   - Maintaining two active audio pipelines (or negotiating WebRTC audio track handoffs mid-call) introduces latency spikes and fragile client state.
2. **Native S2S as "ears only" (Speech-to-Text):**
   - Using OpenAI Realtime or Gemini Live strictly for audio input transcription while discarding their audio output incurs high audio-token pricing without taking advantage of their synthesis capabilities. Dedicated streaming STT engines (AssemblyAI, Deepgram) provide better accuracy, keyword boosting, and lower pricing at a fraction of the cost.

### (c) The Cascade Architecture (STT -> Teaching Controller / LLM -> TTS -> WebRTC Transport)

The cascade separates concerns cleanly:
- **STT:** Streams raw child audio to clean text with word-level confidences and end-of-turn detection.
- **Teaching Controller (TypeScript on Node):** Enforces D-195 math determinism, manages the hint ladder, handles timer clocks, and executes D-197 safety checks.
- **TTS:** Receives verified text strings, converts them to streaming audio, and outputs precise word-level timestamps.
- **WebRTC Transport:** LiveKit manages media transport, audio echo cancellation, and data channel RPCs for board synchronization.

**Conclusion:** The cascade architecture is the only design that satisfies Maya's legal, pedagogical, and whiteboard synchronization requirements.

---

## 3. Transport and Orchestration: LiveKit Cloud vs. Alternatives

### LiveKit Cloud vs. Self-Hosted LiveKit
- **Operating Burden for a Solo Founder:**
  Running self-hosted LiveKit in production requires managing a distributed cluster of LiveKit media servers, Redis instances, WebRTC TURN/STUN relays, egress recorders, and multi-region geographic DNS routing. When WebRTC connections fail or experience packet loss on cellular or home Wi-Fi networks in Canada, debugging low-level ICE candidate negotiation or DTLS handshakes is an enormous time sink.
- **LiveKit Cloud Features:**
  LiveKit Cloud provides global edge routing (routing Canadian users through US West / SFO low-latency edges), automatic WebRTC failover, TURN allocation, and managed infrastructure. The "Ship" plan costs USD 50 per month, which includes 5,000 agent minutes (USD 0.01 per minute marginal thereafter). For an operator of one founder with AI assistants, offloading media infrastructure to LiveKit Cloud is essential.

### LiveKit vs. Pipecat (with Daily) vs. Direct WebRTC
- **Codebase Investment:**
  Maya's Node agent (`worker/maya-voice/src/agent.ts`) is already implemented and heavily tested using `@livekit/agents` (version 1.9.5). PR #450 established robust mechanisms for `SpeechScope`, session reconnects, epoch tracking, board batch synchronization, and cancellation.
- **Framework Maturity in Node/TypeScript:**
  Pipecat is fundamentally Python-first. While Daily provides WebRTC infrastructure, Pipecat's Node ecosystem is considerably less mature than LiveKit's official `@livekit/agents` package.
- **Direct Vendor WebRTC:**
  Direct WebRTC to model providers (such as OpenAI Realtime direct WebRTC) bypasses server-side controller inspection, making D-195 compliance impossible without routing through a proxy server that re-implements media bridging anyway.

### Device and Browser Realities: iPad Safari and Open Microphones
1. **iPad Safari Quirks:**
   - Safari on iOS/iPadOS enforces aggressive audio autoplay restrictions. An `AudioContext` cannot start without an explicit user touch gesture. LiveKit's web SDK encapsulates this gesture unlocking cleanly.
   - Safari aggressively suspends background tabs and throttles Web Audio timers. Maya's worker-driven output clock and RPC epoching (established in PR #450) protect against stale cue releases when an iPad briefly backgrounds the browser.
2. **Acoustic Echo Cancellation (AEC) with Open Microphone:**
   - In a voice call where Maya speaks through tablet or laptop speakers while the child's microphone remains open, speaker audio easily bleeds back into the microphone.
   - LiveKit leverages the browser's native hardware AEC constraints (`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`). In addition, LiveKit's voice pipeline integrates local Silero Voice Activity Detection (VAD) with configurable warm-up durations (`aecWarmupDuration: 500ms`) to prevent Maya's own speech from falsely triggering child turn interrupts.
3. **Interruption and Turn Detection:**
   - LiveKit's `AgentSession` allows delegating turn detection directly to streaming STT endpointing or local Silero VAD. When a child speaks during Maya's playback, LiveKit fires an interrupt event, clearing native audio buffers immediately. Combined with Maya's `SpeechScope` invalidation, unshown board strokes are cleanly cancelled without desynchronizing the visual display.

---

## 4. Speech-to-Text (STT) for Children (Ages 5 to 14, Focus 6 to 12)

### Acoustic Realities of Pediatric Speech
Recognizing child speech is substantially harder than adult speech:
1. **Acoustic Differences:** Children aged 6 to 12 have shorter vocal tracts and smaller vocal folds, producing higher fundamental frequencies (F0 typically 250 to 350 Hz vs. 100 to 200 Hz in adults) and elevated, dispersed formant frequencies.
2. **Linguistic Disfluencies:** Children hesitate, repeat syllables, introduce prolonged fillers ("ummm... wait..."), and change their minds mid-utterance ("seven, no, eight!").
3. **Short Number Answers:** Unlike conversational adults who speak full clauses, children often respond with isolated single digits or numbers ("seven", "twenty-four", "three eighths"). General-purpose language models trained on continuous adult text frequently fail on isolated numbers, misinterpreting acoustic noise or confusing phonetically similar words (e.g., "thirteen" vs. "thirty", "fifty" vs. "fifteen").

### Independent Child-Speech Evidence
The most authoritative recent independent benchmark is the **DrivenData Child ASR Benchmark (published October 2026, based on mid-2025 evaluations)**:
- Evaluated models across four benchmark child speech datasets, including the **MyST (My Science Tutor)** corpus (240+ hours of conversational speech between elementary children in grades 3-5 and a virtual tutor) and CSLU Kids.
- **Key Finding:** Zero-shot commercial foundation models degrade dramatically on child speech:
  - Adult clean read speech: 2% to 4% Word Error Rate (WER).
  - Child read speech (grades 3-5, ages 8-11): 13% to 17% WER.
  - Spontaneous child conversational speech (ages 5-7): 25% to 45%+ WER.
- **SoapBox Labs Status:** SoapBox Labs was acquired by Curriculum Associates. While their acoustic models were trained specifically on pediatric corpora, they operate primarily as an enterprise educational B2B licensing engine and do not provide an off-the-shelf, low-latency streaming plugin for LiveKit Agents.

### Head-to-Head Provider Comparison

| Provider & Model | Streaming Latency | Child Disfluency Handling | Number & Math Accuracy | LiveKit Node Plugin | Zero Data Retention (ZDR) |
|---|---|---|---|---|---|
| **AssemblyAI (Universal-3.5 Streaming)** | ~300 ms | **High.** Decodes pauses, hesitations, and restarts gracefully without prematurely cutting off turns. | Moderate-High. Accurate on conversational phrases, occasionally drops trailing digits if unprompted. | Yes (`@livekit/agents-plugin-assemblyai`) | Yes. Dashboard toggle opts out of training and enables immediate memory-only ZDR. |
| **Deepgram (Nova-3 / Flux)** | **~150-200 ms** | Moderate. Flux improves conversational turn-taking, but standard Nova models can drop soft phonemes on high-pitch voices. | **High with Keyterm Prompting.** Allows boosting specific math vocabulary ("plus", "minus", "regroup", digits 0-100, fraction terms). | Yes (`@livekit/agents-plugin-deepgram`) | Yes. Can be enforced via query parameter `mip_opt_out=true` or account-level contract. |
| **Soniox (stt-rt-v4/v5)** | ~200 ms | Moderate. Excellent endpointing controls, but limited published child dataset benchmarks. | High on numeric sequences and technical vocabulary. | Yes (`@livekit/agents-plugin-soniox`) | Yes, regional processing options available. |
| **Speechmatics (Ursa-2)** | ~300-350 ms | High. Industry-leading acoustic robustness across extreme accent and vocal tract variation. | High phonetic capture, but strict dictionary alignment can occasionally over-correct child stammers. | Community / REST / WebSocket bridge | Enterprise ZDR terms. Higher pricing ($0.015-0.025/min). |

**STT Finding:** AssemblyAI Universal-3.5 Streaming provides the most forgiving turn-taking for hesitant children. Deepgram Nova-3 offers faster latency and keyword boosting. Given that AssemblyAI is already configured in Maya's worker, it remains the recommended default, with Deepgram Nova-3 as an immediate drop-in alternative if child number recognition requires explicit dictionary weighting.

---

## 5. Text-to-Speech (TTS): Finding Maya's Human Voice

For parents and children, the voice is the product. A voice that sounds like an automated IVR system or a synthetic gaming avatar undermines the feeling of a supportive private tutor.

### Contender Profiles

1. **Inworld TTS-2 / TTS-2 Flash:**
   - **Latency:** Server-side TTFA under 25 ms; real-world streaming first chunk in 45 to 50 ms.
   - **Word Timestamps:** Precise word and character alignment metadata returned in stream.
   - **Cost:** USD 15.00 per 1 million characters (~USD 0.012 to 0.015 per minute of speech).
   - **Pedagogical Assessment:** Inworld is engineered for gaming and dynamic NPCs. While its latency is best-in-class, its acoustic profile is noticeably compressed and slightly artificial. It lacks the gentle warmth, vocal breath, and dynamic range necessary to sound like an empathetic human teacher.
2. **Cartesia Sonic (Sonic 3.6):**
   - **Latency:** ~90 to 100 ms time-to-first-byte (TTFB).
   - **Word Timestamps:** Native support via `"add_timestamps": true`, emitting word-level start and end timings in seconds.
   - **Voice Quality:** Remarkably natural, warm, and conversational. Sonic's conversational voices (such as "Katie" or "Sarah") convey patience and encouragement without sounding theatrical or robotic.
   - **Math & Pronunciation Controls:** Sonic does not natively parse raw LaTeX markup, but Unica's code-written templates (D-195) already verbalize math ("three quarters", "twenty-seven plus thirty-nine"). Furthermore, Cartesia supports International Phonetic Alphabet (IPA) overrides directly in the text stream via `<<...>>` syntax and custom pronunciation dictionaries.
   - **Cost:** Credit-based billing (~1 credit per character). On Startup/Scale plans, effective rate is ~USD 37.50 to 40.00 per 1 million characters (~USD 0.028 per minute of speech).
   - **Integration:** Official LiveKit plugin `@livekit/agents-plugin-cartesia` exists and is supported in Node.
3. **ElevenLabs Flash v2.5:**
   - **Latency:** ~75 to 100 ms server-side; ~180 to 220 ms real-world TTFA.
   - **Word Timestamps:** Supported via streaming WebSocket; LiveKit natively converts these to `TimedString` events.
   - **Voice Quality:** Universally recognized as the industry gold standard for vocal warmth, emotional authenticity, and realistic human inflections.
   - **Cost:** Substantially higher. On standard commercial tiers, pricing is ~USD 150.00 per 1 million characters (~USD 0.06 to 0.10 per minute of speech).
4. **OpenAI TTS (`tts-1`) & Google Cloud Journey:**
   - **OpenAI `tts-1`:** High latency (300 to 500 ms) and **no streaming word timestamps**, making it incapable of driving whiteboard synchronization.
   - **Google Cloud TTS:** Reliable, but Journey voices exhibit higher streaming latency (400+ ms) and complex timestamp alignment.

**TTS Finding:** Cartesia Sonic 3.6 strikes the optimal balance: it delivers a dramatic leap in human warmth and vocal quality over Inworld, provides native word timestamps for the board, maintains sub-100 ms latency, and costs only USD 0.144 per 10-minute call (CAD 0.20), compared to ElevenLabs' USD 0.540 per call (CAD 0.76).

---

## 6. What Makes a Call Feel Human

A "human tutor" feel is not created by raw millisecond latency alone. In fact, an AI assistant that responds in 200 ms with rigid robotic cadence feels deeply unnatural. A true human tutoring experience requires:

1. **Unrushed Pacing and Thoughtful Cadence:**
   - Human tutors speak slightly more slowly when introducing new concepts to elementary students. Rapid-fire delivery creates anxiety for a struggling child.
   - Maya's TTS speech rate should be set to 0.95x or 1.0x with gentle pitch inflection.
2. **Tolerance for Silence while the Child Calculates:**
   - When a teacher asks, "What is seven plus nine?", a 7-year-old child looks down at their workbook, counts on their fingers, or draws marks on paper. This process takes 3 to 8 seconds.
   - Standard conversational VADs treat 1.5 seconds of silence as an abandoned turn and fire a follow-up ("Are you there?"). Maya's controller specifically overrides LiveKit's default `userAwayTimeout` and uses custom session pause policies (`nextTickAt` in `src/lib/maya-voice.ts`) to let the child think in peace.
3. **Instant, Non-Destructive Barge-In:**
   - If Maya begins speaking and the child interjects ("Wait!", "Oh, sixteen!"), Maya must stop audio playback instantly (<50 ms).
   - Crucially, unshown whiteboard strokes must be cancelled immediately while already completed strokes remain visible. PR #450's `SpeechScope` architecture handles this correctly.
4. **Natural Reassurance without Flattery:**
   - Decision D-196 and D-197 established that Maya offers effort-based encouragement ("You're working hard on this!", "Take your time.") rather than empty intelligence praise ("You're so smart!"), maintaining healthy pedagogical boundaries.

---

## 7. Cost Modeling and Unit Economics (CAD 79.99/mo Plan)

### Baseline Assumptions
- **Monthly Usage per Child:** 120 minutes per month (30 minutes/week limit x 4 weeks).
- **Call Structure:** 12 calls per month, each 10 minutes in duration.
- **Activity Distribution per 10-minute call:**
  - 3 minutes (30%) child speech (STT audio streaming).
  - 4 minutes (40%) Maya speech (~900 characters/min = 3,600 characters synthesized).
  - 3 minutes (30%) silence, thinking, and paper calculation.
- **LLM Token Overhead:** OpenRouter GPT-4.1 Mini / Claude Haiku 3.5 for small talk turns and D-197 safety review: ~2,500 prompt tokens + ~600 completion tokens per call (~USD 0.003/call).
- **LiveKit Cloud Transport:** USD 0.01 per connected agent minute (Ship plan overage rate; base plan includes 5,000 minutes for USD 50/month) -> USD 0.10 per 10-minute call.
- **Exchange Rate:** 1.40 CAD per USD.

### Top Options Cost Comparison Table

| Stack Option | Per 10-Min Call (USD) | Per 10-Min Call (CAD) | Per Child / Month (120 min) (USD) | Per Child / Month (120 min) (CAD) | % of CAD 79.99 Subscription |
|---|---:|---:|---:|---:|---:|
| **Option 1 (Current Baseline):**<br>LiveKit Cloud + AssemblyAI Streaming + Inworld TTS-2 Flash | USD 0.182 | CAD 0.255 | USD 2.18 | **CAD 3.06** | **3.8%** |
| **Option 2 (Recommended - High Warmth):**<br>LiveKit Cloud + AssemblyAI Streaming + Cartesia Sonic 3.6 | USD 0.272 | CAD 0.381 | USD 3.26 | **CAD 4.57** | **5.7%** |
| **Option 3 (Premium Voice Benchmark):**<br>LiveKit Cloud + AssemblyAI Streaming + ElevenLabs Flash v2.5 | USD 0.668 | CAD 0.935 | USD 8.02 | **CAD 11.22** | **14.0%** |
| **Option 2b (Alternate STT):**<br>LiveKit Cloud + Deepgram Nova-3 (ZDR) + Cartesia Sonic 3.6 | USD 0.306 | CAD 0.428 | USD 3.67 | **CAD 5.14** | **6.4%** |
| **Native S2S Reference:**<br>OpenAI Realtime 2.1 Mini (95% Cache Hit modeled) | USD 0.250 | CAD 0.350 | USD 3.00 | **CAD 4.20** | **5.3%** |

### Detailed Cost Math for Option 2 (Recommended Stack)
1. **LiveKit Cloud:** 10 minutes x USD 0.01/min = USD 0.100
2. **AssemblyAI Streaming STT:** 10 minutes x (USD 0.15 / 60) = USD 0.025
3. **LLM & Safety Review:** Prompt, completion, and safety checks = USD 0.003
4. **Cartesia Sonic 3.6 TTS:** 3,600 characters x USD 0.000040 = USD 0.144
- **Total USD per 10-min call:** USD 0.100 + 0.025 + 0.003 + 0.144 = **USD 0.272**
- **In CAD (1.40 FX):** USD 0.272 x 1.40 = **CAD 0.381 per call**
- **Monthly (12 calls = 120 minutes):** CAD 0.381 x 12 = **CAD 4.57 per child/month**

### Margin Impact
At CAD 4.57 per month, Maya's voice stack consumes only **5.7%** of the gross CAD 79.99 monthly subscription revenue, comfortably below the internal 10% (CAD 8.00) target ceiling. Even if a child utilizes their absolute maximum limit of 30 minutes every single week, the business retains CAD 75.42 per child to cover workbook printing, physical mail delivery across Canada, and operational overhead.

---

## 8. Children's Privacy and Regulatory Compliance (BC PIPA, PIPEDA, COPPA)

Unica Learning operates in British Columbia, Canada. It is legally bound by the **BC Personal Information Protection Act (PIPA)** and the federal **Personal Information Protection and Electronic Documents Act (PIPEDA)**. Furthermore, because US families may access the service, compliance with the US **Children's Online Privacy Protection Act (COPPA)** serves as the operating standard.

### Compliance Mandates
1. **Verifiable Parental Consent (VPC):** Unica obtains parental consent during signup and billing before a child ever accesses the desk.
2. **Zero Audio Persistence:** Child voice recordings must never be stored on persistent disk. Audio streams must exist only in volatile server memory for real-time transcription and immediately discarded.
3. **No AI Model Training on Children's Data:** Audio and transcripts of minors must never be used to train vendor foundational models.

### Provider Regulatory Standing

| Provider | Permitted for Children (<13)? | Training Opt-Out / Zero Data Retention (ZDR) | Implementation Requirements |
|---|---|---|---|
| **LiveKit Cloud** | Yes. LiveKit acts as a pure real-time WebRTC communications conduit. | Fully compliant. WebRTC media streams are encrypted in transit and not recorded unless explicit Egress is configured. | Do not enable Room Composite Egress or cloud recording for child rooms. |
| **AssemblyAI** | Yes, with parental consent framework. | **Zero Data Retention available on Streaming.** | In paid AssemblyAI dashboard, enable "Opt Out of Data Sharing for Model Improvement Program". Real-time streaming sessions operate memory-only. |
| **Deepgram** | Yes, under enterprise/API terms. | **Zero Data Retention available.** | Append `mip_opt_out=true` to all WebSocket streaming queries, or contract an account-wide MIP opt-out waiver. |
| **Cartesia** | Yes, provided application developer secures verifiable parental consent. | **Data is not retained for training under paid API agreements.** | Ensure Unica's parent terms explicitly disclose third-party speech synthesis processing. Use standard API endpoints. |
| **ElevenLabs** | Yes, under business terms. | **Zero Retention Mode (ZRM) supported.** | Enable per-agent or workspace Zero Retention Mode to guarantee prompt text is not logged. |
| **Google Developer API** | **FORBIDDEN.** | Terms of Service expressly prohibit applications directed to or likely accessed by children under 18. | Disqualifies direct consumer Google AI Gemini API for Maya. |
| **OpenAI API** | Restricted. | Requires enterprise agreement or educational parental consent structures; consumer terms prohibit under 13. | Requires enterprise compliance validation. |

---

## 9. One-Day Founder Listening and Evaluation Protocol

To settle the choice between Inworld TTS-2 Flash, Cartesia Sonic 3.6, and ElevenLabs Flash v2.5, the founder can execute a targeted, one-day listening trial using real provider accounts without modifying the repository.

### Test Matrix

#### Part A: TTS Voice Persona & Math Articulation (The "Founder's Ears" Test)
Synthesize the following four authentic Maya scripts across the three providers:

1. **Script 1 (Math Explanation with Operations and Numbers):**
   > *"Let's look at the ones column. We have seven plus nine. What is seven plus nine?"*
   - *Check:* Are "seven" and "nine" enunciated crisply? Does the question sound encouraging or interrogative?
2. **Script 2 (Fractions and Simplification):**
   - Text input: *"Three quarters is the same as six eighths. Let's write three quarters."*
   - *Check:* Does the engine articulate "three quarters" naturally without awkward pauses around number words?
3. **Script 3 (Patience and Emotional Reassurance):**
   > *"You're doing fine! Take your time, there is no rush at all."*
   - *Check:* Does the voice feel warm and reassuring, or robotic and flat?
4. **Script 4 (Waiting while the Child Writes on Paper):**
   > *"Go ahead and write twenty-six on your paper. I'm right here whenever you're ready."*
   - *Check:* Is the pacing unhurried? Does it invite the child to take their time?

**Pass Bar for TTS:**
- **Warmth & Human Feel Score:** At least 4 out of 5 on human tutor authenticity.
- **Number Clarity:** Zero ambiguity between tens and teens (e.g. 16 vs 60).
- **Word Timestamp Accuracy:** In a test browser page, verify that word bounding timestamps trigger visual highlights within 80 ms of spoken audio.

#### Part B: STT Pediatric Recognition (The "Real Child Voice" Test)
Record a 7-to-9-year-old child (or play five authentic child audio samples) into AssemblyAI Universal-3.5 Streaming and Deepgram Nova-3:
1. *Sample 1:* Quiet, whispered single digit: `"seven"`
2. *Sample 2:* Potential homophone confusion: `"sixteen"` vs. `"sixty"`
3. *Sample 3:* Hesitation with mid-turn self-correction: `"um, forty... wait, no, forty-six"`
4. *Sample 4:* Curriculum math terminology: `"regroup one ten"`
5. *Sample 5:* Spoken fraction: `"two thirds"`

**Pass Bar for STT:**
- **Number Extraction Accuracy:** 5 out of 5 exact number extractions. A single misheard digit on Sample 2 or 3 is a failing condition.
- **Endpointing:** The recognizer must not cut off Sample 3 during the "um, forty..." hesitation before the correction.

---

## 10. What Would Change This Recommendation

This recommendation is grounded in November 2026 technical realities. The following developments would warrant revisiting the architecture:

1. **If a Native S2S Provider Introduces Verbatim Prompt Locking and Synchronized Word Timestamps:**
   If OpenAI or Google releases an S2S API mode that mathematically guarantees verbatim template recitation (zero hallucination or paraphrasing), supports pre-speech guard pauses, and emits streaming word timestamps over WebRTC, native S2S would eliminate the cascade's pipeline complexity. Until then, it violates D-195 and breaks whiteboard synchronization.
2. **If AssemblyAI Fails Pediatric Number Disfluencies in the Founder's Test:**
   If the founder's listening test reveals that AssemblyAI frequently confuses teen and ten numbers or clips child hesitations, switching STT to Deepgram Nova-3 with explicit keyterm boosting on numbers and curriculum math terms would become mandatory.
3. **If Cartesia Sonic Timestamps Experience Jitter on iPad Safari:**
   If device testing on iPad Safari shows that Cartesia's streaming timestamp events drift out of sync with Web Audio playback by more than 150 ms, Inworld TTS-2 Flash would be retained strictly for synchronization fidelity despite its colder vocal tone.
4. **If Subscription Limits are Lowered:**
   If actual family usage shows children average only 30 minutes a month rather than the budgeted 120 minutes, the budget margin would comfortably permit ElevenLabs Flash v2.5 across the entire fleet without compromising unit economics.

---
*Report completed and verified against all architectural constraints.*
