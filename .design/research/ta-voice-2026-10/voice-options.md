# AI Teaching Assistant: voice options

Research date: **2026-10-29**. Currency: **USD**, unless marked CAD. All linked sources were read on **2026-10-29**. This is a research record. No code, call prototype, child study, provider account setting, or hosted service was changed.

## Decision

**Build the first test with LiveKit Agents and a configurable STT -> LLM -> TTS pipeline.** Use AssemblyAI Universal-3.6 Pro Streaming, GPT-4.1 Mini, and Inworld Realtime TTS-2 as the starting combination. Use LiveKit Inference where the required model is supported. Its documented default is zero data retention across the model providers. Keep agent recordings and transcript storage off. The estimated variable cost is **USD 0.0302 per connected call-minute**, before plan minimums, data charges beyond the allowance, and any special contract costs. [S1][S2][S3][S4][S5]

**Cheaper alternative:** Soniox streaming STT + GPT-4.1 Mini + Inworld TTS-2 Flash, on the same LiveKit application. Estimate **USD 0.0206/minute**. Soniox's terms say children's data may require additional written terms. Obtain that confirmation before sending child audio. [S3][S6][S7][S8]

**Premium alternative:** OpenAI GPT-Live 1, with a small backend agent that controls the lesson and drawing tools. Estimate **USD 0.0527/minute** with the bounded backend in this report. This new API separates full-duplex voice from reasoning. It is different from the Realtime API. Direct OpenAI use with personal data from children under 13 needs zero data retention first. [S9][S10][S11]

**Start with 5 minutes per day and 150 minutes per billing month.** At the first-choice base rate, 150 minutes cost about USD 4.53, or CAD 6.34 at an assumed USD/CAD rate of 1.40. Use **USD 0.04/minute** as the initial cost reserve. At that reserve, 150 minutes cost CAD 8.40. Keep a monthly limit as well as a daily limit. Five minutes on each day of a 31-day month would otherwise permit 155 minutes.

These are choices for a controlled test, not approved production choices. **No option has confirmed accuracy for this exact group: Canadian children aged 6-12, including ESL speakers, on home devices.** No option can honestly be described as having passed that quality requirement from this research alone. Section 10 gives the three cheapest selected candidates and their conditional costs. Section 12 gives the tests needed to approve one.

## 1. Scope and evidence limits

The child has an exact workbook question. The server has the answer key and a written solution. The voice agent should explain one known step, draw it, ask the child to act, and wait. This reduces the need for expensive reasoning. It increases the need for accurate numbers, turn detection, and agreement between speech and drawings.

Evidence classes used below:

- **Official price:** a provider rate read from its pricing page or model document.
- **Published measurement:** a result from a named benchmark or a provider test. It is not an Unica measurement.
- **Estimate:** arithmetic from stated assumptions. It is not a provider quotation.
- **Unconfirmed:** the source did not establish the fact, or two official pages did not agree.

Keenable `search_web_pages` was the first web tool. Price and model searches used `published_after=2026-05-01`. Keenable `fetch_page_content` supplied the pricing pages and documents. Older policy and child-research pages were also searched without that date restriction. No Reddit source was used. No paid social research was used.

Some extraction results were incomplete. The AWS pricing page did not expose its dynamic Sonic rate table. The Speechmatics public price extraction showed prerecorded prices but did not establish a direct realtime rate. A general ElevenLabs speech-to-speech document was access restricted. Those gaps remain explicit below. A search result publication date is not proof of a model release date.

## 2. Common cost assumptions

A **conversation minute** means one elapsed minute while the call is connected. It is not one minute of child speech plus one minute of assistant speech.

| Input | Base assumption | Reason or limit |
|---|---:|---|
| Child speaks | 30% of call time | 18 seconds/minute |
| Assistant speaks | 50% | 30 seconds/minute |
| Silence or writing | 20% | 12 seconds/minute; some services still bill this time |
| Assistant speaking rate | 120 words per spoken minute | Slow teaching voice; an assumption |
| Characters including spaces | 6 per word | 720 characters/spoken minute; 360 characters/call-minute |
| Response turns | 3/minute | 30 turns in a 10-minute call |
| Cascade LLM input | 2,000 tokens/turn, including instructions and recent state | 6,000 input tokens/minute; bounded context, no cache savings assumed |
| Cascade LLM output | 180 tokens/minute | About 80 speech tokens plus 100 drawing/control tokens; an assumption |
| LLM | GPT-4.1 Mini | USD 0.40/M input, 0.10/M cached input, 1.60/M output [S3] |
| LLM cost | 6,000 x 0.40/M + 180 x 1.60/M = **0.002688/min** | Includes tool JSON; excludes separate moderation or evaluator models |
| LiveKit allowance for hosting and transport | **0.011/min** | 0.01 agent session + 0.001 published connection/data estimate [S1] |
| Pipecat Cloud allowance | **0.010/min** | agent-1x; current 1:1 voice transport is free [S12] |
| PSTN | None | Browser/mobile voice only; no telephone number or carrier cost |
| USD/CAD | **1.40**, a planning assumption | Not a live exchange-rate quotation |

Use a warm adult voice. A kid-friendly voice does not require a cloned child's voice. Audition a small set with children and parents. Test Canadian number names, decimal points, fractions, and corrections. Do not infer child preference from an adult voice leaderboard.

The base estimates exclude sales taxes, card fees, paper, printing, shipping, support, account hosting, contract minimums, legal work, and engineering. They also exclude recording, premium denoising, background analysis, and retries. Generated but interrupted TTS can still incur cost. Keep a reserve for that waste.

### Why long calls change the price

A cascade can send a compact lesson state instead of the full call transcript. That makes the 2,000-token input bound practical. Store the current question, current step, accepted child answer, and recent turns. Retain the lesson script separately. A context summary that grows without limit invalidates this budget.

Native realtime APIs often process prior turns again. Cached input can reduce that cost, but it does not remove it. Cache misses, prompt edits, and truncation can increase it. A 1-cent fresh-audio estimate is not a full long-call estimate. OpenAI documents repeated context and best-effort caching. Google Cloud explicitly charges the session context again at each turn and lists no cached-input rate for Gemini 3.8 Live. [S13][S14]

## 3. Native speech-to-speech options

The audio figures in this table are **fresh audio only** at the 30% child / 50% assistant ratio. Add the text, context, hosting, and contract items in the next column. Do not rank complete systems using the fresh-audio column alone.

| Option and current model | Official audio price | Input + output per conversation minute | Other charges and long-call effect | Published voice latency |
|---|---|---:|---|---|
| OpenAI `gpt-realtime-2.1-mini` | Input 10/M audio tokens; cached input 0.30/M; output 20/M [S15] | 0.0018 + 0.0120 = **0.0138** | Text 0.60/M input, 0.06/M cached, 2.40/M output. History is billed again. About **0.0240/min model cost** in the 10-minute, 95%-cached-history example below. Direct WebRTC app overhead is extra. | Artificial Analysis: **0.85 s** at Minimal reasoning; **4.28 s** at High. These are different settings, not a general sub-second promise. [S16] |
| OpenAI `gpt-realtime-2.1` | Input 32/M audio tokens; cached 0.40/M; output 64/M. Text 4/M input, 0.40/M cached, 24/M output. [S17] | 0.00576 + 0.03840 = **0.04416** | About **0.0766/min model cost** in the same 95% cache example. More reasoning adds time and output tokens. | **0.97 s** Minimal; **1.21 s** High in Artificial Analysis. [S16] |
| OpenAI `gpt-live-1` | **0.05 per connected session minute**, per second; backend extra [S9] | Input and output included together; no separate audio rates | **0.052688/min** with the bounded backend. Silence counts. Failed or unused session creation can also cost money. Initialization bills 15 seconds, credited against a session that starts; do not add it twice. [S13] | **1.24 s** with the benchmark's Sol/low backend; **1.34 s** Astra/medium. These backend choices differ from the cheap backend used in our estimate. [S16] |
| Google `gemini-3.8-live`; Extended Thinking also exists | Audio input 3/M, about 0.005/spoken minute; output 12/M, 0.018/spoken minute. Text 0.75/M input, 4.50/M output. [S18][S14] | Using exact 25 tokens/s: 0.00135 + 0.009 = **0.01035**. Using the rounded published input minute price gives 0.0105. | No context cache rate. A full-history, 10-minute example is **0.06255/min audio alone**, or 0.111375 if the full microphone minute is encoded. Details below. Google Developer API is excluded by age terms. Cloud route needs a separate terms decision. | **1.18 s** base; **1.35 s** Extended Thinking High in Artificial Analysis. Google describes sub-second operation, but that is not a complete application measurement. [S16][S19] |
| Google older `gemini-live-2.5-flash-native-audio`; 3.1 Flash Live preview | Current official pages still discuss these versions [S19][S20] | Do not copy token rates or timings across model versions | 3.8 is the main current comparison. A tools document still has an older compatibility table: 3.1 is synchronous-only there, while the 3.8 Cloud guide documents nonblocking tools. | 2.5 nonthinking: **0.63 s**; 3.1 Minimal **0.96 s**, High **2.99 s**, in the benchmark. This does not qualify the newer model. [S16] |
| Amazon **Nova 2.5 Sonic**, launched October 2026 | AWS says the same price as Nova 2 Sonic. An official AWS cost example states 0.003/1K speech input and 0.012/1K output. Dynamic price table was not readable. [S21][S22] | **Illustration only:** at an assumed 1,500 tokens/spoken minute: 0.00135 + 0.009 = **0.01035** | Exact current per-minute conversion and full-history billing behavior: **unconfirmed**. Do not use this as a firm budget. Nova text/tool charges and bridge hosting are extra. Older reported text rates of 0.06/M in, 0.24/M out were not independently recovered from the current rate table and remain unconfirmed. | Nova **2.0**, not 2.5: **1.14 s** in Artificial Analysis. AWS published **1.39 s** in a Nova 2 customer example. Exact 2.5 end-to-end figure: unconfirmed. [S16][S23] |
| xAI **Grok Voice 3.0** | **0.08/connected minute + 0.004 per text input** [S24] | Input and output bundled: **0.08** | One text injection per 10-minute call adds 0.0004/min. Three text injections per minute add 0.012/min. Acknowledged tool results must be metered according to actual billing; do not assume every protocol message is a chargeable text input. | **0.81 s** in Artificial Analysis. [S16] |
| ElevenLabs **Realtime v1 Mini / Max** | **0.08/min + LLM usage**, published on current API price page [S25] | Audio bundled: **0.08** | About **0.082688/min** with our backend only if the selected integration permits that backend at those rates. Exact billing composition and compatibility need a prototype. | Provider: **620 ms Mini**, **570 ms Max** time to first audio. Conditions are not a child call study. [S25] |
| Rime **Prism** | Flex **0.08/min of call audio**; Scale 0.064/min with 100/month credit commitment [S26] | Input/output bundled: **0.08** on Flex | Half duplex at launch, with interruptions. Exact silence billing interpretation and text/context additions: unconfirmed. | Provider cites **0.57 s** on Artificial Analysis. This report did not recover a Prism row from the benchmark page, so treat it as a provider-reported benchmark result. [S26] |

Other credible research models include Boson Higgs Realtime and NVIDIA PersonaPlex. The benchmark includes them. This research did not confirm a complete paid service, child-data route, tool contract, and US/Canada processing path for each. They are not cost-ranked production candidates. Alibaba Qwen realtime models also appear on the benchmark, but an approved US/Canada child-data path was not confirmed. [S16]

### OpenAI context calculation

OpenAI documents **600 user audio tokens/spoken minute** and **1,200 assistant tokens/spoken minute**. [S13] For a 10-minute call with 30 equal turns:

- Each turn adds 60 new child audio tokens and 200 assistant audio tokens.
- Total new child input is 1,800 tokens. Total new assistant output is 6,000 tokens.
- Previous audio processed at later turns is `260 x (0 + 1 + ... + 29) = 113,100` tokens.
- Add a 2,000-token static text prefix and 60 new text/control tokens per turn. Static prefix reuse is 58,000 tokens. Repeated earlier text is `60 x 435 = 26,100` tokens. New output text is 1,800 tokens.

For Mini with **95% of repeated audio cached**, repeated-audio input costs `113,100 x (0.95 x 0.30 + 0.05 x 10) / 1M = 0.0887835` per call. New input costs 0.018. Output audio costs 0.12. For repeated text, assume the same 95% cache fraction. Text costs are `2,000 x 0.60/M + 84,100 x (0.95 x 0.06 + 0.05 x 0.60)/M + 1,800 x 2.40/M = 0.0128367` per call. Total: **0.2396202/call = 0.023962/min**.

With 100% cache hits on repeated content, this example is **0.0182496/min**. With no cache hits, it is **0.132498/min**. These are modeled cases, not observed OpenAI invoices. The same 95% calculation gives the flagship **0.0765516/min**. Optional input transcription is charged separately. Do not add another STT service unless the product needs it. [S13]

### Gemini context calculation

Google Cloud explicitly says every turn bills all tokens in the session context. [S14] At 25 tokens/second, our 10-minute, 30-turn call adds 150 user audio tokens and 250 assistant audio tokens per turn. Fresh child input is 4,500 tokens. Fresh assistant output is 7,500. Repeated past audio is `400 x 435 = 174,000` tokens.

Audio cost is `(4,500 + 174,000) x 3/M + 7,500 x 12/M = 0.6255` per call, or **0.06255/min**, before text and hosting. If full microphone time counts, use 500 new input tokens per turn, not 150. Then repeated audio is `750 x 435 = 326,250`, and audio cost is **1.11375 per 10-minute call**. Confirm actual token usage and whether the implementation retains all generated audio before adopting either model.

Compression, a compact question-scoped session, or restarting from a text summary can reduce the bill. They also change memory and continuity. They are engineering choices, not automatic prompt-cache savings. At 30 minutes with full audio history and the speech-only input assumption, the same simple model reaches about **0.17055/min audio**. Thus Gemini can be cheap for short exchanges and expensive for long, frequent turns.

## 4. Native tools, transport, voices, and deployment

| Option | Drawing tools while speech continues | Browser | React Native / Expo | Voice options and child fit | US / Canada processing |
|---|---|---|---|---|---|
| OpenAI Realtime 2.1 family | Function calling supported; Realtime supports asynchronous tools. [S85] No guarantee that a particular tool event matches a spoken word's playback time. [S15][S27] | Native WebRTC; WebSocket and SIP also supported | Standard WebRTC needs a native implementation or a bridge such as LiveKit. Official turnkey Expo parity for direct OpenAI: unconfirmed. | Prompt-controlled tone and stock voices, including Cedar and Marin in the Realtime family. Audition both for clear numbers and a calm adult persona. Their relative fit for children is unconfirmed. [S85] | US regional inference is documented. Canada offers storage residency but **not regional inference**, and the Canada endpoint list does not include Realtime. Do not call this Canada processing. [S11] |
| GPT-Live 1 | Reasoning and tools run through an asynchronous backend. Function calling supported; structured outputs on the voice model are not supported. Validate drawing JSON in the backend. [S9][S28] | WebRTC preferred; WebSocket also available [S13][S28] | Bridge/native WebRTC work needed. LiveKit has native support, but verify the GPT-Live adapter and account access. | Natural full-duplex persona; prompt design/custom voices need testing and authorization. Child fit unconfirmed. | US inference documented. Canada-only GPT-Live processing unconfirmed. [S11] |
| Gemini 3.8 Live | Cloud guide explicitly supports nonblocking asynchronous function calls while audio remains active [S19] | Provider API is bidirectional WebSocket, not a documented native WebRTC endpoint. Use LiveKit or Pipecat for WebRTC. | Same bridge can serve RN. Direct audio capture/playback is additional native work. | Expressive voices and multilingual switching. Turn off unneeded affective/proactive behavior for the initial child test. Model capability is not a child-voice accuracy result. | Cloud model page lists US/EU and us-central1. No Canadian model inference location is listed. [S29] |
| Nova 2.5 Sonic | Asynchronous tools, including parallel work, supported [S21][S30] | Bedrock bidirectional event stream; application server/bridge needed for browser WebRTC | LiveKit/Pipecat adapter or custom bridge. Exact 2.5 adapter support is unconfirmed. | Service card lists 18 expressive voices and seven languages. Warm teaching style is a prompt/audition task. [S31] | US East Virginia and US West Oregon are documented; also Stockholm/Tokyo. Canada is not listed in the launch notice. [S21] |
| Grok Voice 3.0 | JSON-schema custom functions and other tools. Exact asynchronous speech/tool playback behavior needs testing. [S32] | WebSocket API; WebRTC via bridge | Bridge/native capture. No confirmed first-party Expo voice SDK. | Stock/custom voice options and output speed control; test safety and pronunciation. | US speech endpoint exists; full voice residency guarantee and Canada inference are unconfirmed. Text regional routing is not proof of voice residency. [S24][S32] |
| ElevenLabs Realtime v1 | Max page explicitly lists tools; exact Mini/Max concurrency with speech needs verification [S25] | OpenAI Realtime-compatible is claimed. Native WebRTC for this new API is unconfirmed. Do not borrow Agents SDK support without checking. | Agents has an official Expo SDK; compatibility with standalone Realtime v1 is unconfirmed. | Large voice collection; warmth and pronunciation still need child testing. | US storage/default endpoint documented; US-only processing and new Realtime model coverage need confirmation. Canada unconfirmed. [S33] |
| Rime Prism | Tool calls documented; model is half duplex at launch [S26] | WebSocket; LiveKit/Pipecat integrations listed | Through those frameworks; no confirmed direct Expo SDK | Adult voices/custom enterprise voice; test warmth and number pronunciation | VPC/on-prem deployment offered at Enterprise. US/Canada cloud location and Prism availability in a selected country need confirmation. [S26] |

The Google Developer API terms expressly exclude API clients directed to, or likely accessed by, people under 18. This is a product-level restriction. An adult API account does not remove it. Google Cloud terms are separate. Do not assume that moving to Cloud automatically authorizes this use; confirm the Cloud agreement, model terms, and child-data processing route. [S34][S35]

## 5. Cascade STT comparison

STT services supply recognition, not the complete voice agent. They do not need to support drawing tools. The LLM and application control the whiteboard. A browser or RN app can use each listed STT through a server-side WebRTC bridge. A vendor WebSocket is not itself WebRTC.

For the table's conversation costs, keep one STT connection open through the whole minute. This avoids cutting off a child and preserves interruption detection. Do not multiply a full-session streaming price by the 30% speech ratio unless the provider actually meters only the submitted speech and the application sends only that audio.

| STT | Official price, read 2026-10-29 | STT cost per call-minute | Latency evidence and limit | Child recognition evidence |
|---|---|---:|---|---|
| **Soniox realtime** | Audio input 2/M tokens; text input/output 4/M. About 30,000 input audio tokens/hour and 15,000 output text tokens/hour of speech; headline about 0.12/hour [S6] | **0.0015 modeled**: 0.001 full-session audio + 0.0003 child transcript + 0.0002 for a 500-token context once per 10-minute call | Semantic endpointing. Default maximum endpoint delay 2,000 ms; adjustable 500-3,000 ms. Aggressive settings can reduce accuracy. No verified full-pipeline time. [S36] | No current age-stratified Canadian child result found. Multilingual capability is not that result. |
| **AssemblyAI Universal-Streaming English** | 0.15/hour; streaming session time [S4] | **0.0025** | A cheaper model than U3.6. Full-pipeline p50/p95 unconfirmed. | No matching child benchmark found. Do not assume equal quality to Pro. |
| **AssemblyAI Universal-3.6 Pro** | 0.45/hour base; prompting and some features extra [S4] | **0.0075** | Provider says sub-300 ms complete transcripts in migration guide. Balanced/min-latency/max-accuracy modes exist. This is STT latency, not voice response latency. [S37] | No matching child benchmark found. Include Pro in the test because of context and vocabulary features, not a proven child advantage. |
| **Deepgram Flux English** | Direct PAYG **0.0077/min**. LiveKit lists 0.0065/min; use the actual purchase route. [S38][S1] | **0.0077 direct**, or 0.0065 through the listed LiveKit route | Integrated turn detection. No source read here establishes a child-call end-to-end figure. | No matching child benchmark found. |
| **Deepgram Nova-3** | Direct streaming 0.0077 monolingual; 0.0092 multilingual. Keyterms +0.0013/min. [S38] | **0.0077 / 0.0092**, before add-ons | Streaming partials; turn detection must be composed. Prices from older promotion articles are not the current direct table. | General adult/noise benchmark claims do not establish child accuracy. |
| **Speechmatics** | Public page extraction: Melia 0.12/hour, Enhanced 0.38/hour, Standard 0.23/hour under **prerecorded**. Direct realtime rate **unconfirmed**. LiveKit lists **Linden-1 0.005/min**. [S39][S1] | **0.005 via listed LiveKit Linden route**; direct unconfirmed | Realtime WebSocket and turn detection documented. Exact full-pipeline latency unconfirmed. [S40] | An official 2022 article discusses children's voices, but current extracted page did not expose a usable quantitative comparison. Do not treat it as a current benchmark. [S41] |
| **OpenAI GPT-Live Transcribe** | **0.017/min** live audio [S42] | **0.017** if metering the full input stream | Dedicated live transcription. Compare the live rate, not cheaper file STT. | No matching current child benchmark found. |
| **OpenAI GPT-Transcribe / older STT** | GPT-Transcribe 0.0045/min; older mini-transcribe 0.003/min; older full transcribe 0.006/min. [S17] | Do not use file rates as a live-stream budget | Older transcription models are scheduled for retirement in February 2027. [S43] | Older Whisper research is not a test of the current live model. |
| **Google Cloud STT v2** | Standard recognition **0.016/min**, first volume tier [S44] | **0.016** if full-stream audio is processed | Streaming recognition requires the supported model/location; exact child-call response latency unconfirmed. | No matching child benchmark found. |
| **Gemini 3.5 Transcribe Live** | Audio 3.50/M + output text 21/M; provider estimate **about 0.009/min** [S18] | About **0.009** at Google's transcript-rate assumption | WebSocket live STT; do not substitute file transcription's 0.005/min estimate | Developer API age restriction applies. A Cloud offer and terms must be verified separately. |
| **ElevenLabs Scribe v2 Realtime** | **0.39/hour** [S25] | **0.0065** | Provider says about **150 ms** streaming transcription; not full voice response time | No matching child benchmark found. |
| **Rime STT** | Flex **0.002/min**, temporarily free until Nov 19; Scale 0.0016/min with commitment [S26] | **0.002**, not the temporary free rate, for a lasting budget | Exact end-of-turn and child accuracy unconfirmed | No matching child benchmark found. |

Soniox's headline 0.002/min assumes a particular output density. Its actual bill includes text context and transcript tokens. At 1,000 additional context tokens per call, add 0.004/call. Translation increases returned text tokens even where there is no separate translation feature fee. [S6]

For a child-specific STT comparison, ask whether SoapBox Labs still offers a suitable conversational API under a current contract. Historical official material claims child-focused training and ESL coverage, but current price, streaming suitability, and availability were not confirmed. Do not rank it using an old transaction price. [S45]

## 6. Cascade TTS comparison

The output column below assumes **360 generated characters per conversation minute**. It excludes STT, LLM, transport, and discarded speech. A voice model's first-byte time is not voice-to-voice latency.

| TTS | Official price | Output cost/call-minute | Published component latency | Voice and implementation notes |
|---|---|---:|---|---|
| **Inworld Realtime TTS-2 Flash** | On-demand **15/M characters**; Creator 10/M with 25/month credits; higher tiers lower [S5] | **0.0054** on-demand | Provider **under 25 ms P99 server TTFB**; excludes network and playback [S46] | Streaming WebSocket; speed control, voice design, pronunciation and timestamps are listed. Full expressive steering is a TTS-2 feature. |
| **Inworld Realtime TTS-2** | On-demand **25/M**; Creator 20/M; Growth 12.50/M with 1,500/month credits [S5] | **0.0090** on-demand | Provider **under 100 ms P99 server TTFB** [S46] | Best starting voice candidate for controllable warm teaching. The advantage over Flash for children is unconfirmed. |
| **Soniox realtime TTS** | Text input 4/M tokens; output audio 21.50/M. About 15,000 text + 30,000 audio tokens/hour of generated speech. [S6] | **0.005875**, using the provider's hourly usage reference and 50% assistant speech | Exact TTFB unconfirmed in sources read | Credible low-cost alternative. Child-friendly preference, voice controls, and tool/audio timing need an audition. |
| **Cartesia Sonic 3.6** | Pro 5/month for 100K credits; Startup 49/1.25M; Scale 299/8M. About 1 credit/character. [S47][S48] | **0.0180** at Pro's fully used included-credit rate. **0.014112** Startup, **0.013455** Scale, before overages. | Provider **under 90 ms** first audio [S49] | 44 languages; expressive voices and speed controls. Pro clones use about 1.5 credits/character. LiveKit's model rate differs from the direct credit plan. |
| **ElevenLabs Flash/Turbo** | Current API headline **0.04/1K characters** [S25] | **0.0144** | Provider about **75 ms** | Strong voice library. The named Flash price is not the older 0.05/1K figure in some comparison articles. |
| **ElevenLabs v4 Turbo** | **0.04/1K** [S25] | **0.0144** | Provider about **100 ms** | Current real-time option with expressive tags. Audition against Flash. v4 expressive 0.08/1K is a separate price. |
| **Rime Mist v3** | Flex **0.030/generated minute**; Scale 0.024 [S26] | **0.0150** Flex | Provider **37 ms P50**, 56 ms P90, concurrency 1 | Explicit spelling and pronunciation controls. Do not multiply by characters as well as generated minutes. |
| **Rime Coda v2** | Flex **0.050/generated minute**; Scale 0.040 [S26] | **0.0250** Flex | Provider **sub-100 ms** | More expressive, word-level timestamps. Country-specific deployment needs an enterprise quote. |
| **Google Cloud Chirp 3 HD** | **30/M characters** [S50] | **0.0108** | Full conversation figure unconfirmed | Choose streaming-capable voices/model. Neural2 is 16/M and Standard 4/M, but those prices alone do not establish equivalent streaming naturalness. |
| **Gemini 3.8 Flash-Lite TTS** | Audio output **6/M through Dec 31, 2026**, then 12/M; text input 0.50/M then 1/M. At 25 audio tokens/s. [S18] | **0.0045 audio output** now; about 0.00004 text input at our speech text assumption | Claimed low latency; exact full conversation measurement unconfirmed | Promotional price doubles Jan 1, 2027. Developer API age restriction prevents use for this child client. Cloud availability, pricing, and terms need separate confirmation. |
| **OpenAI `gpt-4o-mini-tts`** | Text input 0.60/M tokens, audio output 12/M [S17] | Audio tokens per spoken minute for this TTS model were not established here; **unconfirmed**. Do not apply Realtime tokenization automatically. | Exact current full-path figure unconfirmed | Scheduled removal **Jan 6, 2027**. Do not start a new product on it. `tts-1` is 15/M characters, giving 0.0054 at our ratio, but has the same scheduled removal. [S43] |
| **Deepgram Aura-2** | **30/M characters** direct [S38] | **0.0108** | Full conversation figure unconfirmed | Useful if consolidating providers. Aura-1 is 15/M, but lower price does not establish voice parity. |
| **Speechmatics TTS** | **11/M characters** [S39] | **0.00396** | Provider initial chunk typically **under 200 ms** [S51] | Current quickstart still says preview retains text/audio for improvement. Exclude it from child-data production unless non-retentive terms are agreed. |

Simple output-cost ordering does not select the best system. Google Standard voices, promotional models, and preview services can be cheaper, but they have not established the required terms, latency, and voice quality. Subscription-credit prices also require enough shared usage to consume the purchased credits.

## 7. Managed platforms and frameworks

**Frameworks do not replace the model bill.** LiveKit Agents and Pipecat can run either native audio or a cascade. Open-source software can have no license fee while servers, transport, models, and operations still cost money.

| Option | Two-way call price under this report's assumptions | Drawing tools / speaking | Browser and RN support | Latency and operational limit |
|---|---:|---|---|---|
| **LiveKit Agents + Cloud** | Framework no model fee; Cloud **0.01 agent/min**, plus WebRTC/data. Our allowance is **0.011/min before models**. Ship **50/month includes 5,000 agent minutes**; Scale 500 includes 50,000. [S1] | Application functions, asynchronous tools, and client data messages. Schedule drawings against actual audio playback. [S52] | Browser WebRTC and official RN WebRTC SDK; Expo **development build**, not Expo Go [S53] | No universal voice-to-voice result. STT/LLM/TTS and turn settings determine it. Region pinning is listed on Scale. Optional retained observability is separate from model ZDR. |
| **Pipecat + Daily / Pipecat Cloud** | Framework has no service fee. Cloud agent-1x **0.01 active/min**. Current 1:1 Daily voice transport is free. Models extra. A reserved worker adds **0.0005/reserved minute**, about **21.60 per 30-day month per always-on slot**. [S12] | Function processors and application messages; full control of drawing/audio order | Browser WebRTC; RN SDK with Daily or SmallWebRTC transport. RN minimum iOS 15, Android API 24. [S54] | No universal result. Cold starts and extra network steps need testing. Free transport and reserved capacity need a budget review if rates change. |
| **ElevenLabs Agents** | **0.08/connected minute + LLM**; about **0.082688** with our backend if supported at that rate. Creator 22/month includes 275 call minutes. Burst **0.16/min** above concurrency limits. [S55] | Client tools run application actions; test whether drawing and speech align. No exact word-level tool timing promise recovered. [S56] | Browser SDK and official RN SDK. Expo development builds supported; Expo Go excluded. [S57] | Standalone Realtime v1's 570/620 ms is **not** the Agents pipeline latency. No comparable end-to-end Agents measurement confirmed here. |
| **Vapi** | **0.05 hosting/min + model costs**. With Soniox/GPT-4.1 Mini/Inworld Flash direct-rate assumptions: **0.059588/min**, before any provider-route differences. Daily WebRTC listed free. [S58] | Custom/client tools; verify result handling while speaking | Web and RN SDKs documented; test current Expo version [S59] | No comparable complete latency confirmed. Platform overhead and chosen components matter. Extra logging and routing surface area. |
| **Deepgram Voice Agent** | Standard **0.075/min connected WebSocket**, STT + managed LLM + TTS included. BYO both LLM/TTS **0.050/min + those providers**. [S38] | Function tools; exact concurrent whiteboard/audio behavior needs a prototype | WebSocket API; browser/RN through a bridge. No equivalent native WebRTC endpoint established here. | Do not use STT component latency as the agent result. Verify model and voice limits in the bundled tier. |
| **AssemblyAI Voice Agent API** | **0.075/session minute**, STT + LLM + TTS + turn detection + tools included [S4] | Tool calling included; verify client-side drawing timing | WebSocket API. Framework bridge for WebRTC/RN; direct Expo voice SDK unconfirmed | Official pricing reference describes a cascade and self-hosted LiveKit. It is not proof of a child-call latency result. |
| **Cartesia Managed Agents / Line** | Provider comparison lists **0.06/min**; LLM temporarily included for playground-built agents. Exact contract and continuing inclusion must be verified. [S60] | Model tools/application integration; exact async drawing timing unconfirmed | WebRTC/RN parity for new managed product unconfirmed; do not infer it from the TTS API | Current launch is very recent. Component Sonic latency is not platform latency. |
| **Retell** | **0.055/min voice infrastructure + TTS + LLM**. Published total range **0.07-0.31/min**, no browser telephony charge. Platform TTS starts 0.015/min; this is a platform call-minute rate. [S61] | Custom function tools; precise client drawing synchronization unconfirmed | Browser web calls documented; first-party RN parity unconfirmed | More oriented to customer calls. No matching child quality or complete latency evidence found. |

For Vapi, the pricing page says ZDR comes with a success package, from 29/month. Its ZDR document says no separate purchase is required. This is an **official-source conflict**. Budget the package if needed, and obtain a written entitlement answer. Do not claim free ZDR is confirmed. [S58][S62]

### What LiveKit Inference changes

LiveKit says all its supported inference models use ZDR by default, including the underlying providers. That can avoid a separate direct-provider ZDR negotiation for the same routed model. It does **not** prove that a direct provider plugin has the same treatment. It also does not grant child-use permission. Model/provider policies still apply. [S2]

This is why LiveKit is the first framework choice despite Pipecat Cloud's slightly lower modeled transport cost. The advantage is native client support, controllable lesson logic, and a documented inference privacy route. It is not a proven latency advantage.

## 8. Child-data terms, retention, training, and location

This section compares contracts and documented controls. It is not a finding that any complete implementation meets Canadian law or COPPA. The child is the end user even where the parent owns the account. Provider account age, downstream user age, and processing children's data are separate questions.

| Provider or layer | Training and retention | Child-age terms | US / Canada result |
|---|---|---|---|
| **OpenAI API**, including LLM backend | API customer content not used for training by default. Default abuse logs up to 30 days, with stated exceptions. `/v1/realtime` eligible for approved ZDR. `/v1/live/sessions` eligible with limitations. `store=false` alone is not an approved ZDR configuration. [S11] | Under-18 API guidance permits building for minors with safeguards. It says not to process personal data of children under 13 without first implementing ZDR. It also recommends current flagship models for minors; choosing Mini for a known script requires a documented safety evaluation. [S10] | US regional inference supported. Canada storage residency is not Canada inference. Specific model/endpoint compatibility still matters. |
| **Gemini Developer API / AI Studio** | Paid tier does not use content to improve products, but has limited abuse logging and potential transient processing across countries. Free tier can use content for product improvement and human review. [S34] | **Explicitly excludes clients directed to or likely accessed by people under 18.** Paid status and parental consent do not remove that clause. | Canada availability is not a Canada processing guarantee. **Excluded** for this service under standard Developer API terms. |
| **Google Cloud Gemini / former Vertex AI route** | No training without permission. ZDR requires applicable abuse-monitoring exceptions and other settings. Live session resumption stores prompts/output up to 24 hours; leave it off for ZDR. Search grounding has separate retention. [S63] | Separate Cloud agreement. Child use for this exact model/client is **unconfirmed**, not automatically prohibited by the Developer API clause and not automatically approved either. | 3.8 Live lists US/EU, not Canada. Use a documented US processing region if approved. [S29] |
| **AWS Bedrock / Nova** | AWS has explicit model/account/region retention controls. `data_retention_mode=none` blocks incompatible models. Current generic retention page is written around Messages/Chat/Responses; exact application to Nova's bidirectional API needs confirmation. Do not assume every Bedrock model has the same policy. [S64][S65] | Nova service card includes education and child-safety mitigations. No explicit blanket under-13 downstream ban was found in the sources read. That is not a complete contract authorization. [S31] | Virginia/Oregon documented for 2.5. Canada inference not listed. Model invocation logging and exported audio must also remain in the selected country. |
| **Soniox STT/TTS** | No training or benchmarking on customer content. Realtime audio/transcripts not retained. Async storage is different and defaults to deletion after 30 days. Metadata logs remain. [S7] | Account user must be 18. Terms specifically say children's information may require additional written terms. Obtain those terms; do not send child audio first. [S8] | US regional processing/storage documented. Canada region not listed. [S66] |
| **AssemblyAI STT** | Model improvement must be opted out. Streaming then offers ZDR for audio/transcripts; billing metadata remains. Opt-out is prospective. Gateway providers not training is separate from AssemblyAI's own opt-out. [S67] | Read B2B agreement does not establish blanket child-use approval or a specific under-13 client ban. Child-data permission is **unconfirmed**. [S68] | US/EU streaming endpoints documented. Canada region unconfirmed. [S4] |
| **Deepgram** | MIP participation/training and retention are default. Set `mip_opt_out=true` on each applicable request; documented result is no retained audio/text/transcripts/output. Third-party agent providers have separate terms. [S69] | Direct account minimum 18, or higher local minimum. Downstream child application permission not established. [S70] | Use regional endpoint plus opt-out for regional processing. Exact Canadian hosted endpoint not established here; own VPC/on-prem is an Enterprise path, not a cheap PAYG assumption. |
| **Speechmatics** | Direct realtime retention/no-training contractual details not fully confirmed. TTS preview explicitly retains text/audio to improve service. [S51] | Flow's consumer policy says not intended for under-13 users. Do not treat that as proof that the separate B2B STT API is forbidden. API child-data terms need confirmation. [S71] | US API/private deployment feasibility should be confirmed for the model. Canada cloud service unconfirmed; own regional deployment requires a quote. |
| **Inworld** | API terms say no general model training on nonpublic material, with feedback and trust/safety exceptions. General privacy policy has broader improvement language. Direct ZDR docs say Enterprise/Enterprise-Trial; pricing page also advertises Growth ZDR add-ons. Treat access/pricing as a contract question. [S72][S73][S5] | Account user minimum 18. Downstream under-13 use not expressly resolved by documents read. With TTS-only, send the tutor script, not child audio or names. [S72] | US company/processing possible, but default transfers may be international. Enterprise page lists EU/India residency; US-only guarantee and Canada deployment unconfirmed. [S74] |
| **Cartesia** | Current direct retention period/no-training guarantee for this use was not established. Enterprise DPA offered. LiveKit-routed inference ZDR does not cover direct uploads or voice clones. [S2][S47] | Direct account 18/legal majority. Privacy policy says not intended for children. AUP also restricts output that represents under-18 individuals. Do not clone a child persona; obtain B2B child-product terms. [S75][S76] | US hosting/private deployment possible in product material, but an exact country-bound contract was not confirmed. Canada unconfirmed. |
| **ElevenLabs**, API and Agents | General terms allow training unless opted out; opt out before any data is sent. Per-agent ZRM prevents stored recordings/transcripts/PII metadata. It is separate from training opt-out and from downstream LLM settings. [S77][S78] | General terms prohibit under-18 use. They do not clearly settle a parent-account, downstream API child tutor. Obtain written API/Agents terms for ages 6-12. Do not assume Agents' enterprise customer use resolves the clause. | US default storage and US/EU/India/Singapore endpoints documented. Confirm processing, model coverage, and subprocessors. Canada unconfirmed. [S33] |
| **Rime** | Terms say input/output not used to train general models; custom voice model training is an exception. Exact direct retention/ZDR is unconfirmed. [S79] | Terms say any use/access by anyone under 18 is prohibited. A downstream child tutor requires a clear written exception or agreement before use. | Enterprise cloud/VPC/on-prem offered. Actual US/Canada deployment requires confirmation. [S26] |
| **xAI voice** | Exact voice-specific retention, ZDR, and no-training contract were not confirmed in this pass. Do not borrow consumer Grok settings or text API guarantees. | Under-13 downstream voice use **unconfirmed**. | US routing exists, but voice-specific country confinement and Canada availability remain unconfirmed. |
| **LiveKit Cloud** | Inference ZDR is documented on every plan. Optional observability separately stores session audio/transcripts/traces. Keep that off or obtain the needed retention basis. Custom voices store a sample. [S2] | Adult commercial account is not child authorization from every model provider. Confirm downstream use and route policies. | Cloud has independent controls for project data, agent region, inference routing and media. Some pinning is plan gated. Self-hosting can place transport/agent compute in Canada, but external models still leave Canada. [S1][S80] |
| **Pipecat/Daily** | Framework can avoid content logs. Cloud logs may include sensitive frames; default DEBUG logging needs review. Recording is separately billed and optional. Underlying providers retain according to their own settings. [S12][S81] | B2B child-data authorization **unconfirmed** for this exact use. | Managed US hosting and a custom/private enterprise route are possible, but exact model and media confinement need a contract. Self-hosting Canada compute alone does not make the whole pipeline Canadian. |
| **Vapi** | Default recordings/transcripts/logs are retained; pricing lists 14-day raw retention. Org ZDR removes call content, retains operational metrics. Verify entitlement conflict and underlying provider ZDR. [S58][S62][S82] | Under-13 downstream authorization **unconfirmed**. | EU enterprise route documented; exact US-only/Canada full pipeline guarantee unconfirmed. |
| **Retell / other managed platforms** | Recording opt-out, custom retention and DPA options are offered. Exact default retention and all-provider no-training status are **unconfirmed** here. [S61] | Under-13 authorization **unconfirmed**. | A managed platform's US office does not prove US processing. Canada confinement unconfirmed. |

**Canada-only conclusion:** no complete, low-cost hosted stack in this comparison has a confirmed Canada-only processing path for every audio, transcript, LLM, and log component. A Canadian media server alone is insufficient. A US processing route is more practical for the first test, subject to the appropriate contracts and parent disclosures. Do not describe storage residency as inference residency.

## 9. Voice quality and child speech evidence

The recent independent child evidence found here is DrivenData's October 2026 article about tests performed in **mid-2025**. It compared Whisper Medium and KidWhisper across four child datasets. It reported **13-17% WER for grades 3-5** and much larger error rates for younger children. It also found a dialect disparity. This is direct evidence from the researchers. It is **not a measurement of current OpenAI Realtime, Soniox, Flux, AssemblyAI U3.6, or Gemini 3.8**. [S83]

The Artificial Analysis speech-to-speech benchmark gives useful adult/general task and latency comparisons. Its task scores do not establish math tutoring quality or recognition for children. Its normalized hourly cost is tied to its benchmark input and response lengths. Do not multiply it by a 10-minute Unica call as if it were a connected-minute tariff. [S16]

No current source read supplies comparable age 6-8 / 9-12 WER and number accuracy for all the named providers. Canadian English and ESL children are especially unconfirmed. The report therefore does not name a proven child-ASR winner.

For recognition, count **number and operator errors**, not WER alone. Confusing thirteen with thirty can change the lesson even if every other word is correct. A written solution cannot repair a misheard child answer unless the agent asks for confirmation. A child may also whisper, pause while calculating, or say only a digit. Short answers are binding test cases.

## 10. Costs for the three cheapest selected test candidates

**Qualification limit:** these are three price-confirmed, technically plausible configurations selected for an evaluation. They are **not three proven options that meet child quality**. No such proven set was established. Cheaper Standard TTS, free promotions, and unresolved child-restricted routes are excluded. Native Mini is included only at Minimal reasoning and with an explicit cache assumption.

| Candidate | Input audio/STT | Output audio/TTS | Text/tools | Hosting/transport | Base USD/call-minute |
|---|---:|---:|---:|---:|---:|
| **A. LiveKit + Soniox + GPT-4.1 Mini + Inworld Flash** | 0.001500, including transcript/context estimate | 0.005400 | 0.002688 | 0.011000 | **0.020588** |
| **B. LiveKit + AssemblyAI Universal-Streaming English + same LLM/Flash** | 0.002500, whole session | 0.005400 | 0.002688 | 0.011000 | **0.021588** |
| **C. OpenAI Realtime 2.1 Mini Minimal, direct browser WebRTC** | Audio input including history: 0.01067835 | 0.012000 | 0.00128367 | **0.001000 planning allowance**, not an OpenAI tariff | **0.02496202** |

A/B use Inworld's direct on-demand 15/M rate. LiveKit's detailed pricing matrix also confirms 15/M for TTS-2 Flash and 25/M for TTS-2 on Build/Ship, with lower Scale rates. The current table therefore supports the routed TTS amounts. LiveKit's published TTS minute examples assume a character rate that differs from ours. Do not multiply a published modeled minute cost by a talk ratio a second time unless its definition permits that calculation. [S1][S5]

C uses the exact context example in Section 3. Its own application overhead has no established fixed tariff; 0.001/min is a reserve. A LiveKit-hosted Mini agent would add the approximately 0.011/min framework allowance instead, and would be about **0.034962/min**. C's 95% cache fraction is unmeasured. Its no-cache model cost alone is about 0.1325/min.

All monthly figures below assume usage consists of repeated calls with the same cost profile, including **10-minute calls for C**. A single 60-minute native session is not six identical 10-minute invoices.

| Candidate | 10-minute call | 60 min/month | 150 min/month | 300 min/month |
|---|---:|---:|---:|---:|
| A | **0.20588** | **1.23528** | **3.08820** | **6.17640** |
| B | **0.21588** | **1.29528** | **3.23820** | **6.47640** |
| C | **0.24962** | **1.49772** | **3.74430** | **7.48861** |

For practical comparison, the first choice uses the Pro STT and the fuller voice controls. It is not the cheapest configuration:

| Recommended test configuration | USD/minute | 10 minutes | 60/month | 150/month | 300/month |
|---|---:|---:|---:|---:|---:|
| **First choice: LiveKit + U3.6 Pro + GPT-4.1 Mini + Inworld TTS-2** | **0.030188** | **0.30188** | **1.81128** | **4.52820** | **9.05640** |
| **Premium: GPT-Live 1 + bounded backend, direct WebRTC** | **0.052688** | **0.52688** | **3.16128** | **7.90320** | **15.80640** |

Premium excludes unpriced application hosting. Native flagship Realtime at the modeled 95% cache fraction is about 0.0766/min before app hosting, so GPT-Live can be a more predictable premium choice for long sessions. Its precise backend model and safety behavior still need evaluation.

### Plan minimums and low-volume cost

LiveKit Ship's 50/month includes 5,000 agent minutes. Do **not** add 50 plus 0.01 for each of the first 5,000 minutes. At total fleet use M, the agent session bill is approximately `max(50, 0.01 x M)`, before other included allowances and overages. WebRTC allowances and inference credits can lower the invoice further. [S1]

For one child using 150 minutes, paying 50 for the fleet is a very different unit cost from a mature fleet using its full allowance. At 10 children, the unconsumed hosting minimum can still be material. Allocate shared minimums over actual paying children. The tables above show usage-based planning cost, not a guaranteed one-child monthly invoice.

Pipecat Cloud with the same A models gives about **0.019588/min**, before warm-worker charges. An always-on reserved slot adds about 21.60/month at the listed 0.0005/min rate. At low usage, that can offset the small per-minute saving. Direct self-hosting has no honest fixed per-minute figure until capacity, concurrency, and operations are measured. [S12]

## 11. CAD 79.99 plan, limits, and margin

At the assumed FX of 1.40, CAD 79.99 is about **USD 57.14** before tax and other costs. This is a planning conversion. It is not an exchange-rate forecast.

| Monthly use | Approx. daily use over 30 days | A voice cost CAD | First-choice voice cost CAD | Premium voice cost CAD |
|---|---:|---:|---:|---:|
| 60 min | 2 min/day | **1.73** | **2.54** | **4.43** |
| 150 min | 5 min/day | **4.32** | **6.34** | **11.06** |
| 300 min | 10 min/day | **8.65** | **12.68** | **22.13** |

For the first choice at 150 minutes, voice consumes about **7.9% of CAD 79.99**, leaving **CAD 73.65 before every other cost**. This is not an overall margin claim. At 300 minutes it consumes about 15.9%, leaving CAD 67.31 before other costs.

Actual contribution per child is:

`net subscription revenue - printing - paper - shipping - payment fees - support - allocated fixed services - voice cost`

The physical fulfillment and support costs were not supplied. Thus actual gross or contribution margin is **unconfirmed**. An initial free subscription month has no subscription revenue to absorb the call cost. Price its voice allowance as an acquisition/fulfillment expense rather than claiming the paid-month percentage applies.

If voice can use at most 10% of the plan price, its budget is CAD 7.999/month. At base rates, that buys about **277.5 minutes for A**, **189.3 for the first choice**, or **108.4 for premium**. At the safer USD 0.04/min reserve, it buys **142.8 minutes**. A 150-minute launch limit is therefore close to a 10% budget at the reserve, rather than comfortably below it.

Recommendation: use **150 minutes/month and 5 minutes/day** for the controlled paid-family test. Reserve CAD 8.40/child/month at full use. Do not promise 300 minutes until child quality and measured cost are stable. For premium calls, reserve at least the base 0.0527 rate plus backend and retry variation; the same 150-minute allowance costs more.

Count connected session time server-side. Show the child the remaining time. Pause the voice connection for long paper-work intervals only when the interface clearly enters a non-call state. Use the lesson step to resume. Do not pretend an open provider connection stops billing because the child is silent.

## 12. Approval tests and main risks

These are the results that would reject the first-choice architecture. They are proposed gates, not completed checks.

1. **Conversation delay.** Reject if median end-of-child-turn to audible response exceeds 1.0 second, or p95 exceeds 1.8 seconds, on the target home devices and networks. Report server time, network time and playback separately. Include endpoint detection in the total. Component TTFB cannot pass this gate.
2. **Interruptions.** Reject if speech does not stop within 250 ms of a valid child interruption at p95, or if a false interruption removes an essential step. Test a parent talking in the background separately from a child saying stop.
3. **Child understanding.** Test children with permission in age bands 6-8 and 9-12. Include Canadian English, ESL speech, accents, quiet/loud speech, and laptop/tablet microphones. Report each group's WER, exact number/operator accuracy, recovery requests, and completed steps. Reject a claim based only on aggregate adult WER.
4. **Binding math cases.** Include thirteen/thirty, fourteen/forty, two/twelve, negative numbers, zero, decimals, fractions, and yes/no with background speech. Require at least 98% exact recognition for the constrained number/operator answers in the agreed test set, or require confirmation before advancing. This threshold is a proposed product gate, not an established industry standard.
5. **Speech/drawing agreement.** Run at least 100 scripted turns with forced interruptions and delayed/duplicate tool events. Reject any wrong digit, wrong order, unauthorized step, or stale drawing after a question change. Measure timing from the audio the child actually hears. Test native audio content against its transcript; they can differ. AWS explicitly identifies this evaluation problem. [S84]
6. **Teaching voice.** Have children and parents compare TTS-2, Flash, and a premium voice on the same short scripts. Check clarity, patience, comfort, and number pronunciation. Do not approve a voice from one staff listener's preference.
7. **Long calls and cost.** Run 10-, 30-, and 60-minute sessions. Include three turns/minute, rapid single-number turns, repeated question changes, silence, reconnects, and interruptions. Reject the base forecast if actual total billed cost exceeds the chosen reserve or grows with duration after the designed context bound.
8. **Native clients.** Check browser microphone permissions, tablet Safari, Bluetooth, background/foreground changes, and device audio routing. Use an Expo development build for the later app. A browser success is not RN evidence.
9. **Child-data contract.** Confirm downstream ages 6-12, recording/transcription consent, no-training terms, retention exceptions, provider subprocessors, and US processing for each routed component. Apply ZDR/opt-outs before the first child test. Verify the effective configuration; a marketing privacy statement is insufficient.

### Whiteboard contract

Keep the drawing interface small and deterministic. A suitable contract is `draw_step(question_id, step_id, actions)`, where actions permit only `write_digit`, `circle`, `arrow`, and `check_mark`, with bounded coordinates and known operands. Validate every action against the lesson script. Do not accept free JavaScript, SVG, or arbitrary canvas instructions from the model.

Separate **tool arrival time** from **audio playback time**. Streaming audio may already be buffered when a tool event arrives. Schedule a known step's drawing with the matching spoken clause. Discard pending drawing/audio work on interruption or question change. Use operation IDs to prevent duplicate marks. Have the server own the current question and permitted next step. These are design recommendations, not confirmed turnkey guarantees from the vendors.

A cascade has an advantage for this product: the application can validate the exact speech text and drawing sequence before playback. Native speech-to-speech gives more natural timing and prosody, but a transcript is not proof of the audio. Do not release an audio explanation that advances beyond the child's accepted step.

## 13. Ranked recommendation

1. **First choice: LiveKit Agents + AssemblyAI Universal-3.6 Pro + GPT-4.1 Mini + Inworld TTS-2.** Base **USD 0.0302/min**. It offers a clear route from browser to Expo, replaceable recognition, expressive voice controls, and application-owned drawing order. Prefer LiveKit Inference's documented ZDR for supported models. Main risks: child understanding is unproved; child-use terms must be confirmed; newer Pro models and voice controls still need real timing tests; direct plugin privacy differs from routed inference.
2. **Cheaper alternative: LiveKit + Soniox + GPT-4.1 Mini + Inworld Flash.** Base **USD 0.0206/min**. It keeps the same lesson and client interfaces. Use it only if the child tests meet the same bar and Soniox approves the children's-data terms. Pipecat Cloud can reduce the base to about 0.0196, but the saving is small and warm-worker/operations costs matter. Main risks: semantic endpoint settings can wait too long or cut off a calculating child; Flash may have less useful expressive control; extra contract terms can change the price.
3. **Premium: GPT-Live 1 + a bounded lesson/backend agent.** Base **USD 0.0527/min**, excluding unpriced application hosting. Use it when child/parent tests show a material improvement in turn-taking and clarity. Main risks: newer API integration, backend tool/speech alignment, child safeguards, ZDR approval and predictable control of backend work. Realtime 2.1 Mini Minimal is the cheaper native comparator, but its cache dependence and lower general task score make it a test candidate rather than the first production choice.

**Do not choose standard Gemini Developer API for this under-13 service.** Its client age restriction is explicit. Keep Google Cloud Gemini 3.8 Live and Nova 2.5 Sonic as secondary test candidates only after the Cloud terms and actual long-call usage are resolved. Their fresh-audio rates alone do not establish the cheapest eligible system.

## Source register

Every source below was read on **2026-10-29**. Pricing tables above use this date. A page can change after this record. Search-only or incomplete extractions are identified where they limit a claim.

- **S1** LiveKit pricing, including plain-text feature matrix and cost formulas: https://livekit.com/pricing.md
- **S2** LiveKit Inference, ZDR, provider routing and observability boundary: https://docs.livekit.io/agents/models/inference
- **S3** OpenAI GPT-4.1 Mini model and prices: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- **S4** AssemblyAI authoritative pricing reference: https://www.assemblyai.com/pricing
- **S5** Inworld pricing and plan/credit terms: https://inworld.ai/pricing
- **S6** Soniox STT/TTS token prices and hourly conversion assumptions: https://soniox.com/pricing
- **S7** Soniox security and privacy: https://soniox.com/docs/security-and-privacy
- **S8** Soniox service terms, including children's information: https://soniox.com/policies/terms-of-service
- **S9** OpenAI GPT-Live 1 model, tools and pricing: https://developers.openai.com/api/docs/models/gpt-live-1
- **S10** OpenAI under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- **S11** OpenAI endpoint retention, training, and regional processing: https://developers.openai.com/api/docs/guides/your-data
- **S12** Pipecat Cloud pricing: https://www.daily.co/pricing/pipecat-cloud/
- **S13** OpenAI voice/Realtime costs, cache behavior and session initialization: https://developers.openai.com/api/docs/guides/realtime-costs
- **S14** Google Cloud model prices and Live per-turn billing: https://cloud.google.com/vertex-ai/generative-ai/pricing
- **S15** OpenAI Realtime 2.1 Mini prices and transport: https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- **S16** Artificial Analysis speech-to-speech measurements and methodology: https://artificialanalysis.ai/speech-to-speech
- **S17** OpenAI current API pricing: https://developers.openai.com/api/docs/pricing
- **S18** Google Developer API pricing, live models, transcription and TTS: https://ai.google.dev/gemini-api/docs/pricing
- **S19** Google Cloud Gemini 3.8 Live developer guide: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live
- **S20** Gemini Live tools, including older compatibility table: https://ai.google.dev/gemini-api/docs/live-tools
- **S21** AWS Nova 2.5 Sonic launch, regions and same-price statement: https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-nova-2.5-sonic/
- **S22** AWS Live Meeting Assistant cost example with Nova speech token prices; price evidence recovered from first-party search result, not a dynamic tariff table: https://aws.amazon.com/id/blogs/machine-learning/live-meeting-assistant-with-amazon-transcribe-amazon-bedrock-and-knowledge-bases-for-amazon-bedrock
- **S23** AWS Loka Nova 2 customer example and 1.39-second TTFA: https://aws.amazon.com/blogs/machine-learning/how-loka-built-a-natural-low-latency-voice-agent-with-amazon-nova-2-sonic
- **S24** xAI pricing, Voice 3.0 and text-input charges: https://docs.x.ai/developers/pricing
- **S25** ElevenLabs current API prices, Realtime v1 and published latencies: https://elevenlabs.io/pricing/api
- **S26** Rime pricing, Prism, Mist, Coda, STT, timings and deployment options: https://www.rime.ai/pricing
- **S27** OpenAI Realtime introduction and browser/server flow: https://developers.openai.com/api/docs/guides/realtime
- **S28** OpenAI GPT-Live asynchronous architecture, first-party article located through search: https://openai.com/index/continuous-voice-interaction-with-gpt-live
- **S29** Google Cloud Gemini 3.8 Live model, regions and caching support: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-live
- **S30** AWS Nova 2.5 Sonic asynchronous tools in a complete architecture: https://aws.amazon.com/blogs/machine-learning/build-a-voice-travel-concierge-with-amazon-bedrock-agentcore-managed-knowledge-base-and-nova-sonic
- **S31** AWS Nova 2.5 Sonic service card: https://docs.aws.amazon.com/ai/responsible-ai/nova-2-5-sonic/overview.html
- **S32** xAI voice API and function schemas: https://docs.x.ai/docs/guides/voice/agent
- **S33** ElevenLabs residency docs, indexed Markdown and API endpoint documentation: https://elevenlabs.io/docs/overview/administration/data-residency.mdx and https://elevenlabs.io/docs/api-reference/voices/replicate-to-isolated-environment
- **S34** Gemini Developer API terms, age and data use: https://ai.google.dev/gemini-api/terms
- **S35** Google Cloud service terms: https://cloud.google.com/terms/service-terms
- **S36** Soniox endpoint detection and accuracy tradeoffs: https://soniox.com/docs/stt/rt/endpoint-detection
- **S37** AssemblyAI streaming migration and latency modes, first-party search evidence: https://assemblyai.com/docs/streaming/migration-guides/universal-to-universal-3-5-pro-streaming and https://assemblyai.com/docs/streaming/getting-started/optimizing-accuracy-and-latency
- **S38** Deepgram current direct prices: https://deepgram.com/pricing
- **S39** Speechmatics pricing; extracted STT headings are prerecorded: https://www.speechmatics.com/pricing
- **S40** Speechmatics realtime quickstart: https://docs.speechmatics.com/speech-to-text/realtime/quickstart
- **S41** Speechmatics 2022 child-voice article; quantitative body not recovered: https://speechmatics.com/company/articles-and-news/understanding-childrens-voices-how-voice-to-text-assists-elearning
- **S42** OpenAI GPT-Live Transcribe: https://developers.openai.com/api/docs/models/gpt-live-transcribe
- **S43** OpenAI deprecations and removal dates: https://developers.openai.com/api/docs/deprecations
- **S44** Google Cloud STT pricing: https://cloud.google.com/speech-to-text/pricing
- **S45** SoapBox historical FAQ and API evidence, current offer unconfirmed: https://soapboxlabs.com/faqs and https://docs.soapboxlabs.com/technical-docs/online-technical-documentation/fluency-(online)
- **S46** Inworld TTS-2/Flash latency measurements and limits: https://inworld.ai/resources/tts-2-vs-tts-2-flash
- **S47** Cartesia plans: https://cartesia.ai/pricing
- **S48** Cartesia credit metering: https://docs.cartesia.ai/pricing
- **S49** Cartesia Sonic 3.6 announcement, provider latency claim: https://cartesia.ai/blog/sonic-3.6
- **S50** Google Cloud TTS pricing: https://cloud.google.com/text-to-speech/pricing
- **S51** Speechmatics TTS preview timing and retention, first-party indexed documentation: https://docs.speechmatics.com/text-to-speech/quickstart
- **S52** LiveKit tools and external data: https://docs.livekit.io/agents/logic/external-data/
- **S53** LiveKit RN/Expo transport: https://docs.livekit.io/transport/sdk-platforms/react-native/
- **S54** Pipecat RN SDK: https://docs.pipecat.ai/client/react-native/introduction
- **S55** ElevenLabs Agents pricing and burst rates: https://elevenlabs.io/pricing/agents
- **S56** ElevenLabs client tools: https://elevenlabs.io/docs/agents-platform/customization/tools/client-tools
- **S57** ElevenLabs RN/Expo SDK: https://elevenlabs.io/docs/agents-platform/libraries/react-native
- **S58** Vapi pricing and package-dependent ZDR statement: https://vapi.ai/pricing
- **S59** Vapi web/RN quickstart, indexed first-party documentation: https://docs.vapi.ai/quickstart/web
- **S60** Cartesia managed-agent price and temporary inclusion, provider comparison: https://cartesia.ai/learn/ai-voice-agent-platforms
- **S61** Retell pricing: https://www.retellai.com/pricing
- **S62** Vapi ZDR document, conflicting entitlement statement: https://docs.vapi.ai/security-and-privacy/zero-data-retention
- **S63** Google Cloud ZDR controls and Live resumption retention: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention
- **S64** Bedrock data retention controls: https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html
- **S65** Bedrock data protection: https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html
- **S66** Soniox regional processing: https://soniox.com/docs/stt/data-residency
- **S67** AssemblyAI training and streaming retention: https://assemblyai.com/docs/data-retention-and-model-training
- **S68** AssemblyAI service terms: https://www.assemblyai.com/legal/terms-of-service
- **S69** Deepgram data handling, regional controls and MIP opt-out: https://developers.deepgram.com/trust-security/your-data
- **S70** Deepgram service terms: https://deepgram.com/terms
- **S71** Speechmatics Flow consumer policy, indexed first-party source: https://speechmatics.com/flow-privacy-policy
- **S72** Inworld API service terms: https://inworld.ai/terms
- **S73** Inworld direct ZDR plan requirement, indexed first-party document: https://docs.inworld.ai/portal/zero-data-retention
- **S74** Inworld general privacy policy: https://inworld.ai/privacy
- **S75** Cartesia terms: https://cartesia.ai/legal/terms
- **S76** Cartesia AUP and children's privacy, indexed first-party policies: https://cartesia.ai/legal/acceptable-use.html and https://cartesia.ai/legal/privacy-policy
- **S77** ElevenLabs service terms and training opt-out: https://elevenlabs.io/terms-of-use
- **S78** ElevenLabs per-agent Zero Retention Mode: https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm
- **S79** Rime service terms: https://www.rime.ai/terms
- **S80** LiveKit stack residency controls: https://docs.livekit.io/deploy/admin/regions/data-residency/
- **S81** Pipecat Cloud logging, indexed first-party documentation: https://docs.pipecat.ai/pipecat-cloud/fundamentals/logging
- **S82** Vapi data flow and default logs, indexed first-party documentation: https://docs.vapi.ai/security-and-privacy/data-flow
- **S83** DrivenData child-ASR study, published October 2026, tests mid-2025: https://drivendata.co/blog/child-asr-benchmarking
- **S84** AWS speech-to-speech evaluation and audio/transcript divergence, indexed first-party article: https://aws.amazon.com/blogs/machine-learning/evaluate-your-amazon-nova-sonic-voice-agent-at-scale-no-microphone-required
- **S85** OpenAI Realtime GA announcement, asynchronous tools and Cedar/Marin voices; actual page date August 28, 2025, despite a newer search-index date: https://openai.com/index/introducing-gpt-realtime/

## Verification boundary

Pricing research establishes the listed public rates and some published test results. It does not establish negotiated child-use permission, actual billed session totals, measured home-device latency, child recognition accuracy, voice preference, synchronized whiteboard behavior, or overall plan margin. Those remain open until the proposed evaluation and contract checks are complete.
