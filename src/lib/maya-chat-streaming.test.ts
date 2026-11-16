import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { mayaCalls, type CallRecord, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, REVIEW_FLOOR_MS, VOICE_REPAIR_BUDGET_MS } from "@/lib/maya-text";
import type { TutorBrief } from "@/lib/maya/tutor-prompt";
import type { OperationPackage } from "@/lib/question-package";

// #1107: desk chat says Maya's checked sentences as they pass, through the voice path's hooks (D-341), at the call module's
// public interface with the in-memory seams. Fake models and fake reviewers only; the model is held open with
// `beforeEnd`, so each test sees what reached the desk while the reply was still coming in.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const SUB52 = { ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage), ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } };
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "it is not true" };
const PASS: TalkReviewResult = { verdict: "pass" };
const FIRST = "12 minus 8 is 4.";
const NEXT = "What do you get for 4 minus 2 in the tens?";
const BAD = "Try again: what is 2 minus 8 in the ones?";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maya's outputs for a child's words: the first, then the repair. */
type Script = Record<string, (string | Record<string, unknown>)[]>;

function setup(script: Script, opts: { kind?: "chat" | "admin_test"; math?: (i: MathReviewInput) => MathReviewResult; talk?: (i: TalkReviewInput) => TalkReviewResult } = {}) {
  let now = Date.UTC(2026, 10, 15, 16);
  let n = 0;
  let release: () => void = () => {};
  let hold = false;
  const calls = new Map<string, number>();
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const model = conversationalFake({
    answer: (brief) => {
      const child = (brief as unknown as TutorBrief).childTurn ?? "";
      const k = calls.get(child) ?? 0;
      calls.set(child, k + 1);
      const out = script[child]?.[k] ?? script[child]?.at(-1) ?? NEXT;
      return typeof out === "string" ? reply(out, "guide") : out;
    },
    stream: { chunk: 9, beforeEnd: () => (hold ? new Promise<void>((r) => { release = r; }) : Promise.resolve()) },
  });
  const notes: CallRecord[] = [];
  const seams: CallSeams = {
    tutorFamilies: true, store, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] })),
    rebuild: vi.fn(async () => true), model: () => model,
    reviewer: () => fakeTalkReviewer((i) => (opts.talk ?? (() => PASS))(i)), mathReviewer: () => fakeMathReviewer((i) => (opts.math ?? (() => TRUE))(i)),
    isTestFamily: async (p) => p === PARENT, canChat: async () => true, canCallVoice: async () => true,
    connections: memoryConnectionLog(store, () => now), note: async ({ call }) => { notes.push(structuredClone(call)); return "done" as const; },
    alerts: { send: async () => {}, list: async () => [] },
    clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
  };
  const api = mayaCalls(seams);
  const begin = async () => ok(await api.start({ kind: opts.kind ?? "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: SUB52, startedBy: PARENT })).view;
  /** One child turn with the desk's ear; the model stays open until `release`. */
  const turn = (view: { id: string; revision: number }, text: string) => {
    hold = true;
    now += 5000;
    const parts: string[] = [];
    let done = false;
    const result = api.input(view.id, view.revision, { type: "child", text }, "Leah", { part: (sentence, index) => { parts[index] = sentence; } })
      .then((r) => { done = true; return r; });
    return { parts, result, done: () => done, release: () => { hold = false; release(); } };
  };
  return { api, store, model, notes, begin, turn, briefs: () => model.briefs as unknown as TutorBrief[], advance: (ms: number) => { now += ms; } };
}

function ok(r: CallResult): Extract<CallResult, { ok: true }> {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
}
const lastMaya = (view: { transcript: { speaker: string; text: string }[] }) => view.transcript.filter((t) => t.speaker === "maya").at(-1)!.text;
const count = (text: string, part: string) => text.split(part).length - 1;

describe("#1107: a chat child turn streams its checked sentences", () => {
  it("an early accepted sentence reaches the desk before the model resolves; the saved message and the parent note hold the same words", async () => {
    // Falsifier: with no hooks for chat (the JSON-only path), nothing reaches the desk while the model is held.
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] });
    const view = await s.begin();
    const t = s.turn(view, "Is it 36?");
    await vi.waitFor(() => expect(t.parts[0]).toBe(FIRST), { timeout: 2000, interval: 5 });
    expect(t.done()).toBe(false);
    t.release();
    const r = ok(await t.result);
    // One Maya message, each sentence once, in order: the stream and the saved transcript agree.
    expect(t.parts.join(" ")).toBe(`${FIRST} ${NEXT}`);
    expect(lastMaya(r.view)).toBe(`${FIRST} ${NEXT}`);
    expect(r.output.say.join(" ")).toBe(`${FIRST} ${NEXT}`);
    const ended = ok(await s.api.input(r.view.id, r.view.revision, { type: "end" }, "Leah"));
    expect(ended.view.status).toBe("ended");
    // The parent note reads the stored trace: its Maya turn holds exactly the streamed sentences.
    const noted = s.notes.at(-1)!;
    const said = noted.trace!.turns.flatMap((x) => (x.kind === "maya" && x.output ? [x.output.say.join(" ")] : []));
    expect(said).toContain(`${FIRST} ${NEXT}`);
    expect(count(said.join(" "), FIRST)).toBe(1);
  });

  it("a refused later sentence never streams; the repair continues the fixed sentence once; the final message has each sentence once", async () => {
    // Falsifier: the refused sentence on the desk, or the fixed sentence twice in the message.
    const s = setup({ "Is it 36?": [`${FIRST} ${BAD}`, NEXT] }, { math: (i) => (i.sentence === BAD ? FALSE : TRUE) });
    const view = await s.begin();
    const t = s.turn(view, "Is it 36?");
    await vi.waitFor(() => expect(t.parts[0]).toBe(FIRST), { timeout: 2000, interval: 5 });
    t.release();
    const r = ok(await t.result);
    expect(t.parts.join(" ")).not.toContain(BAD);
    expect(t.parts).toEqual([FIRST, NEXT]);
    expect(lastMaya(r.view)).toBe(`${FIRST} ${NEXT}`);
    expect(count(lastMaya(r.view), FIRST)).toBe(1);
    expect(s.briefs().at(-1)!.repair!.alreadySaid).toEqual([FIRST]);
  });

  it("a sentence held for its review that fails never reaches the desk", async () => {
    // Falsifier: the held sentence reaches the desk before or without its review.
    const HELD = "You are so smart and I like you a lot.";
    const s = setup({ "Is it 36?": [`${FIRST} ${HELD} ${NEXT}`, NEXT] }, { talk: (i) => (JSON.stringify(i).includes("I like you") ? { verdict: "fail", rules: ["untrue_self"], reason: "a feeling Maya does not have" } as TalkReviewResult : PASS) });
    const view = await s.begin();
    const t = s.turn(view, "Is it 36?");
    t.release();
    const r = ok(await t.result);
    expect(t.parts.join(" ")).not.toContain("I like you");
    expect(lastMaya(r.view)).not.toContain("I like you");
    expect(t.parts.join(" ")).toBe(lastMaya(r.view));
  });

  it.each([
    ["Are you a real person?", { gate: "identity", reading: { aboutMaya: "identity" } }],
    ["Someone at home hurts me.", { gate: "safety", reading: { safety: "concern" } }],
  ] as const)("%s: nothing streams while the model writes; code's own words come with the whole turn", async (child, extra) => {
    // Falsifier: the model's teaching sentence on the desk before code's disclosure or guidance.
    const s = setup({ [child]: [reply(`${FIRST} ${NEXT}`, "guide", extra as never)] });
    const view = await s.begin();
    const t = s.turn(view, child);
    await sleep(150);
    expect(t.parts).toEqual([]);
    t.release();
    const r = ok(await t.result);
    expect(t.parts.join(" ")).not.toContain(FIRST);
    expect(t.parts.join(" ")).toBe(r.output.say.join(" "));
  });

  it("a call that is not a chat ignores the ear (admin text calls never stream)", async () => {
    // Falsifier: an admin text call takes the hooks, and with them a stream.
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] }, { kind: "admin_test" });
    const view = await s.begin();
    const t = s.turn(view, "Is it 36?");
    await sleep(150);
    expect(t.parts).toEqual([]);
    t.release();
    ok(await t.result);
    expect(t.parts).toEqual([]);
  });
});

describe("#1107: a streaming chat keeps chat's own timing; voice keeps voice's", () => {
  /** A tutor session as chat (channel "chat") or voice, both streaming, with a repair that takes `repairMs`. */
  function timed(voice: boolean, repairMs: number) {
    const heard: string[] = [];
    let k = 0;
    const model = conversationalFake({
      answer: async () => {
        if (k++ === 0) return reply(`${FIRST} ${BAD}`, "guide");
        await sleep(repairMs);
        return reply(NEXT, "guide");
      },
      stream: { chunk: 9 },
    });
    const s = createTextSession({
      callId: "timing", package: SUB52, model, clock: () => Date.now(), random: 3, tutor: true, reviewTimeLimitMs: 10_000,
      reviewer: fakeTalkReviewer(() => PASS), mathReviewer: fakeMathReviewer((i) => (i.sentence === BAD ? FALSE : TRUE)),
      onSayPart: (text) => heard.push(text), ...(voice ? { modelRepair: false } : { channel: "chat" as const }),
    });
    return { s, heard };
  }

  it("a chat repair past the voice budget still teaches (chat's repair budget), while voice ends in code's line", async () => {
    // Falsifier: chat that streams takes the voice repair budget (the old `onSayPart` test): its repair runs out.
    const repairMs = VOICE_REPAIR_BUDGET_MS - REVIEW_FLOOR_MS + 400;
    const chat = timed(false, repairMs);
    await chat.s.start();
    chat.heard.length = 0;
    const said = (await chat.s.child("Is it 36?")).say.join(" ");
    expect(said).toBe(`${FIRST} ${NEXT}`);
    expect(chat.heard).toEqual([FIRST, NEXT]);
    const voice = timed(true, repairMs);
    await voice.s.start();
    const spoken = (await voice.s.child("Is it 36?")).say.join(" ");
    expect(spoken.startsWith(FIRST)).toBe(true);
    expect(spoken).not.toContain(NEXT);
  }, 20_000);
});
