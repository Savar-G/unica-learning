# Maya: LiveKit agent research

Research date and source read date: **2026-10-29**. All linked sources below were read on this date. The target is one child, one math question, and one shared board.

## Decision

Use TypeScript for the agent. LiveKit Agents for Node supports the selected STT, OpenRouter LLM, and TTS chain. Python is not required for this chain. Use acknowledged RPC calls to queue board commands. Use synchronized transcript output to release the queued commands during speech. Treat word timing as an estimate until a browser audio test proves the required accuracy.

Use text-only Node sessions and a fake LLM for CI. Add separate tests with the real LLM. Keep audio and device checks separate from those tests.

These are recommendations from the evidence below. This research did not install packages, run an agent, make audio calls, or test a browser. Runtime compatibility and measured Maya latency remain **unconfirmed**.

## Method and source control

- I used Keenable `search_web_pages` first. Every search used `published_after: 2026-04-01`.
- I used Keenable `fetch_page_content` for official documentation, GitHub READMEs, and release notes.
- I used the public GitHub API and raw release source to check claims where documentation disagreed. These were read-only requests.
- Context7 tools were unavailable in this session.
- I used Node release `1.9.5`, commit `22da3e891865bea45d3cbb30c08241f165ab8aab`, for source checks. Documentation URLs can change after this date.

Several general documentation pages contain old feature lists. For example, the Node README omits AssemblyAI and Soniox from its plugin table. Their packages exist in the release source. The transcription guide omits current Inworld word timing support. This report identifies these conflicts instead of treating a general feature table as complete.

Sources: [Node release](https://github.com/livekit/agents-js/releases/tag/%40livekit/agents%401.9.5), [Node README](https://github.com/livekit/agents-js), [release tree](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab).

## 1. Node support and Python differences

### Version and maturity

The latest stable core releases returned by GitHub were:

| SDK | Version | Release date |
| --- | --- | --- |
| Node, `@livekit/agents` | `1.9.5` | 2026-10-28 |
| Python, `livekit-agents` | `1.8.10` | 2026-10-29 |

Sources: [Node release](https://github.com/livekit/agents-js/releases/tag/%40livekit/agents%401.9.5), [Python release](https://github.com/livekit/agents/releases/tag/livekit-agents%401.8.10).

Node is a supported 1.x implementation. LiveKit documents both languages for production agents. Node has sessions, streaming pipelines, tools, handoffs, MCP support, cloud hosting, and test helpers. The current Node starter also includes simulations, a Dockerfile, and coding-agent instructions. This is sufficient evidence to choose Node for Maya. It does not prove full feature equality with Python. Version numbers do not measure feature equality.

Sources: [framework introduction](https://docs.livekit.io/agents/), [Node starter](https://github.com/livekit-examples/agent-starter-node), [Node source](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src).

The current Node starter specifies Node `>=24.0.0`. Use Node 24 as the initial runtime choice. This is a starter requirement, not a confirmed minimum for every SDK package.

Source: [starter package](https://github.com/livekit-examples/agent-starter-node/blob/main/package.json).

### Required plugins

All seven packages below have version `1.9.5` in the checked release tree. A package version proves that the implementation exists. It does not prove the behavior of every provider model.

| Provider or function | Node package | Confirmed support and limits |
| --- | --- | --- |
| AssemblyAI | `@livekit/agents-plugin-assemblyai` | Streaming STT exists. Typed direct-provider model IDs include `universal-streaming-english` and `universal-streaming-multilingual`. The gateway ID is `assemblyai/universal-streaming`. Do not use the gateway ID as a direct-provider model ID. |
| Soniox | `@livekit/agents-plugin-soniox` | Streaming STT exists. Node defaults to `stt-rt-v4`. The guide says Python defaults to `stt-rt-v5`. Defaults and endpoint options differ. |
| Deepgram | `@livekit/agents-plugin-deepgram` | STT and TTS exist. STT options include Nova and Flux models. Flux can supply its own end-of-turn signals. |
| OpenAI-compatible LLM | `@livekit/agents-plugin-openai` | `openai.LLM` accepts a model string, `apiKey`, and `baseURL`. It uses Chat Completions. This permits the OpenRouter endpoint. |
| Inworld | `@livekit/agents-plugin-inworld` | Streaming TTS exists. The checked source defaults to `inworld-tts-2`. It accepts word or character timestamp options. |
| ElevenLabs | `@livekit/agents-plugin-elevenlabs` | TTS and STT both exist. Select `scribe_v2_realtime` for streaming STT. The documented STT default, `scribe_v1`, is batch mode. |
| Cartesia | `@livekit/agents-plugin-cartesia` | STT and streaming TTS exist. TTS can provide word timing. |

Release sources: [AssemblyAI](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/assemblyai), [Soniox](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/soniox), [Deepgram](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/deepgram), [OpenAI](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/openai/src/llm.ts), [Inworld](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/inworld/src/tts.ts), [ElevenLabs](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/elevenlabs), [Cartesia](https://github.com/livekit/agents-js/tree/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/cartesia).

Provider documentation: [AssemblyAI](https://docs.livekit.io/agents/models/stt/plugins/assemblyai/), [Soniox](https://docs.livekit.io/agents/models/stt/plugins/soniox/), [Deepgram](https://docs.livekit.io/agents/models/stt/plugins/deepgram/), [ElevenLabs Scribe](https://docs.livekit.io/agents/models/stt/elevenlabs/).

### OpenRouter

The following is the supported endpoint configuration pattern. It is a research example, not code tested in this repository.

```ts
import * as openai from '@livekit/agents-plugin-openai';

const llm = new openai.LLM({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'anthropic/claude-sonnet-5.5',
});
```

The Node source passes `baseURL` and `apiKey` into the OpenAI client. OpenRouter documents this exact base URL for its OpenAI-compatible API. Thus Node can point at OpenRouter without a separate LiveKit OpenRouter package. The LiveKit OpenRouter convenience guide is marked Python-only. That label does not remove the Node OpenAI client's custom URL support.

Sources: [Node LLM constructor](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/openai/src/llm.ts#L20), [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [LiveKit OpenRouter guide](https://docs.livekit.io/agents/models/llm/plugins/openrouter/).

Successful streaming and tool calling with this exact model, account, and provider route are **unconfirmed**. The example model comes from the task context. Verify its availability and tool support before fixing the production configuration.

### Turns, interruptions, and noise

Node supports these turn control options:

- The current audio `inference.TurnDetector`, built into Node since `1.4.7`.
- The full `v1` model on LiveKit Inference and the local CPU `v1-mini` model.
- The older text-based multilingual end-of-utterance model through `@livekit/agents-plugin-livekit`.
- VAD-only detection, STT endpoint signals, and manual turn control.

The current guide recommends the audio detector. Its full model uses audio meaning and acoustic cues. It supports 14 listed languages. This does not establish accuracy for children or for short math answers. The full model has cloud allowances and fallback behavior. A self-hosted production agent defaults to the local mini model unless configured otherwise.

Sources: [turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector/), [turn options](https://docs.livekit.io/agents/logic/turns/), [Node README](https://github.com/livekit/agents-js).

Node also supports adaptive interruption handling. It uses acoustic classification after VAD to separate an interruption from a brief acknowledgement. It can run with an externally hosted agent when the agent explicitly selects adaptive mode and supplies LiveKit Cloud credentials. It is a cloud service dependency. Node also supports VAD interruption mode, per-speech interruption control, forced interruption, false-interruption events, and speech resumption. In the checked source, `falseInterruptionTimeout` defaults to 2000 ms and `resumeFalseInterruption` defaults to `true`.

Sources: [adaptive interruption guide](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/), [Node interruption options](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/turn_config/interruption.ts).

Noise cancellation is available for Node. LiveKit documents Krisp and ai-coustics filters on incoming agent audio. The Node starter uses `@livekit/plugins-ai-coustics`. Cloud transport can supply the advanced cancellation service even if the agent runs elsewhere. Browser `echoCancellation` and `noiseSuppression` are separate capture controls. Do not apply two advanced noise cancellation models in sequence. The guide permits standard cancellation and separate echo cancellation to remain enabled.

Sources: [noise and echo guide](https://docs.livekit.io/transport/media/noise-cancellation/), [Node starter dependencies](https://github.com/livekit-examples/agent-starter-node/blob/main/package.json).

### Python-only features and source conflicts

The following are documented Python-only differences relevant to this review. This is not a complete list of every provider option in both SDKs.

| Feature | Status on the read date |
| --- | --- |
| Dynamic endpointing based on session pause statistics | The turn guide marks this Python-only. Node supports fixed delay controls. |
| Returning the transcript from manual `commit_user_turn()` | The guide says only Python returns the transcript future. |
| Manual commit with `skip_reply=True` | The guide marks this Python-only. |
| Selecting the manual-turn caller's audio input by RPC caller identity | The manual-turn guide marks this Python-only. This is narrower than ordinary room participant selection. |
| Automatic removal of a realtime model's server-side turn detector when client turn-taking is selected | The guide marks this Python-only. It does not affect the chosen cascaded pipeline. |
| Prebuilt personal-data collection tasks | The task guide lists Python implementations. Node release workflow exports include task groups and warm transfer, but not the listed name, email, address, date-of-birth, phone, card, or DTMF collection tasks. Build a custom `AgentTask` if required. |
| OpenRouter convenience configuration | The dedicated guide is Python-only. Node custom `baseURL` remains available. |

Sources: [turn guide](https://docs.livekit.io/agents/logic/turns/), [prebuilt task guide](https://docs.livekit.io/agents/prebuilt/tasks/), [Node workflow exports](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/workflows/index.ts), [OpenRouter guide](https://docs.livekit.io/agents/models/llm/plugins/openrouter/).

Do not repeat older claims that Node lacks MCP, async tools, agent tests, end-call tools, or warm transfer. Current source or dedicated guides show these features. `WarmTransferTask` is in the Node `workflows` namespace. Node uses `beta.createEndCallTool()` for the prebuilt end-call tool.

Sources: [Node README](https://github.com/livekit/agents-js), [async tools](https://docs.livekit.io/agents/logic/tools/async/), [end-call tool](https://docs.livekit.io/agents/prebuilt/tools/end-call-tool/), [warm transfer](https://docs.livekit.io/agents/prebuilt/tasks/warm-transfer/).

The adaptive interruption page marks a turn-boundary option Python-only, while the Node release has `backchannelBoundary`. Treat that documentation label as a source conflict. Do not use it as proof that Node lacks the option.

Sources: [adaptive guide](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/), [Node interruption source](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/turn_config/interruption.ts).

## 2. LiveKit Inference and provider keys

LiveKit Inference is an optional model gateway. Node exposes `inference.STT`, `inference.LLM`, and `inference.TTS`. These use LiveKit Cloud credentials and billing. They do not require separate provider plugins or provider keys. The current catalog includes AssemblyAI Universal-Streaming and Inworld TTS-2.

Provider plugins call providers directly. They use the provider's key, billing, model IDs, limits, and regional settings. Both approaches can be combined in one session. For Maya, use the OpenAI plugin with the OpenRouter key for the LLM. Select direct plugins or Inference independently for STT and TTS.

Sources: [Inference guide](https://docs.livekit.io/agents/models/inference/), [AssemblyAI guide](https://docs.livekit.io/agents/models/stt/plugins/assemblyai/), [Inworld guide](https://docs.livekit.io/agents/models/tts/plugins/inworld/), [Node starter](https://github.com/livekit-examples/agent-starter-node).

Inference is not the same product as agent hosting. An external agent can authenticate to LiveKit Inference. Conversely, a Cloud-hosted agent can use provider keys. The gateway catalog is not the complete plugin catalog. OpenRouter is not a generic upstream URL setting for `inference.LLM`; use the OpenAI-compatible plugin for the selected OpenRouter path.

Sources: [Inference authentication and billing](https://docs.livekit.io/agents/models/inference/), [Node OpenAI plugin](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/openai/src/llm.ts).

Region restriction applies to gateway requests. Direct plugins need their own regional configuration. LiveKit says Inference uses zero data retention by default. This is separate from agent observability, which can retain recordings, transcripts, and traces. These settings must be reviewed separately for Maya's child sessions.

Source: [Inference data handling and region restriction](https://docs.livekit.io/agents/models/inference/).

## 3. Structured board commands

| Channel | Confirmed behavior | Limits | Use for Maya |
| --- | --- | --- | --- |
| RPC | Named request and response between participants. A handler returns success or an error. LiveKit explicitly recommends it for frontend actions from agent tools. | Request and response each allow 15 KiB of UTF-8 text. Method name allows 64 UTF-8 bytes. Default response timeout is 10 seconds. | Recommended for command batches, acknowledgements, cancellation, and snapshot requests. |
| Reliable data packets | Ordered delivery with retransmission. The guide calls delivery best effort. The server does not retain packets for disconnected participants. | 15 KiB user payload. The whole protocol packet limit is 16 KiB. | Suitable for small events when the app supplies its own acknowledgement and recovery protocol. |
| Lossy data packets | No retransmission or ordering guarantee. | Recommended maximum is 1300 bytes. | Optional pointer position. Do not use for a digit, solution step, or board revision. |
| Text streams | Topic-based streams with automatic chunk handling. Supports concurrent streams. Stream-open handlers follow sender open order. | Receiver default payload allowance is 5 GB. Node checks each payload. Browser checks compressed payloads for its decompression limit. | Suitable for transcripts or a larger JSON snapshot. Set a much smaller application limit. |
| Byte streams | Ordered content inside a stream. Can transfer files and larger data. | Receiver default allowance is 5 GB. Transport chunks are generally below 15 kB. | Suitable for a board image or serialized drawing. Not needed for a small tool command. |
| Participant attributes and metadata | Server-managed state. A later participant receives current values. It is not a command history. | Attributes allow 64 KiB across keys and values. Participant metadata allows 512 KiB. Avoid updates more often than once every few seconds. | Store a board revision or session state indicator. Do not send strokes or speech cues here. |

Sources: [RPC](https://docs.livekit.io/transport/data/rpc/), [packets](https://docs.livekit.io/transport/data/packets/), [text streams](https://docs.livekit.io/transport/data/text-streams/), [byte streams](https://docs.livekit.io/transport/data/byte-streams/), [participant state](https://docs.livekit.io/transport/data/state/participant-attributes/).

A full reconnection terminates in-progress incoming streams. A late participant does not receive an already-started stream. Reliability within a connection does not provide persistent state or exactly-once application actions.

Sources: [text stream error handling](https://docs.livekit.io/transport/data/text-streams/#error-handling), [byte streams](https://docs.livekit.io/transport/data/byte-streams/).

### Recommended command contract

This is an application design recommendation. It is not a built-in LiveKit whiteboard protocol.

Use a browser RPC handler named `maya.board.apply`. Send a small validated JSON batch. Include `sessionId`, `questionId`, `epoch`, `utteranceId`, `batchId`, `baseRevision`, `sequence`, and a closed list of drawing operations. Represent the operations as digits or text, circle, arrow, underline, and check mark. Use board coordinates independent of screen pixels.

The browser validates the caller identity, command schema, question, epoch, and revision. It adds accepted commands to a queue. It returns the accepted batch ID and revision. The acknowledgement means the browser accepted the plan. It does not mean that a scheduled drawing appeared.

Send the next dependent batch only after the previous acknowledgement. Concurrent RPC completion order is not a documented transaction order. Deduplicate batch IDs. If an RPC times out, query its status or the current board revision before retrying the same ID. The original handler may have acted before its response was lost.

Keep each batch below the 15 KiB transport limit. Prefer a small internal limit such as 8 KiB. Use one JSON snapshot stream or an authenticated application endpoint for a larger resynchronization. Restore the authoritative board revision after reconnect. Do not replay old speech cues.

The ordering, deduplication, authorization, and reconnect rules above are Maya requirements. LiveKit provides the transport and RPC errors. It does not supply these board rules.

## 4. Speech and drawing synchronization

### What Node provides

Node has all of the following in release `1.9.5`:

- `useTtsAlignedTranscript` on `AgentSession`. Its checked default is `true`.
- `Agent.transcriptionNode(...)`, which accepts text or `TimedString` values.
- `TimedString` fields `text`, `startTime`, and `endTime`. The times use seconds.
- `outputOptions.syncTranscription`, with a default of `true`.
- `outputOptions.jsonFormat`, which sends newline-delimited JSON chunks on `lk.transcription`. Chunks can contain `text`, `start_time`, `end_time`, and other timing fields.

Sources: [session options](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/agent_session.ts), [agent hook](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/agent.ts#L345), [TimedString](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/io.ts#L33), [room output options](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/room_io/room_io.ts#L96), [JSON serialization](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/room_io/_output.ts#L166).

The documentation says synchronized transcript output advances with speech and truncates on interruption. It recommends `registerTextStreamHandler` or React `useTranscriptions`. The older `TranscriptionReceived` event is deprecated. A text stream write does not itself produce that older event.

Source: [text and transcription guide](https://docs.livekit.io/agents/multimodality/text/).

### Inworld timing support is present

The direct Node Inworld plugin accepts `timestampType: 'WORD'` or `'CHARACTER'`. It parses provider alignment and creates `TimedString` values. It also accepts `timestampTransportStrategy: 'SYNC' | 'ASYNC'`; its default is `ASYNC`. Request timestamps explicitly. The capability flag alone is not proof that a provider returned valid timings.

Source: [Inworld release source](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/plugins/inworld/src/tts.ts).

The Node Inference implementation also supports Inworld alignment. Set `modelOptions: { timestamp_type: 'WORD' }` or `CHARACTER`. Its `hasAlignedTranscript` function checks this setting. It has an `output_alignment` processing path. Cartesia Inference similarly requires `add_timestamps` for aligned output.

Source: [Inference TTS release source](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/inference/tts.ts#L200).

The general transcription guide lists only Cartesia, ElevenLabs, Rime, and Speechify for word alignment and describes other providers as sentence-aligned. That list conflicts with the current Inworld and Inference source. The source confirms implementation support. Correct word timing in a live Maya session remains **unconfirmed**.

Source: [general guide](https://docs.livekit.io/agents/multimodality/text/#tts-aligned-transcriptions).

### What synchronization does not guarantee

The agent transcription hook is a pipeline hook. It is not a browser speaker callback. TTS can return text and alignment before the client plays the corresponding sound. Do not draw immediately when the hook receives a word.

The Node synchronizer uses audio output timing, word timing when available, and a speaking-rate calculation. Its emitted synchronized text can carry an estimated `endTime`. It is not a sample-accurate browser audio clock. Network delay, the browser audio buffer, blocked autoplay, and main-thread delays can move the visible drawing relative to audible speech.

Source: [Node transcription synchronizer](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/transcription/synchronizer.ts).

No checked official source guarantees that an arbitrary browser callback will run at the exact instant a specific word leaves the speaker. That guarantee is **unconfirmed**. Do not estimate it from tool-call arrival time or LLM token arrival time.

### Recommended synchronization method

1. Generate a short teaching step with a speech string and a board plan. Assign an utterance ID before speech starts.
2. Send the plan by RPC. Include cue positions within that utterance and an occurrence index for repeated words. Wait for acceptance.
3. Start the speech. Keep synchronized transcription output enabled. Request Inworld word timing explicitly.
4. Read `lk.transcription` incrementally. With `jsonFormat: true`, parse complete JSON lines across transport chunks. Do not call `JSON.parse` on each transport chunk.
5. Match transcript progress to the accepted utterance and cue position. Release each operation once. Do not match the first occurrence of a word across the whole call.
6. On a true interruption, cancel commands that the client has not shown. Keep the board operations that it already showed. On false-interruption resume, preserve the utterance and applied-command record.
7. On reconnect, restore board state and clear expired utterance queues. Start a new epoch for a new question or a replaced answer.

This method gives approximate word-linked drawing. It requires an application mapping between LiveKit speech/transcription segments and Maya utterance IDs. LiveKit does not document that application mapping as a built-in whiteboard feature. Verify it in a small integration test before building the full lesson flow.

If word timing is absent or late, use sentence boundaries or short `say()` segments. Await the speech handle's playout boundary before the next dependent step. This reduces timing precision but makes step ordering explicit. A strict requirement such as a maximum 100 ms audio-to-drawing error needs a measured client playback design. Support for that limit is **unconfirmed**.

### How LiveKit demonstrates frontend actions

The official forwarding example defines a Node `llm.tool`. The tool calls `room.localParticipant.performRpc`. The browser registers an RPC handler. The example reads browser location, but the guide explicitly permits structured UI updates through the same mechanism. The tool returns the RPC result to the LLM.

This demonstrates agent-driven UI actions. It does not demonstrate speech-aligned whiteboard strokes. I found no checked official example that provides that complete behavior.

Source: [frontend tool forwarding example](https://docs.livekit.io/agents/logic/tools/forwarding/).

## 5. Tools while Maya speaks

Node supports function tools with a Zod parameter schema. A tool can call `session.say()`, request another model reply, call frontend RPC, and return a result. Node also supports background tools, progress updates through `ctx.update()`, filler speech, foreground interaction, and cancellation options.

Sources: [tool guide](https://docs.livekit.io/agents/logic/tools/), [async tool guide](https://docs.livekit.io/agents/logic/tools/async/).

An agent turn can contain spoken text and a tool call. The Node streaming LLM interface carries text and function-call data. Its fake LLM can emit content followed by a tool call in one response. Therefore the framework can process a spoken preamble and a tool action within one turn. Speech already queued can overlap tool work. Background tools let the conversation continue during longer work.

Source: [fake LLM streaming implementation](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/testing/fake_llm.ts).

This does not guarantee that the chosen OpenRouter model will stream the required sentence before its tool call, or that the call will occur at a specific word. That exact model behavior is **unconfirmed**. An ordinary Chat Completions tool exchange still requires tool output before the next dependent completion.

Recommendation: expose one `teachStep` tool that validates and queues the board plan and owns the associated short speech. Do not ask the model to time a separate `drawDigit` call from free-running speech. Keep board actions short. Reserve background execution for independent slow work.

## 6. Tests without real audio

### Confirmed Node test support

LiveKit documents Vitest tests for Node. A session can start with an agent and an LLM without a room, STT, microphone, or TTS. `session.run({ userInput })` returns a `RunResult`. Assert on messages, function calls, arguments, function outputs, handoffs, and unexpected extra events.

The checked examples use this sequence:

```ts
const session = new voice.AgentSession({ llm });
await session.start({ agent });
const result = session.run({ userInput: 'I think the answer is seven.' });
await result.wait();
result.expect.containsFunctionCall({ name: 'teachStep' });
await session.close();
```

This is an API outline. The research did not run it. The teaching tool name belongs to the proposed Maya design.

Sources: [unit test guide](https://docs.livekit.io/testing/unit-tests/), [Node integration test example](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/examples/src/testing/run_result.test.ts).

`voice.testing.FakeLLM` provides scripted input-to-content and tool-call responses. `voice.testing.withMockTools` substitutes tool behavior. These are exported test helpers. They permit tests without model keys. A real-model text test has no audio requirement, but it still uses network access and incurs model cost. Scripted input alone does not make a real-model result deterministic.

Sources: [test helper exports](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/testing/index.ts), [fake LLM](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/testing/fake_llm.ts), [voice exports](https://github.com/livekit/agents-js/blob/22da3e891865bea45d3cbb30c08241f165ab8aab/agents/src/voice/index.ts).

### Coding-agent debugger and simulations

The official CLI debugger runs locally and accepts one text turn at a time. Text mode does not connect to a room and disables speech. It returns replies, tool calls, handoffs, and errors. It requires LiveKit CLI `2.19.0` or later. The Node starter documents:

```sh
lk agent debugger start
lk agent debugger say "Help me with 8 plus 7."
lk agent debugger stop
```

Sources: [debugger](https://docs.livekit.io/testing/debugger/), [Node starter](https://github.com/livekit-examples/agent-starter-node).

Agent Simulations support Node `1.6.0` or later and CLI `2.19.0` or later. Text simulations test multi-turn model and tool behavior without STT or TTS. They run on LiveKit Cloud and spend tokens on the simulated child, Maya, and the judge. Audio simulations test the full pipeline using generated audio. They do not require a person at a microphone, but they are real audio integration tests.

Source: [simulation requirements and modes](https://docs.livekit.io/testing/simulations/).

The debugger and text simulations do not provide a real browser participant for RPC. Inject a board adapter for room-free tests. Use an in-memory board that implements the same application interface. Keep RPC in the room adapter. A passing mocked tool test does not prove RPC delivery.

### Recommended test levels and falsifiers

| Test level | Result that would disprove the claim | What a pass establishes | What it does not establish |
| --- | --- | --- | --- |
| Pure teaching and board reducer tests | A duplicate adds a second mark; a stale epoch changes the board; an invalid operation passes validation. | Board state rules and deterministic math-step rules. | Model teaching quality or media behavior. |
| Node session with `FakeLLM` and an in-memory board | Missing or wrong tool arguments; unexpected extra tool calls; a cancelled step later changes the board. | Agent tool wiring, state transitions, and expected event order under scripted input. | Real model choices, STT, TTS, or RPC. |
| Real OpenRouter model, text-only | Wrong math; full answer shown before the requested child step; failure to use the board tool. | Behavior of the selected model and prompt on the tested examples. | Audio recognition, timing, and browser delivery. |
| Browser command adapter with fake transcript timing | A command appears before its cue; duplicate cues repeat a mark; reconnect applies an expired plan. | The actual client queue and reducer rules under injected events. | Audible word alignment. |
| Audio integration and physical-device checks | Early endpointing on a thinking pause; a one-word answer is ignored; drawing misses the measured cue bound; Safari has silent playback. | Behavior of the tested audio stack and device conditions. | Other devices or child speech not represented in the sample. |

Test the fake LLM and board path on each change. Run a small real-model text suite for teaching changes. Run paid full-conversation and audio suites on a bounded schedule or before release. Include wrong answers, silence, repeated digits, interrupted speech, late timestamps, tool timeout, duplicate delivery, reconnect, and phone rotation.

## 7. Next.js client now and Expo later

Use `livekit-client` in a client component. Use `@livekit/components-react` for room context, remote audio, agent state, and transcription hooks. Generate the participant token in a server route with `livekit-server-sdk`. Keep the API secret on the server.

The official Next.js starter includes `app/api/token/route.ts`. It creates `AccessToken`, applies room grants, awaits `toJwt()`, and returns connection details with `Cache-Control: no-store`. Its production path requires an authentication layer. Adopt the pattern, then bind the room and participant to the authorized child/question session. Do not accept arbitrary production room grants from the browser.

Sources: [React starter](https://github.com/livekit-examples/agent-starter-react), [server token route](https://github.com/livekit-examples/agent-starter-react/blob/main/app/api/token/route.ts).

The checked starter uses React 19 and Next.js 15.5.27. It is evidence for React 19 and the App Router pattern. It is not a completed Next.js 16 compatibility test. Maya integration with this repository's exact Next.js 16 version remains **unconfirmed**.

Source: [React starter package](https://github.com/livekit-examples/agent-starter-react/blob/main/package.json).

For Expo, use `@livekit/react-native`, `@livekit/react-native-webrtc`, and `livekit-client`. Use the Expo config plugin and a development build. The SDK needs native WebRTC code. Do not plan on Expo Go as the test runtime. Initialize `registerGlobals()` and manage `AudioSession` as the SDK requires.

Sources: [React Native SDK](https://github.com/livekit/client-sdk-react-native), [Expo plugin](https://github.com/livekit/client-sdk-react-native-expo-plugin), [React Native quickstart](https://docs.livekit.io/transport/sdk-platforms/react-native/), [Expo starter](https://github.com/livekit-examples/agent-starter-react-native).

The same server agent can serve web and native room participants. Share board command types, validation, and the reducer as a TypeScript package. Each client needs its own rendering and audio adapter. React web components do not automatically become native components. This reuse plan follows the common room protocol. It has not been tested here.

### iOS Safari and microphone behavior

- Microphone capture requires a secure context and user permission. Permission denial or a restrictive Permissions Policy can produce `NotAllowedError`. An embedded frame needs explicit microphone permission from its parent context.
- Safari can block remote audio autoplay. `Room.startAudio()` must run from a click or tap handler. Observe `RoomEvent.AudioPlaybackStatusChanged` and `room.canPlaybackAudio`. Provide an explicit start-audio action when needed.
- Establish client audio readiness before the agent greeting. This is a recommendation to prevent the first teaching step from running while audio remains blocked.
- Echo cancellation is a capture setting, not a guarantee of zero speaker leakage. Test a tablet on speakers as well as a headset.

Sources: [getUserMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [LiveKit JS autoplay guidance](https://github.com/livekit/client-sdk-js#configuring-audio-playback), [noise and echo guide](https://docs.livekit.io/transport/media/noise-cancellation/).

A known JS SDK bug caused doubled audio on iOS Safari when `webAudioMix` and `startAudio()` unmuted attached elements. The report covered versions 2.18.8 and 2.20.1. LiveKit merged the fix on 2026-07-13. Verify that the selected client release includes it. Do not describe this as an unresolved bug in every current release.

Sources: [issue 2003](https://github.com/livekit/client-sdk-js/issues/2003), [merged fix 2004](https://github.com/livekit/client-sdk-js/pull/2004), [fix commit](https://github.com/livekit/client-sdk-js/commit/7c9434a7964fe1fbdca5303dec5c134053718892).

Current iOS Safari behavior after backgrounding, locking the screen, changing audio routes, or denying then granting permission is **unconfirmed** for Maya. Test these cases on physical devices. A desktop text test cannot close them.

## 8. Agent deployment and regions

The Node agent is a long-running server process. Host it separately from the Vercel web app and token route. LiveKit Cloud builds its Dockerfile and manages dispatch, scaling, health checks, and rolling replacement. An existing instance can finish active sessions during a rolling deploy, within the documented one-hour drain period.

An externally hosted agent registers with LiveKit over an outbound WebSocket. It does not need a public inbound application port. External hosting still permits LiveKit Cloud media transport and Inference. Hosting the agent yourself is separate from hosting the LiveKit media server yourself.

Sources: [Cloud deployment](https://docs.livekit.io/deploy/agents/), [deployment management](https://docs.livekit.io/deploy/agents/managing-deployments/), [external hosting](https://docs.livekit.io/deploy/custom/deployments/).

### Cold start

Production agents on the free Build plan can scale to zero. The guide states a **10 to 20 second** wait before the agent joins after a cold start. Paid Ship and Scale production deployments stay warm. Non-production deployments scale to zero when idle on every plan. Warm hosting removes this documented scale-to-zero delay. It does not promise zero job startup or provider connection time.

Source: [cold-start behavior](https://docs.livekit.io/deploy/agents/managing-deployments/#cold-start).

### Available agent compute regions

The current official list contains:

| Region ID | Location |
| --- | --- |
| `us-east` | Ashburn, Virginia |
| `eu-central` | Frankfurt, Germany |
| `ap-south` | Mumbai, India |

Sources: [region endpoints](https://docs.livekit.io/deploy/admin/regions/endpoints/#agent-deployments), [deployment region rules](https://docs.livekit.io/deploy/admin/regions/agent-deployment/).

No western US or Canadian agent compute region appears in that list. A nearby media edge does not mean the agent runs there. The agent deployment region cannot change in place. Create another regional deployment to move it.

For Vancouver, `us-east` is the initial managed-hosting option to measure. It is not colocated with the stated Supabase `us-west` and Vercel `sfo1` services. Gateway provider requests can also go to another region unless restricted. Do not assume that the agent's region is the model's region.

Sources: [agent regions](https://docs.livekit.io/deploy/admin/regions/agent-deployment/), [Inference region restriction](https://docs.livekit.io/agents/models/inference/).

Recommendation: start the prototype on Cloud. Use a warm production deployment for a child-facing trial. Read the question and initial board state once at call start. Keep per-word drawing off the Vercel/Supabase request path. Compare managed `us-east` with a warm western-US external agent only after measuring the full chosen provider chain. A western agent will not remove eastward model calls if those providers serve requests in the east.

The exact AssemblyAI, OpenRouter upstream, and Inworld serving regions for Maya's accounts are **unconfirmed**. A Vancouver end-to-end latency benefit from external hosting is also **unconfirmed**.

## 9. Published latency measurements

There is no checked measurement for **AssemblyAI Universal-Streaming -> OpenRouter Claude Sonnet 5.5 -> Inworld TTS-2**, with a Vancouver browser and a shared whiteboard. Maya's end-to-end latency is **unconfirmed**.

LiveKit published a first-party comparison on 2026-07-02. It reports a 100-conversation hotel-agent evaluation with a large prompt and about 40 tools. It reports these values:

| LLM configuration | Reported first-token time | Reported first-speech time |
| --- | ---: | ---: |
| GPT-4.1 | 1006 ms | 1088 ms |
| GPT-5.5 | 966 ms | 1404 ms |
| Gemini 2.5 Flash | 911 ms | 1034 ms |
| Gemma 4 31B on LiveKit | 192 ms | 354 ms |
| Gemma 4 31B through OpenRouter | 1876 ms | 4120 ms |

Source: [LiveKit latency comparison](https://livekit.com/blog/latency-optimized-inference-gemma-4-on-livekit).

These are LiveKit's published figures. They are not independent measurements. The article describes first-speech time as the wait after the user stops speaking. It also discusses first-sentence generation as the underlying measure. It does not fully specify the STT, TTS, endpointing settings, browser playback measurement, regions, percentile, or confidence intervals for these figures. Therefore the exact full-cascade and client-audible measurement boundary is **unconfirmed**. The numbers do not establish a sub-second Maya target. The Gemma OpenRouter result is specific to that benchmark configuration. It is not evidence that every OpenRouter model has the same delay.

LiveKit's 2026-04-13 latency guide recommends stage metrics and model colocation. The Node observability API exposes per-message `llmNodeTtft`, `ttsNodeTtfb`, `playbackLatency`, and `e2eLatency`. These timing fields use seconds. SDK playback metrics do not automatically measure sound at the child's physical speaker.

Sources: [latency guide](https://livekit.com/blog/understand-and-improve-agent-latency), [metrics definitions](https://docs.livekit.io/testing/observability/data/#per-turn-latency).

### Required Maya measurement

Record the browser's last voiced child audio, endpoint decision, final transcript, LLM request, first token, first TTS audio, browser playback, RPC acceptance, and visible board cue. Use a loopback or external audio/video capture to check the audible boundary. Measure call startup separately from turn latency.

Report sample counts, failures, p50, p95, and the full chosen provider/model configuration. Split warm calls from cold calls. Split desktop, tablet, and phone results. Include thinking pauses and short answers such as "six" and "no". Measure barge-in stop delay and drawing-cue error separately. Adding overlapping stage medians does not produce an end-to-end measurement.

## Final recommendation

- **Agent language:** TypeScript on Node 24 with `@livekit/agents@1.9.5` as the first source pin. Use the confirmed provider plugins. Python is unnecessary for the requested pipeline.
- **Board-command channel:** Serial, acknowledged RPC batches. Add sequence numbers, idempotent batch IDs, revision checks, caller checks, and reconnect snapshots in Maya's application protocol.
- **Speech synchronization:** Request Inworld word timestamps explicitly. Stage the board plan before speech. Release commands from synchronized transcript progress for the matching utterance. Cancel unshown cues on interruption. Use short sentence boundaries if word timings fail. Exact speaker-time alignment remains unconfirmed until measured.
- **Test approach:** Pure TypeScript board and teaching tests, Node text-only sessions with `FakeLLM`, and a small real-OpenRouter text suite. Use the CLI debugger for coding-agent checks. Keep paid simulations, audio tests, and physical Safari/Expo checks as separate evidence.

### Top five risks

1. **Speech and board timing can differ.** The source supports alignment, but documentation lists conflict and browser playback adds delay. Measure cue error and test late or missing timestamps before promising word-accurate drawing.
2. **Child speech can trigger wrong turns.** Short number answers, quiet voices, pauses, and nearby speakers can defeat STT or interruption classification. Test children aged 6-12 under the intended device and noise conditions.
3. **The selected cascade can respond slowly.** No public measurement confirms this exact provider chain. Cloud compute has no listed western region, and free or non-production hosting can add a 10 to 20 second cold start.
4. **Reconnect or tool retry can corrupt the board sequence.** Reliable transport is not a persistent, exactly-once command log. Implement epochs, revisions, deduplication, cancellation, and state recovery.
5. **Text-only CI can miss delivery and device failures.** It cannot prove RPC delivery, TTS timing, microphone capture, Safari autoplay, or native audio behavior. Require separate browser and audio evidence before a child-facing release.
