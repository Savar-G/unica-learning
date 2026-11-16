import { randomUUID } from "node:crypto";
import { mayaCalls, type CallSeams, type CallStore, type TextSay } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { childChatView, type ChatReply } from "@/lib/maya-chat";
import { sweepAbandonedCalls, sweepSeams } from "@/lib/maya-call-sweep";
import type { TutorBrief } from "@/lib/maya/tutor-prompt";
import { readFateReports } from "@/lib/maya-text";
import type { OperationPackage } from "@/lib/question-package";

export const PARENT = "11111111-1111-4111-8111-111111111111";
export const CHILD = "22222222-2222-4222-8222-222222222222";
export const BOOK = "44444444-4444-4444-8444-444444444444";
export const STUCK = "I don't get 2 minus 8.";
export const TRADE = "We trade 1 ten for 10 ones.";
export const FIRST = "12 minus 8 is 4.";
export const NEXT = "What do you get for 4 minus 2 in the tens?";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pkg = { ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage), ref: { source: "workbook" as const, workbookId: BOOK, page: 1, question: 1 } };
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const deferred = () => Promise.withResolvers<void>();
export type Mode = "normal" | "pending" | "confirmed";
export type Action = { type: string; id?: string; messageId?: string; revision?: number; text?: string; fates?: unknown };

/** Private adapter only. The hosted chat admission RPC is deliberately not imported or simulated as database proof. */
export function createHarness(options: { sentenceMs?: number; finalMs?: number; streamChat?: boolean } = {}) {
  let offset = 0, mode: Mode = "normal", saves = 0, held = false, proposals = 0;
  const clock = () => Date.now() + offset;
  const store = memoryCallStore({ testFamilies: [PARENT], clock });
  const spend = memorySpendStore({ clock });
  const notes: unknown[] = [];
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] });
  const events = learningEvents(eventStore);
  const release = deferred();
  const boundary = deferred();
  const modelEnd = deferred();
  const sentenceMs = options.sentenceMs ?? 1100;
  const finalMs = options.finalMs ?? 3500;
  const model = conversationalFake({
    answer: brief => {
      const text = (brief as unknown as TutorBrief).childTurn ?? "";
      if (!text) return reply("Let's look at 52 minus 28.", "open");
      if (text === STUCK) return reply(`${TRADE} ${FIRST} ${NEXT}`, "guide");
      if (text.trim() === "2") return reply("4 minus 2 is 2. What is the whole answer?", "guide");
      return reply(`Use the test sentence: ${STUCK}`, "clarify");
    },
    stream: { chunk: 9, beforeEnd: async () => {
      // The recovery modes model an old request that has not returned its final result.
      if (mode !== "normal") await modelEnd.promise;
    } },
  });
  const send = model.propose.bind(model);
  model.propose = async (input, signal, onText, onCost) => {
    proposals++;
    const reservation = randomUUID();
    await spend.reserve({ id: reservation, charge: "child", parentId: PARENT, childId: CHILD, callId: null, what: "model", micros: 100,
      week: "2026-11-16", weekMicros: 10_000_000, month: "2026-11-01", force: false });
    let chunks = Promise.resolve(), lastSentences = 0;
    const result = await send(input, signal, onText ? text => {
      const say = /"say":"([^"\\]*(?:\\.[^"\\]*)*)/.exec(text)?.[1] ?? "";
      const sentences = (say.match(/[.?](?:\s|$)/g) ?? []).length;
      const wait = sentences > lastSentences;
      lastSentences = sentences;
      chunks = chunks.then(async () => {
        onText(text);
        // Let review and checkpoint callbacks run between model chunks, as in the delivery fixture.
        await new Promise<void>(r => setImmediate(r));
        if (wait) await pause(sentenceMs);
      });
    } : undefined, onCost);
    await chunks;
    if (onText) await pause(finalMs);
    await spend.settle(reservation, 100);
    return result;
  };
  const guardedStore: CallStore = { ...store, checkpoint: async (id, revision, live) => {
    const accepted = await store.checkpoint!(id, revision, live);
    const cut = mode === "pending" ? 1 : mode === "confirmed" ? 3 : -1;
    if (++saves === cut) { held = true; boundary.resolve(); await release.promise; }
    return accepted;
  } };
  const seams: CallSeams = {
    tutorFamilies: true, streamChat: options.streamChat ?? true, store: guardedStore, history: memoryWordingHistoryStore(), events,
    model: () => model, reviewer: () => fakeTalkReviewer(() => ({ verdict: "pass" })),
    mathReviewer: () => fakeMathReviewer(() => ({ verdict: "true", reason: "fixed synthetic math" })),
    rebuild: async () => true, isTestFamily: async p => p === PARENT,
    canChat: async (p, c) => p === PARENT && c === CHILD, canCallVoice: async () => false,
    connections: memoryConnectionLog(store, clock), note: async note => { notes.push(structuredClone(note.call)); return "done"; },
    alerts: { send: async () => {}, list: async () => [] }, clock, newId: randomUUID, seed: () => 42,
  };
  const calls = mayaCalls(seams);
  const messages = new Map<string, { id: string; text: string; running: boolean; work: Promise<ChatReply> }>();
  const tasks = new Set<Promise<unknown>>();
  const usage = () => ({ used: messages.size, left: Math.max(0, 60 - messages.size), resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" });
  async function response(id?: string, error?: string): Promise<ChatReply> {
    const view = id ? await calls.view(id) : null;
    const chat = view ? childChatView(view, "Local learner") : null;
    if (chat) chat.pending = [...messages.values()].some(m => m.id === id && m.running);
    return { usage: usage(), chat, ...(error ? { error } : {}) };
  }
  async function run(action: Action, say?: TextSay): Promise<ChatReply> {
    if (!action.id || !uuid.test(action.id)) return response(undefined, "invalid");
    if (action.type === "start") {
      if (await store.get(action.id)) return response(action.id);
      const r = await calls.start({ id: action.id, kind: "chat", parentId: PARENT, childId: CHILD, childName: "Local learner", grade: 3, package: pkg, startedBy: PARENT });
      return response(action.id, r.ok ? undefined : r.error);
    }
    if (!await store.get(action.id)) return response(undefined, "not_found");
    if (action.type === "read") return response(action.id);
    if (action.type === "end") {
      if ([...messages.values()].some(m => m.id === action.id && m.running)) return response(action.id, "busy");
      const r = await calls.input(action.id, action.revision!, { type: "end" }, "Local learner");
      return response(action.id, r.ok ? undefined : r.error);
    }
    if (action.type !== "child" || !action.messageId || !uuid.test(action.messageId) || !action.text || action.text.length > 500 || !Number.isSafeInteger(action.revision)) return response(action.id, "invalid");
    const known = messages.get(action.messageId);
    if (known) {
      if (known.id !== action.id || known.text !== action.text) return response(action.id, "conflict");
      return known.running ? response(action.id) : known.work;
    }
    if ([...messages.values()].some(m => m.id === action.id && m.running)) return response(action.id, "busy");
    const fates = action.fates === undefined ? [] : readFateReports(action.fates);
    if (fates === null) return response(action.id, "invalid");
    const id = action.id;
    const entry = { id, text: action.text, running: true, work: Promise.resolve(null as unknown as ChatReply) };
    // Install ownership synchronously before any call-module await.
    messages.set(action.messageId, entry);
    entry.work = (async () => {
      try {
        const r = await calls.input(id, action.revision!, { type: "child", text: action.text!, ...(fates.length ? { fates } : {}) }, "Local learner", say);
        entry.running = false;
        return response(id, r.ok ? undefined : r.error);
      } finally { entry.running = false; }
    })();
    tasks.add(entry.work);
    void entry.work.then(() => tasks.delete(entry.work), () => tasks.delete(entry.work));
    return entry.work;
  }
  async function recover(id: string, how: "retry" | "end" | "sweep") {
    if (!held) throw Error("No held checkpoint. Arm a mode, then send the stuck sentence.");
    const record = await store.get(id);
    if (!record || !await store.update(id, record.revision, {})) throw Error("Recovery fence failed");
    // These compatible readers have sentence writing off and share only this private store.
    const readers = mayaCalls({ ...seams, streamChat: false, store });
    let result: unknown;
    try {
      if (how === "sweep") {
        offset += 20 * 60_000;
        result = await sweepAbandonedCalls({ calls: mayaCalls(sweepSeams({ ...seams, streamChat: false, store })), source: store, clock });
      } else {
        result = await readers.input(id, record.revision + 1, how === "end" ? { type: "end" } : { type: "child", text: STUCK }, "Local learner");
      }
    } finally {
      held = false; release.resolve(); modelEnd.resolve();
      await Promise.allSettled([...tasks]);
    }
    const recovered = await response(id);
    for (const message of messages.values()) if (message.id === id) message.work = Promise.resolve(recovered);
    return { result, reply: recovered, state: state() };
  }
  function state() {
    return { fake: true, memoryOnly: true, mode, held, proposals, notes: notes.length,
      records: store.rows().map(r => ({ id: r.id, revision: r.revision, status: r.status, outcome: r.outcome,
        delivery: r.live?.text.log?.filter(e => ["part_pending", "part_confirmed", "part", "stream_hold"].includes(e.kind)).map(e => ({ kind: e.kind })) ?? [] })) };
  }
  return { calls, store, run, response, recover, state, boundary: boundary.promise,
    arm(next: Mode) {
      if (store.rows().length || tasks.size) throw Error("Reset before selecting a mode");
      mode = next;
    },
    async close() { release.resolve(); modelEnd.resolve(); await Promise.allSettled([...tasks]); },
  };
}
