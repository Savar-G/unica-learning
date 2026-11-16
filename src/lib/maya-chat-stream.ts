import type { Batch } from "@/lib/board";
import type { ChatReply } from "@/lib/maya-chat";

// #1107: desk chat says Maya's checked sentences as they pass, the way voice does. One child turn is still one Maya message:
// the desk grows it from `say` events, then the `final` event (the same ChatReply the JSON answer carries) replaces it.
// The route starts a stream only after the turn was admitted and its first checked sentence exists; every other answer
// (each refusal, busy, done, the cap, an error before any sentence) stays the plain JSON reply with its own status.
// No server-only import here: the desk reads the stream with the same module.

/** The content type of a chat stream: one JSON event per line. A desk asks for it with `Accept`. */
export const CHAT_STREAM_TYPE = "application/x-ndjson";
/** The most sentences one Maya message streams (far above the tutor's word ceiling). */
export const MAX_STREAM_SENTENCES = 64;
/** The longest sentence text one `say` event carries. */
export const MAX_STREAM_TEXT = 2_000;
/** The most board batches one `say` event carries (a sentence draws at most one) and the most encoded bytes of them. */
export const MAX_STREAM_BATCHES = 2;
export const MAX_STREAM_BOARD_BYTES = 20_000;

export type ChatStreamEvent =
  /** `board` (#1107): the drawing saved with this sentence, which the desk draws with it. */
  | { type: "say"; index: number; text: string; board?: Batch[] }
  | { type: "final"; reply: ChatReply }
  | { type: "error"; error: "unavailable" };

/** What one chat request gave: its reply before any sentence, its failure before any sentence, or a stream. */
export type ChatRun = { reply: ChatReply } | { failed: unknown } | { stream: ReadableStream<Uint8Array> };

/**
 * Runs one chat request whose admitted child turn may stream. `run` gets the turn's ear; it calls it only after the
 * database admitted the message. The answer waits for the first checked sentence or the end of `run`, whichever comes
 * first: with no sentence first, the caller answers JSON as before. With a sentence first, the stream carries every
 * sentence (in index order, the first ones as they were queued) and then exactly one `final` or `error` event.
 *
 * Disconnect: a reader that goes away never stops the turn. `keep` gets the turn's promise so the platform keeps the
 * function alive until the turn is saved (`after` in the route); a retry of the same message then gets "busy" or "done".
 */
export async function chatStream(run: (say: { part(sentence: string, index: number, board?: Batch[]): void }) => Promise<ChatReply>, keep: (work: Promise<unknown>) => void = () => {}): Promise<ChatRun> {
  const queued: ChatStreamEvent[] = [];
  let sink: ((event: ChatStreamEvent) => void) | null = null;
  let begin!: () => void;
  const started = new Promise<"started">((resolve) => { begin = () => resolve("started"); });
  const part = (sentence: string, index: number, board?: Batch[]) => {
    if (typeof sentence !== "string" || !Number.isSafeInteger(index) || index < 0 || index >= MAX_STREAM_SENTENCES || sentence.length > MAX_STREAM_TEXT) return;
    const drawn = board?.length && readBoard(board) ? { board: structuredClone(board) } : {};
    const event: ChatStreamEvent = { type: "say", index, text: sentence, ...drawn };
    if (sink) sink(event);
    else { queued.push(event); begin(); }
  };
  const settled: Promise<{ reply: ChatReply } | { failed: unknown }> = Promise.resolve().then(() => run({ part })).then((reply) => ({ reply }), (failed: unknown) => ({ failed }));
  const first = await Promise.race([started, settled]);
  if (first !== "started") return first;
  keep(settled);
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; }
      };
      for (const event of queued.splice(0)) send(event);
      sink = send;
      void settled.then((end) => {
        sink = null;
        if ("failed" in end) console.error("[desk chat] streamed request failed", end.failed instanceof Error ? end.failed.message : "unknown");
        send("reply" in end ? { type: "final", reply: end.reply } : { type: "error", error: "unavailable" });
        if (!open) return;
        open = false;
        try { controller.close(); } catch { /* The reader went away. */ }
      });
    },
    cancel() { open = false; sink = null; },
  });
  return { stream };
}

/** Whether a response is a chat stream (else it is the JSON reply). */
export const isChatStream = (res: Response): boolean => (res.headers.get("content-type") ?? "").split(";")[0].trim() === CHAT_STREAM_TYPE;

/** A `say` event's board, read strictly: at most MAX_STREAM_BATCHES batches, each an id and commands, within the size limit. */
function readBoard(value: unknown): Batch[] | null {
  if (!Array.isArray(value) || value.length > MAX_STREAM_BATCHES || JSON.stringify(value).length > MAX_STREAM_BOARD_BYTES) return null;
  const ok = value.every((b) => typeof b === "object" && b !== null && typeof (b as Batch).transactionId === "string" && Array.isArray((b as Batch).commands) &&
    ((b as Batch).after === undefined || (Array.isArray((b as Batch).after) && (b as Batch).after!.every((x) => typeof x === "string"))));
  return ok ? (value as Batch[]) : null;
}

/** One line of a chat stream, read strictly; null when it is not one of the three events. */
export function readChatEvent(line: string): ChatStreamEvent | null {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return null; }
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (e.type === "say") {
    const board = e.board === undefined ? undefined : readBoard(e.board);
    if (board === null) return null;
    return Number.isSafeInteger(e.index) && (e.index as number) >= 0 && (e.index as number) < MAX_STREAM_SENTENCES && typeof e.text === "string" && e.text.length <= MAX_STREAM_TEXT
      ? { type: "say", index: e.index as number, text: e.text, ...(board?.length ? { board } : {}) } : null;
  }
  if (e.type === "final") return typeof e.reply === "object" && e.reply !== null && typeof (e.reply as { usage?: unknown }).usage === "object" ? { type: "final", reply: e.reply as ChatReply } : null;
  if (e.type === "error") return { type: "error", error: "unavailable" };
  return null;
}

/**
 * Reads a chat stream to its `final` reply. `onSay` hears each sentence as it comes. Throws when the stream ends
 * without a `final`, carries an `error`, holds a line that is not an event, or is cut: partial words are never a
 * finished turn, so the desk keeps the message for its retry.
 */
export async function readChatStream(body: ReadableStream<Uint8Array>, onSay: (index: number, text: string, board: Batch[]) => void): Promise<ChatReply> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n");
    while (cut >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      cut = buffer.indexOf("\n");
      if (!line) continue;
      const event = readChatEvent(line);
      if (!event || event.type === "error") { void reader.cancel().catch(() => {}); throw Error("the chat stream failed"); }
      if (event.type === "final") { void reader.cancel().catch(() => {}); return event.reply; }
      onSay(event.index, event.text, event.board ?? []);
    }
    if (done) throw Error("the chat stream ended without its reply");
  }
}
