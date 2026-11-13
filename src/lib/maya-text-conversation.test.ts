import { describe, expect, it } from "vitest";
import { openingLine, MODEL_OUTPUT_SCHEMA } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { checkTrace } from "@/lib/maya-trace";
import { openRouterJsonOutput } from "@/lib/ai-openrouter-schema";
import type { OperationPackage } from "@/lib/question-package";
import type { TurnBrief } from "@/lib/maya-model";

// Conversational Maya (D-341) through the text adapter's public interface: a fake version 3 model, a passed-in clock.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 12, 16, 0, 0);

function call(answer: (brief: TurnBrief, n: number) => unknown, more: Partial<Parameters<typeof createTextSession>[0]> = {}) {
  let now = T0;
  const model = conversationalFake({ answer });
  const reviewer = fakeTalkReviewer();
  const session = createTextSession({ callId: "conv-1", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer, ...more });
  return { session, model, reviewer };
}

/** Counts the union fields of a schema the way the OpenRouter safety net counts them (anyOf with more than one branch). */
function unions(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  if (Array.isArray(schema)) return schema.reduce((n, x) => n + unions(x), 0);
  const s = schema as Record<string, unknown>;
  const here = (Array.isArray(s.anyOf) && s.anyOf.length > 1) || (Array.isArray(s.type) && s.type.length > 1) ? 1 : 0;
  return here + Object.entries(s).reduce((n, [k, v]) => n + (k === "enum" || k === "const" ? 0 : unions(v)), 0);
}

describe("the output schema (#903)", () => {
  it("has at most 16 union fields and goes out as strict structured output", () => {
    expect(unions(MODEL_OUTPUT_SCHEMA)).toBeLessThanOrEqual(16);
    const wire = openRouterJsonOutput("anthropic/claude-sonnet-5.5", { name: "maya_reply", system: "x", content: [], schema: MODEL_OUTPUT_SCHEMA as unknown as Record<string, unknown> });
    expect(wire).toHaveProperty("response_format.json_schema.strict", true);
    expect(Object.keys(MODEL_OUTPUT_SCHEMA.properties)).toEqual(["say", "act", "step", "level", "reading", "draw"]);
  });
});

describe("the opening seam (D-341, agreed with the voice lead)", () => {
  it("openingLine says Savar's opening with the question in spoken words", () => {
    expect(openingLine(PKG)).toBe("Hi there! I'm Maya, an AI math helper. We're doing 52 minus 28 today. Where do you want to start?");
    expect(openingLine(SAMPLE_PACKAGES["add-27-39"] as OperationPackage)).toBe("Hi there! I'm Maya, an AI math helper. We're doing 27 plus 39 today. Where do you want to start?");
  });
  it("openingLine names the page and the question number for a workbook call", () => {
    expect(openingLine(PKG, { page: 3, number: 7 })).toBe("Hi there! I'm Maya, an AI math helper. We're doing page 3, number 7 today: 52 minus 28. Where do you want to start?");
  });
  it("a workbook session opens with the page and number, and its trace is valid", async () => {
    let now = T0;
    const pkg = { ...PKG, ref: { source: "workbook" as const, workbookId: "w1", page: 4, question: 2 } };
    const session = createTextSession({ callId: "conv-wb", package: pkg, model: conversationalFake({ answer: () => { throw new Error("no model"); } }), clock: () => (now += 500), confirmWorkbook: true });
    expect((await session.start()).say).toEqual(["Hi there! I'm Maya, an AI math helper. We're doing page 4, number 2 today: 52 minus 28. Where do you want to start?"]);
    expect(() => checkTrace(session.trace())).not.toThrow();
    expect(checkTrace(await session.finish({ reason: "child_stopped" })).ok).toBe(true);
  });
  it("start() calls no model, says the opening, stages the question on the board and waits for the child", async () => {
    const { session, model } = call(() => { throw new Error("no model at the start"); });
    const out = await session.start();
    expect(model.briefs).toHaveLength(0);
    expect(out.say).toEqual([openingLine(PKG)]);
    expect(out.board).toHaveLength(1);
    expect(out.board[0].commands[0]).toMatchObject({ op: "columns", id: "question" });
    expect(session.session.expect).toBe("child");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(() => checkTrace(trace)).not.toThrow();
    const first = trace.turns.find((t) => t.kind === "maya");
    expect(first).toMatchObject({ kind: "maya", output: { act: "open", say: [openingLine(PKG)] } });
  });
  it("start({ openingSpoken: true }) returns the board but no say; the trace keeps the line", async () => {
    const { session } = call(() => { throw new Error("no model"); });
    const out = await session.start({ openingSpoken: true });
    expect(out.say).toEqual([]);
    expect(out.board).toHaveLength(1);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.turns.find((t) => t.kind === "maya")).toMatchObject({ output: { say: [openingLine(PKG)] } });
  });
});

describe("Savar's turn: 52 - 28, 'Is 2 minus 8, 6?'", () => {
  it("briefs the model with the misconception and says its reply when the checks pass", async () => {
    const say = "2 minus 8 isn't 6; 6 is 8 minus 2. 2 is smaller than 8, so we take a ten. What is 12 minus 8?";
    const { session, model } = call((brief) => reply(brief.childTurn?.includes("Hi") ? "Hi Ava! Let's start with the ones. What do you see there?" : say, "guide", { step: "ones", level: brief.childTurn?.includes("Hi") ? 0 : 2, reading: brief.childTurn?.includes("Hi") ? {} : { answers: [{ value: { type: "number", value: 6 }, step: "ones", problem: "target", verdict: "wrong" }] } }));
    await session.start();
    expect((await session.child("Hi, Maya")).say).toEqual(["Hi Ava! Let's start with the ones. What do you see there?"]);
    const out = await session.child("Is 2 minus 8, 6?");
    expect(model.briefs[1].facts.join(" ")).toContain("6 is 8 - 2: the child took the smaller digit from the larger");
    expect(model.briefs[1].facts.join(" ")).toContain("12 - 8");
    expect(model.briefs[1].numbers.secret).toEqual(expect.arrayContaining(["4", "24"]));
    expect(out.say).toEqual([say]);
    expect(session.session.done).toEqual([]);
    expect(session.session.ladder.hint).toBe(2);
    // The question "Is 2 minus 8, 6?" commits to no answer: the model's wrong reading is left out, with no repair.
    const turn = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!;
    expect(turn.kind === "maya" && turn.attempts.map((a) => a.source)).toEqual(["model"]);
    expect(session.session.ladder.failures).toBe(0);
  });
  it("refuses a confirm of the misconception, and a false equation, then says code's line", async () => {
    const { session } = call((brief, n) => (n === 0 ? reply("Did you say 6?", "confirm") : reply("Yes, 2 minus 8 is 6.", "guide", { step: "ones", level: 1 })));
    await session.start();
    const out = await session.child("Is 2 minus 8, 6?");
    const trace = session.trace();
    const turn = trace.turns.filter((t) => t.kind === "maya").at(-1)!;
    expect(turn.kind === "maya" && turn.attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([["model", "act_not_allowed"], ["repair", "say_check"], ["fallback", null]]);
    expect(out.say.join(" ")).not.toMatch(/\b6\b.*right|yes/i);
    expect(trace.counts.sayRefusals).toEqual({ false_equation: 1 });
  });
  it("never says the answer: a reply with 24 is refused", async () => {
    const { session } = call(() => reply("The answer is 24.", "guide", { step: "ones", level: 0 }));
    await session.start();
    await session.child("I don't know.");
    expect(session.trace().counts.sayRefusals).toEqual({ reveals_answer: 2 });
    expect(session.trace().counts.fallbacks).toBe(1);
  });
});

describe("the review, the time budget and the hooks", () => {
  it("reviews a reply to a personal turn and skips plain math turns", async () => {
    const { session, reviewer } = call((brief) => reply(brief.childTurn?.includes("dog") ? "A dog sounds fun. Let's look at the ones now. What do you see?" : "Let's look at the ones. What do you see?", brief.childTurn?.includes("dog") ? "redirect" : "guide", { step: "ones", reading: brief.childTurn?.includes("dog") ? { offTopic: true } : {} }));
    await session.start();
    await session.child("Can we do the ones?");
    expect(reviewer.requests).toHaveLength(0);
    const out = await session.child("I have a dog.");
    expect(reviewer.requests).toHaveLength(1);
    expect(reviewer.requests[0].conversation).toBe(true);
    expect(out.say).toEqual(["A dog sounds fun. Let's look at the ones now. What do you see?"]);
  });
  it("a refused review is repaired, then code's line", async () => {
    let now = T0;
    const model = conversationalFake({ answer: () => reply("I have a dog too!", "redirect", { reading: { offTopic: true } }) });
    const reviewer = fakeTalkReviewer(() => ({ verdict: "fail", rules: ["untrue_self"], reason: "Maya has no dog." }));
    const session = createTextSession({ callId: "conv-2", package: PKG, model, clock: () => (now += 500), reviewer });
    await session.start();
    const out = await session.child("I have a dog.");
    expect(out.say.join(" ")).not.toContain("I have a dog too");
    expect(session.trace().counts.sayRefusals).toEqual({ review: 2 });
  });
  it("says code's line when the turn's time budget is spent", async () => {
    const { session } = call(() => new Promise(() => {}), { turnBudgetMs: 30 });
    await session.start();
    const out = await session.child("I don't know.");
    expect(out.say.length).toBe(1);
    const turn = session.trace().turns.filter((t) => t.kind === "maya").at(-1)!;
    expect(turn.kind === "maya" && turn.attempts.map((a) => a.source)).toEqual(["model", "fallback"]);
  });
  it("calls onSayPart for each checked sentence in order, then onSayEnd", async () => {
    const parts: [string, number][] = [];
    let ended = 0;
    const { session } = call(() => reply("Let's look at the ones. What is on top?", "guide", { step: "ones" }), { onSayPart: (s, i) => parts.push([s, i]), onSayEnd: () => { ended++; } });
    await session.start();
    await session.child("Help me.");
    expect(parts.slice(-2)).toEqual([["Let's look at the ones.", 0], ["What is on top?", 1]]);
    expect(ended).toBe(2);
  });
});

describe("the review prompt of a conversational reply", () => {
  it("leaves out the math rule: code checks the math", async () => {
    const { CONVERSATION_REVIEW_SYSTEM, TALK_REVIEW_SYSTEM } = await import("@/lib/maya");
    expect(TALK_REVIEW_SYSTEM).toContain("- math:");
    expect(CONVERSATION_REVIEW_SYSTEM).not.toContain("- math:");
    expect(CONVERSATION_REVIEW_SYSTEM).toContain("- secrecy:");
  });
});
