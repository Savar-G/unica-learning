import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, openingLine } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";

// Conversational Maya (D-341) end to end through the call module: an admin test call and a desk chat with a version 3
// model, on the in-memory seams. The model writes every word after code's opening; code credits and checks.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 12, 16, 0, 0);
const PKG: QuestionPackage = { ...SAMPLE_PACKAGES["subtract-52-28"], id: `${TEST}:s1-4`, ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" } };

const num = (value: number) => ({ type: "number", value });
const answer = (value: number, step: string) => ({ answers: [{ value: num(value), step, problem: "target", verdict: "right" }] });

/** A careful tutor, scripted by the child's words. */
function tutor(brief: TurnBrief) {
  const t = brief.childTurn ?? "";
  if (/hi/i.test(t)) return reply("Hi Leah! Let's start with the ones. What do you see there?", "guide", { step: "ones" });
  if (/6\?/.test(t)) return reply("2 minus 8 isn't 6; 6 is 8 minus 2. 2 is smaller than 8, so we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2 });
  if (/is 4/.test(t)) return reply("Yes, 12 minus 8 is 4. Now the tens: 5 became 4. What is 4 minus 2?", "guide", { step: "tens", reading: answer(4, "ones") });
  if (/^2\b/.test(t)) return reply("Yes, the tens make 2. So what is 52 minus 28?", "guide", { step: "result", reading: answer(2, "tens") });
  if (/24/.test(t)) return reply("Yes, 52 minus 28 is 24. Please write 24 on your paper.", "accept_answer", { reading: answer(24, "result") });
  return reply("Thanks for writing it, Leah. Bye for now!", "close", { reading: { paper: "written" } });
}

function setup() {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] });
  const model = conversationalFake({ id: "fake-v3", answer: tutor });
  const seams: CallSeams = {
    store, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild: vi.fn(async () => true),
    model: (id) => (id === null || id === "fake-v3" ? model : null),
    isTestFamily: async (parentId) => parentId === PARENT,
    canChat: async () => true,
    note: async () => "done" as const,
    reviewer: () => fakeTalkReviewer(),
    alerts: { send: async () => {}, list: async () => [] },
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  };
  return { calls: mayaCalls(seams), store, model, advance: (s: number) => (now += s * 1000) };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};
const TURNS = ["Hi, Maya", "Is 2 minus 8, 6?", "12 minus 8 is 4", "2", "24", "I wrote it."];

describe.each(["admin_test", "chat"] as const)("a conversational %s call", (kind) => {
  it("opens in code's words, says the model's checked words, credits by code and saves a valid trace", async () => {
    const s = setup();
    const pkg = kind === "chat" ? { ...PKG, ref: { source: "workbook" as const, workbookId: TEST, page: 1, question: 1 } } : PKG;
    let r = ok(await s.calls.start({ kind, parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: pkg, startedBy: kind === "chat" ? PARENT : "admin-1" }));
    expect(r.output.say).toEqual([openingLine(PKG as OperationPackage)]);
    expect(s.model.briefs).toHaveLength(0);
    const said: string[] = [];
    for (const text of TURNS) {
      if (r.view.status === "ended") break;
      s.advance(5);
      r = ok(await s.calls.input(r.view.id, r.view.revision, { type: "child", text }, "Leah"));
      said.push(r.output.say.join(" "));
    }
    expect(said[0]).toBe("Hi Leah! Let's start with the ones. What do you see there?");
    expect(said[1]).toBe("2 minus 8 isn't 6; 6 is 8 minus 2. 2 is smaller than 8, so we take a ten. What is 12 minus 8?");
    expect(r.view.status).toBe("ended");
    expect(r.view.outcome).toMatchObject({ reason: "solved" });
    const row = s.store.rows().find((x) => x.id === r.view.id)!;
    expect(checkTrace(row.trace).ok).toBe(true);
    expect(JSON.stringify(row.trace)).not.toContain("Leah");
    expect(row.trace!.counts.fallbacks).toBe(0);
  });
});
