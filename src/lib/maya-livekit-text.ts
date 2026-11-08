// Maya's text session inside LiveKit Agents for Node (#322): text only, with no room and no audio. LiveKit's
// AgentSession takes the child's text turns (`session.run({ userInput })`, its test mode) and the opening
// (`generateReply`); the agent's `llmNode` hands each turn to the text adapter (src/lib/maya-text.ts) and returns only
// what the adapter output, which the session's `step` accepted. LiveKit never calls a model itself here: the
// placeholder LLM below exists because AgentSession wants one, and is never asked. The voice agent (#326) keeps this
// agent and adds speech-to-text, text-to-speech and a room.
//
// Server and scripts only (LiveKit's native module). Nothing in src/app imports it.
import { ReadableStream } from "node:stream/web";
import { initializeLogger, voice, type llm } from "@livekit/agents";
import type { TextOutput, TextSession } from "@/lib/maya-text";

let logger = false;

/** A text session run through LiveKit: each call returns what reached the child and the text LiveKit carried. */
export interface LivekitTextSession {
  /** Maya's opening. */
  open(): Promise<{ output: TextOutput; carried: string | null }>;
  /** One child turn. */
  say(text: string): Promise<{ output: TextOutput; carried: string | null }>;
  close(): Promise<void>;
}

const userTexts = (ctx: llm.ChatContext) =>
  ctx.items.flatMap((i) => (i.type === "message" && i.role === "user" ? [i.textContent ?? ""] : []));

class MayaTextAgent extends voice.Agent {
  last: TextOutput | null = null;
  private seen = 0;
  constructor(private readonly text: TextSession) {
    super({ instructions: "Maya's words come from the text adapter, not from these instructions." });
  }
  override async llmNode(...[chatCtx]: Parameters<voice.Agent["llmNode"]>): ReturnType<voice.Agent["llmNode"]> {
    const users = userTexts(chatCtx);
    const fresh = users.slice(this.seen);
    this.seen = users.length;
    const output = fresh.length === 0 ? await this.text.start() : await this.text.child(fresh.join("\n"));
    this.last = output;
    const said = output.say.join(" ");
    if (!said) return null;
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue(said);
        controller.close();
      },
    });
  }
}

export async function livekitTextSession(text: TextSession): Promise<LivekitTextSession> {
  if (!logger) {
    initializeLogger({ pretty: false, level: "error" });
    logger = true;
  }
  const agent = new MayaTextAgent(text);
  // AgentSession needs an LLM; the agent's llmNode never calls it.
  const session = new voice.AgentSession({ llm: new voice.testing.FakeLLM([]) });
  let carried: string | null = null;
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    if (ev.item.type === "message" && ev.item.role === "assistant") carried = ev.item.textContent ?? null;
  });
  await session.start({ agent });
  const take = () => {
    const out = { output: agent.last ?? { say: [], board: [], ended: null, safetyMessage: null }, carried };
    agent.last = null;
    carried = null;
    return out;
  };
  return {
    async open() {
      await session.generateReply().waitForPlayout();
      return take();
    },
    async say(childText) {
      await session.run({ userInput: childText }).wait();
      return take();
    },
    close: () => session.close(),
  };
}
