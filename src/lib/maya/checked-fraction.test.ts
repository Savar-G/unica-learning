import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyBatch, boardTargets, createScene, type Batch, type Scene } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { codeSentences, noteFacts } from "@/lib/maya-call-note";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { checkTrace } from "@/lib/maya-trace";
import { workedSteps, type AnswerValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { FRACTION_OFFER as FRACTION_OFFER_TEXT, supportsCheckedFraction } from "./checked-fraction";

vi.mock("server-only", () => ({}));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const clock = () => Date.UTC(2026, 10, 20, 18);
const frac = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });

function fractionPackage(op: "add" | "subtract", a: [number, number], b: [number, number], answer: AnswerValue, text?: string): QuestionPackage {
  const operation = { kind: op === "add" ? "fraction-add" : "fraction-subtract", operands: [frac(...a), frac(...b)] } as Operation;
  return {
    id: `fraction-${op}-${a.join("-")}-${b.join("-")}`,
    ref: { source: "workbook", workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 },
    templateId: null,
    text: text ?? `${a.join("/")} ${op === "add" ? "+" : "-"} ${b.join("/")} = ?`,
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "8.5", skills: ["8.5-add-subtract-unlike"] },
    level: 26,
    difficulty: 2,
    // Tops and bottoms combined (F2): a checked package needs one known wrong answer.
    wrongAnswers: [{ value: frac(op === "add" ? a[0] + b[0] : a[0] - b[0] || 1, op === "add" ? a[1] + b[1] : Math.abs(a[1] - b[1]) || 12), cause: "F2", description: "Combines the denominators", step: null }],
    easierExample: op === "add"
      ? { text: "1/3 + 1/3 = ?", operation: { kind: "fraction-add", operands: [frac(1, 3), frac(1, 3)] }, answer: frac(2, 3), steps: workedSteps({ kind: "fraction-add", operands: [frac(1, 3), frac(1, 3)] }) }
      : { text: "2/3 - 1/3 = ?", operation: { kind: "fraction-subtract", operands: [frac(2, 3), frac(1, 3)] }, answer: frac(1, 3), steps: workedSteps({ kind: "fraction-subtract", operands: [frac(2, 3), frac(1, 3)] }) },
  };
}

const D = fractionPackage("add", [3, 4], [1, 8], frac(7, 8));

function setup(overrides: Partial<CallSeams> = {}) {
  let id = 0;
  const store = memoryCallStore({ clock, testFamilies: [parentId] });
  const answer = vi.fn(() => reply("Let's look at the parts.", "guide"));
  const seams: CallSeams = {
    checkedExchange: true, tutorFamilies: true,
    store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    rebuild: async () => true, model: () => conversationalFake({ answer }),
    reviewer: () => fakeTalkReviewer(), isTestFamily: async () => true, canChat: async () => true, canCallVoice: async () => true,
    alerts: { send: async () => {}, list: async () => [] }, clock, seed: () => 42,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    ...overrides,
  };
  return { calls: mayaCalls(seams), answer, store, events: seams.events };
}

const input = (pkg: QuestionPackage): StartInput => ({ kind: "chat", parentId, childId, childName: null, startedBy: parentId, package: pkg });

function ok(result: CallResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function draw(batches: readonly Batch[], scene: Scene = createScene()): Scene {
  for (const batch of batches) {
    const result = applyBatch(scene, batch);
    if (!result.ok) throw new Error(result.refusal.reason);
    scene = result.scene;
  }
  return scene;
}

const values = (scene: Scene) => boardTargets(scene).filter((t) => t.target.part === "whole").map((t) => t.value);

async function chat(pkg: QuestionPackage = D, overrides: Partial<CallSeams> = {}) {
  const s = setup(overrides);
  let view = ok(await s.calls.start(input(pkg))).view;
  const say = async (text: string, extra: Record<string, unknown> = {}) => {
    const fates = view.batches.map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
    const result = ok(await s.calls.input(view.id, view.revision, { type: "child", text, fates, ...extra } as never, null));
    view = result.view;
    return result;
  };
  const split = async () => {
    const target = view.exchange!;
    const fates = view.batches.map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
    const result = ok(await s.calls.input(view.id, view.revision, { type: "exchange", target, fates }, null));
    view = result.view;
    return result;
  };
  const end = async () => { view = ok(await s.calls.input(view.id, view.revision, { type: "end" }, null)).view; };
  return { ...s, say, split, end, view: () => view };
}

it("supports only same and related denominators with a proper result, and keeps other fraction questions on the existing route", async () => {
  expect(supportsCheckedFraction(D)).toBe(true);
  expect(supportsCheckedFraction(fractionPackage("add", [2, 5], [1, 5], frac(3, 5)))).toBe(true);
  expect(supportsCheckedFraction(fractionPackage("subtract", [5, 6], [1, 3], frac(1, 2)))).toBe(true);
  expect(supportsCheckedFraction(fractionPackage("add", [1, 3], [1, 4], frac(7, 12)))).toBe(false);
  expect(supportsCheckedFraction(fractionPackage("add", [3, 4], [3, 8], frac(9, 8)))).toBe(false);
  const { say, answer, view } = await chat(fractionPackage("add", [1, 3], [1, 4], frac(7, 12)));
  await say("I don't know how to start.");
  expect(answer).toHaveBeenCalled();
  expect(view().exchange).toBeUndefined();
});

it("links the whole, denominator and numerator to strips, lets the child split the parts, and never shows the result", async () => {
  const { say, split, answer, store, end } = await chat();
  const shown = await say("I don't know how to start.");
  const words = shown.output.say.join(" ");
  expect(words).toContain("Each strip is one whole.");
  expect(words).toContain("In 3/4, the bottom number 4 says the whole has 4 equal parts, and the top number 3 says 3 of them are shaded.");
  expect(words).toContain("Fourths and eighths are different sizes. Split each fourth into 2 equal parts to make eighths.");
  expect(shown.view.exchange).toMatchObject({ objectId: "fraction-split", parts: 8 });
  const strips = draw(shown.view.batches);
  expect(values(strips)).toEqual(expect.arrayContaining(["3/4", "1/8"]));
  const result = await split();
  expect(result.output.say.join(" ")).toBe("Now 3/4 is 6 eighths. The amount did not change: 3/4 = 6/8. How many eighths are there altogether?");
  const after = draw(result.view.batches);
  expect(values(after)).toEqual(expect.arrayContaining(["6/8", "1/8"]));
  expect(values(after)).not.toContain("7/8");
  expect(JSON.stringify(result.view.batches)).not.toMatch(/"7"/);
  const named = await say("7.");
  expect(named.output.say.join(" ")).toBe("Yes, that many eighths. Write it as a fraction. What is the whole answer?");
  const done = await say("Seven eighths.");
  expect(done.output.say.join(" ")).toContain("You found the answer.");
  expect(answer).not.toHaveBeenCalled();
  await end();
  const trace = checkTrace(store.rows()[0].trace);
  expect(trace.ok ? "" : JSON.stringify(trace)).toBe("");
});

it("names the add-across mistake and shows the strips, and checks a wrong answer with a diagnosis question first", async () => {
  const across = await chat();
  const mistake = await across.say("4/12.");
  expect(mistake.output.say.join(" ")).toMatch(/^The bottom number names the size of the parts\. Adding does not change the size of the parts/);
  expect(mistake.view.exchange).toMatchObject({ objectId: "fraction-split" });
  const other = await chat();
  const check = await other.say("5/8.");
  expect(check.output.say.join(" ")).toBe("How many eighths make one whole?");
  const next = await other.say("8.");
  expect(next.output.say.join(" ")).toBe("How many eighths are the same as 3/4?");
  const count = await other.say("6.");
  expect(count.output.say.join(" ")).toBe("How many eighths are there altogether?");
  expect(other.answer).not.toHaveBeenCalled();
});

it("does not let a right final fraction hide false working (#959)", async () => {
  const wrong = await chat();
  const refused = await wrong.say("I got 7/8 because one and one eighth minus one eighth is seven eighths.");
  expect(refused.output.say.join(" ")).not.toContain("You found the answer.");
  const right = await chat();
  const accepted = await right.say("I got 7/8 because six eighths plus one eighth is seven eighths.");
  expect(accepted.output.say.join(" ")).toContain("You found the answer.");
});

it("asks for the simplest form when the question requires it, without saying the answer", async () => {
  const pkg = fractionPackage("add", [1, 8], [1, 8], frac(1, 4), "1/8 + 1/8 = ? Write your answer in simplest form.");
  const { say } = await chat(pkg);
  const equal = await say("2/8.");
  expect(equal.output.say.join(" ")).toBe("That is equal to the answer. The question asks for the simplest form. Can you write it with smaller numbers?");
  const done = await say("1/4.");
  expect(done.output.say.join(" ")).toContain("You found the answer.");
});

it("offers an independent related question that keeps its own record apart from the original question", async () => {
  const { say, split, events, view } = await chat();
  await say("I don't know how to start.");
  await split();
  const offer = await say("Seven eighths.");
  expect(offer.output.say.join(" ")).toBe("You found the answer. Do you want to try one more like this on your own?");
  const start = await say("Yes.");
  expect(start.output.say.join(" ")).toBe("Here is one more: 1/2 plus 1/4. Try it on your own. What is the answer?");
  expect(values(draw(start.view.batches.slice(-1)))).toEqual(["1/2", "1/4"]);
  const retry = await say("2/6.");
  expect(retry.output.say.join(" ")).toBe("Make the parts the same size first. Then count the parts. What is 1/2 plus 1/4?");
  const closed = await say("Three fourths.");
  expect(closed.output.say.join(" ")).toBe("You found the answer. Great work today. Bye for now!");
  expect(view().outcome).toMatchObject({ reason: "solved", assistance: "guided", transfer: { result: "right", assistance: "hinted" } });
  const logged = (await events.read(childId, { from: new Date(clock() - 1).toISOString(), to: new Date(clock() + 1).toISOString() }))
    .sort((a, b) => a.key.localeCompare(b.key));
  expect(logged).toMatchObject([
    { result: "right_with_help", question: { source: "workbook" } },
    { result: "right_with_help", assistance: "hinted", question: { source: "transfer", text: "1/2 + 1/4 = ?" } },
  ]);
});

it("closes when the child declines the related question", async () => {
  const { say, view } = await chat(fractionPackage("add", [5, 12], [2, 12], frac(7, 12)));
  const offer = await say("Seven twelfths.");
  expect(offer.output.say.join(" ")).toContain("Do you want to try one more like this on your own?");
  const bye = await say("No thanks.");
  expect(bye.output.say.join(" ")).toBe("Okay. Great work today. Bye for now!");
  expect(view().outcome).toMatchObject({ reason: "solved", assistance: "independent" });
  expect(view().outcome?.transfer).toBeUndefined();
});

it("describes a demonstrated related question with the fraction strips in the parent note", () => {
  const facts = noteFacts({
    outcome: { reason: "solved", assistance: "independent", paperStatus: "unknown", understanding: "uncertain", seconds: 120, safetyFlag: false, transfer: { result: "right", assistance: "demonstrated" } } as never,
    event: null, package: D, question: D.ref,
  });
  expect(codeSentences(facts).join(" | ")).toContain("Then Maya showed the fraction strips again, and {child} got a related question right.");
});

async function voice(pkg: QuestionPackage = D) {
  const s = setup();
  const started = ok(await s.calls.startVoice({ ...input(pkg), kind: "family" }));
  const opened = await s.calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw new Error(opened.error);
  await opened.call.start();
  return { ...s, call: opened.call, id: started.view.id };
}

it("teaches subtraction with the same words in chat and voice, and Maya splits the parts when the child stays stuck", async () => {
  const pkg = fractionPackage("subtract", [5, 6], [1, 3], frac(1, 2));
  const typed = await chat(pkg);
  const spoken = await voice(pkg);
  const [a, b] = [await typed.say("Can you show me how to do this?"), await spoken.call.child("Can you show me how to do this?")];
  expect(a.output.say).toEqual(b.say);
  expect(a.output.say.join(" ")).toContain("Thirds and sixths are different sizes. Split each third into 2 equal parts to make sixths.");
  const demo = await typed.say("I don't know.");
  expect(demo.output.say.join(" ")).toBe("Watch. I split each third into 2 equal parts. Now 1/3 is 2 sixths. The amount did not change: 1/3 = 2/6. Take away 2 sixths. How many sixths are left?");
  expect(demo.view.exchange).toBeUndefined();
  expect(values(draw(demo.view.batches))).toEqual(expect.arrayContaining(["5/6", "2/6"]));
  const done = await typed.say("3/6.");
  expect(done.output.say.join(" ")).toContain("You found the answer.");
  expect(typed.view().outcome ?? null).toBeNull();
  await typed.end();
  expect(typed.view().outcome?.assistance).toBe("guided");
  expect(typed.answer).not.toHaveBeenCalled();
});

it("applies one split for duplicate submits and refuses a stale target", async () => {
  const s = setup();
  const start = ok(await s.calls.start(input(D))).view;
  const prompt = ok(await s.calls.input(start.id, start.revision, { type: "child", text: "Help me." }, null));
  const target = prompt.view.exchange!;
  const fates = prompt.view.batches.map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
  expect((await s.calls.input(start.id, prompt.view.revision, { type: "exchange", target: { ...target, parts: 4 }, fates }, null)).ok).toBe(false);
  const action = { type: "exchange" as const, target, fates };
  const both = await Promise.all([s.calls.input(start.id, prompt.view.revision, action, null), s.calls.input(start.id, prompt.view.revision, action, null)]);
  expect(both.filter((r) => r.ok && r.output.newBatches === 1)).toHaveLength(1);
  const again = ok(await s.calls.input(start.id, prompt.view.revision, action, null));
  expect(again.output.newBatches).toBe(0);
  expect(again.view.batches.filter((b) => b.commands.some((c) => c.op === "remove"))).toHaveLength(1);
});

it("keeps help nobody confirmed above a confirmed hint on the related question in voice", async () => {
  const { call } = await voice(fractionPackage("add", [5, 12], [2, 12], frac(7, 12)));
  expect((await call.child("Seven twelfths.")).say.join(" ")).toContain(FRACTION_OFFER_TEXT);
  await call.child("Yes.");
  const retry = await call.child("3/10.");
  await call.exchangePlayback!(retry.exchangeTurnId!, "finished");
  const shown = await call.child("I don't know.");
  await call.exchangePlayback!(shown.exchangeTurnId!, "interrupted");
  const done = await call.child("Three fifths.");
  expect(done.say.join(" ")).toContain("You found the answer.");
  expect(call.session.outcome?.transfer).toEqual({ result: "right", assistance: "uncertain" });
});

it("waits in voice for the board to confirm the strips before Maya splits them", async () => {
  const { call, answer } = await voice();
  const shown = await call.child("I don't know how to start.");
  const strips = shown.boardCues![0].batch;
  const reached = Promise.withResolvers<void>();
  const observed = Promise.withResolvers<void>();
  const stuck = call.child("I still don't know.", undefined, { checkedBoardSettled: () => { reached.resolve(); return observed.promise; } });
  try {
    await reached.promise;
    await call.observeBoard({ events: [{ kind: "batch", batchId: strips.transactionId, commands: [...strips.commands] }] });
  } finally { observed.resolve(); }
  const demo = await stuck;
  expect(demo.say.join(" ")).toMatch(/^Watch\. I split each fourth into 2 equal parts\. Now 3\/4 is 6 eighths\./);
  expect(demo.boardCues!.map((cue) => cue.batch.after)).toEqual([[strips.transactionId]]);
  expect(answer).not.toHaveBeenCalled();
});
