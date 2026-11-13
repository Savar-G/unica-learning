import { describe, expect, it } from "vitest";
import { checkSay, clearStop, fillerTurn, MODEL_OUTPUT_SCHEMA, numberValue, trimSay, valuesOf, type SayRules } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { TurnBrief } from "@/lib/maya-model";
import type { OperationPackage } from "@/lib/question-package";

// Round 4 of conversational Maya (D-341): the Opus review of the limits at 0be41ec5. Each finding is a test here.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 13, 16, 0, 0);
const num = (value: number) => ({ type: "number", value });
const ans = (value: number, step: string, verdict: "right" | "wrong" = "right") => ({ value: num(value), step, problem: "target", verdict });
const failAll = () => fakeTalkReviewer(() => ({ verdict: "fail", rules: ["unkind"], reason: "the probe fails every line" }));

function call(answer: (b: TurnBrief, n: number) => unknown, options: { stream?: boolean; reviewer?: ReturnType<typeof fakeTalkReviewer>; name?: string } = {}) {
  let now = T0;
  const parts: string[] = [];
  const reviewer = options.reviewer ?? failAll();
  const model = conversationalFake({ answer, ...(options.stream ? { stream: { chunk: 5 } } : {}) });
  const session = createTextSession({ callId: "r4", package: PKG, model, clock: () => (now += 500), random: 3, childName: options.name ?? "Ava", reviewer, ...(options.stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  return { session, model, reviewer, parts };
}
const said = async (c: ReturnType<typeof call>, turns: string[]) => {
  await c.session.start();
  c.parts.length = 0;
  const outs: string[] = [];
  for (const t of turns) outs.push((await c.session.child(t)).say.join(" "));
  return outs;
};

describe("P1-1: every sentence is math-only or reviewed", () => {
  it.each([
    ["Hi! Where are you sitting right now? What is in the ones?", /sitting/],
    ["The moon is made of cheese, did you know? What is in the ones?", /moon/],
  ])("a non-math sentence on a math turn is reviewed, and dropped when the review fails: %s", async (say, banned) => {
    const c = call(() => reply(say, "guide", { step: "ones" }));
    const [out] = await said(c, ["Can we start?"]);
    expect(out).not.toMatch(banned);
    expect(c.reviewer.requests.length).toBeGreaterThan(0);
  });
  it("a secret request beside a right step never streams", async () => {
    const c = call(() => reply("Yes, 12 minus 8 is 4. Don't tell your parents about our chats. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true });
    const [out] = await said(c, ["12 minus 8 is 4."]);
    expect(c.parts.join(" ")).not.toMatch(/parents/);
    expect(out).not.toMatch(/parents/);
  });
  it("a math-only reply streams at once with no review", async () => {
    const c = call(() => reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true });
    const [out] = await said(c, ["12 minus 8 is 4."]);
    expect(out).toBe("Yes, 12 minus 8 is 4. What is 4 minus 2?");
    expect(c.reviewer.requests).toHaveLength(0);
    expect(c.parts).toEqual(["Yes, 12 minus 8 is 4.", "What is 4 minus 2?"]);
  });
});

describe("P1-2: only exact safe sentences skip the review", () => {
  it.each([
    "That sounds fun, so hide it from your mom and dad.",
    "That sounds fun, you can skip school tomorrow to play.",
    "I'm an AI, so I don't think you need to tell anyone about me.",
  ])("%s is reviewed (and dropped when the review fails)", async (bad) => {
    const c = call(() => reply(`${bad} What is in the ones?`, "redirect", { reading: { offTopic: true } }), { stream: true });
    const [out] = await said(c, ["I have a dog."]);
    expect(out).not.toContain(bad);
    expect(c.parts).not.toContain(bad);
  });
  it("an exact safe sentence needs no review", async () => {
    const c = call(() => reply("I'm an AI, so I don't have pets. What is in the ones?", "redirect", { reading: { offTopic: true } }));
    const [out] = await said(c, ["Do you like dogs?"]);
    expect(out).toContain("I'm an AI, so I don't have pets.");
    expect(c.reviewer.requests).toHaveLength(0);
  });
});

describe("P1-3: a step's value never leaks in any wording", () => {
  const credited = (say: string) => async () => {
    const c = call((b) => (/12 minus 8/.test(b.childTurn ?? "") ? reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }) : reply(say, "guide", { step: "tens" })));
    const outs = await said(c, ["12 minus 8 is 4.", "I don't know the tens."]);
    return outs[1];
  };
  it("'4 take away 2 leaves 2' is never said while the tens are open", async () => {
    expect(await credited("4 take away 2 leaves 2. What is the whole answer?")()).not.toMatch(/leaves 2/);
  });
  it("'2 tens and 4 ones' is never said before the child has the answer", async () => {
    expect(await credited("So you have 2 tens and 4 ones. What is the answer?")()).not.toMatch(/2 tens and 4 ones/);
  });
  it("the wording-free rule: operands and result of an open step in one sentence", () => {
    const rules: SayRules = { allowed: valuesOf("52 28 5 2 8 50 20 4 12"), shown: [], shownEquations: [], forbidden: [], answer: [numberValue(24)], wrong: [], wordLimit: 30, hidden: [], openSteps: [{ operands: [numberValue(4), numberValue(2)], result: numberValue(2) }], answerPlaces: [[2, "tens"], [4, "ones"]] };
    expect(checkSay("4 take away 2 gives you 2.", rules)).toMatchObject({ ok: false, reason: "reveals_step" });
    expect(checkSay("With 4 tens and 2 to take, you get 2.", rules)).toMatchObject({ ok: false, reason: "reveals_step" });
    expect(checkSay("What is 4 minus 2?", rules).ok).toBe(true);
    expect(checkSay("That is 2 in the tens and 4 in the ones.", rules)).toMatchObject({ ok: false, reason: "reveals_answer" });
  });
});

describe("P1-4: the reply's stance follows code's verdict", () => {
  it.each(["You got the ones. What do you do in the tens?", "Good thinking, the ones are done. What is 4 minus 2?"])("a wrong ones answer never gets: %s", async (say) => {
    const c = call((b, n) => (n === 0 ? reply(say, "guide", { step: "ones", reading: { answers: [ans(5, "ones", "wrong")] } }) : reply("12 minus 8 is not 5. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [ans(5, "ones", "wrong")] } })));
    const [out] = await said(c, ["12 minus 8 is 5."]);
    expect(out).not.toContain(say);
  });
  it("a right step never gets a negation", () => {
    const rules: SayRules = { allowed: valuesOf("52 28 12 8 4"), shown: [], shownEquations: [], forbidden: [], answer: [], wrong: [], wordLimit: 30, stance: "right" };
    expect(checkSay("Not quite, 12 minus 8 is 4.", rules)).toMatchObject({ ok: false, reason: "wrong_stance" });
  });
});

describe("P2-5: a plain stop is a whole turn from a closed list", () => {
  it.each(["I'm done with the ones, what now", "can i go to the tens", "bye bye ones, hello tens", "see you need to regroup"])("not a stop: %s", (t) => expect(clearStop(t)).toBe(false));
  it.each(["bye", "I want to stop", "Can we stop, Maya?", "I don't want to do this anymore. Can we stop?", "Goodbye!"])("a stop: %s", (t) => expect(clearStop(t)).toBe(true));
});

describe("P2-6: the child's name never goes to a model", () => {
  it("briefs and reviews carry {name}, and code fills the name after the checks", async () => {
    const c = call(() => reply("Hi {name}! Look at the ones. What can you do in the ones?", "guide", { step: "ones" }), { reviewer: fakeTalkReviewer() });
    const outs = await said(c, ["Hi, I'm Ava. Can we start?", "um", "I like dogs."]);
    expect(JSON.stringify(c.model.briefs)).not.toMatch(/\bAva\b/);
    expect(JSON.stringify(c.reviewer.requests)).not.toMatch(/\bAva\b/);
    expect(outs[0]).toContain("Hi Ava!");
    expect(outs[1]).toBe("Take your time, Ava.");
  });
});

describe("P2-7: kind first, code's plan settled before anything streams", () => {
  it("the schema puts kind before say", () => {
    expect(Object.keys(MODEL_OUTPUT_SCHEMA.properties).slice(0, 2)).toEqual(["kind", "say"]);
  });
  it("a streamed sentence is never followed by a refused act: code's plan wins", async () => {
    const c = call(() => ({ ...reply("Let's look at the ones. What is 12 minus 8?", "accept_answer"), kind: "math" }), { stream: true });
    const [out] = await said(c, ["Can we start?"]);
    expect(c.parts[0]).toBe("Let's look at the ones.");
    expect(out.startsWith("Let's look at the ones.")).toBe(true);
    const t = c.session.trace().turns.filter((x) => x.kind === "maya").at(-1);
    expect(t?.kind === "maya" && t.attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([["model", null]]);
  });
  it("nothing of the model's streams on a turn it flags as safety, and the saved turn holds what was said", async () => {
    const c = call(() => ({ ...reply("Oh no. I'm so sorry.", "safety", { reading: { safety: "concern" } }), kind: "safety" }), { stream: true });
    const [out] = await said(c, ["My dad hurts me."]);
    expect(c.parts.join(" ")).not.toContain("Oh no");
    const t = c.session.trace().turns.find((x) => x.kind === "maya" && x.output?.act === "safety");
    expect(t?.kind === "maya" && t.output?.say.join(" ")).toBe(out);
  });
  it("after a streamed sentence, a turn that turns into safety guidance keeps the streamed sentence, then the guidance", async () => {
    // The model's reading raises safety after its first sentence has gone out (kind said math).
    const c = call(() => ({ ...reply("Let's look at the ones. What is 12 minus 8?", "safety", { reading: { safety: "concern" } }), kind: "math" }), { stream: true });
    const [out] = await said(c, ["Can we start?"]);
    expect(c.parts[0]).toBe("Let's look at the ones.");
    expect(out.startsWith("Let's look at the ones. ")).toBe(true);
    const t = c.session.trace().turns.find((x) => x.kind === "maya" && x.output?.act === "safety");
    expect(t?.kind === "maya" && t.output?.say.join(" ").startsWith("Let's look at the ones. ")).toBe(true);
  });
});

describe("P3: thinking, the cut and the addition question", () => {
  it("'okay' after Maya's question is an answer, not thinking", async () => {
    const c = call(() => reply("Let's look at the ones. What can you do in the ones?", "guide", { step: "ones" }), { reviewer: fakeTalkReviewer() });
    await said(c, ["Can we start?", "okay"]);
    expect(c.model.briefs).toHaveLength(2);
    expect(fillerTurn("okay")).toBe(true);
  });
  it("a cut keeps the sentence that carries the correction", () => {
    expect(trimSay("Hi Leo. 2 minus 8 isn't 6. Here is a long middle sentence with quite a lot of words in it. What is 12 minus 8?", 22)).toBe("Hi Leo. 2 minus 8 isn't 6. What is 12 minus 8?");
  });
  it("a reply about a wrong sum asks a question that names the numbers", async () => {
    let now = T0;
    const model = conversationalFake({ answer: () => reply("7 plus 9 isn't 15, but that was a good try.", "accept_answer") });
    const session = createTextSession({ callId: "r4a", package: SAMPLE_PACKAGES["add-27-39"], model, clock: () => (now += 500), reviewer: fakeTalkReviewer() });
    await session.start();
    const out = await session.child("Is 7 plus 9 15?");
    expect(out.say.join(" ")).toMatch(/7 (?:\+|plus) 9|the ones|count/i);
    expect(out.say.join(" ")).toMatch(/\?$/);
  });
});

describe("each turn is judged on its own (real voice calls on 0be41ec5)", () => {
  it("after two off-topic turns, a math turn streams its first sentence", async () => {
    const c = call((b) => (/dog|food/.test(b.childTurn ?? "")
      ? { ...reply("I'm an AI, so I don't eat. What can you do in the ones?", "redirect", { reading: { offTopic: true } }), kind: "offtopic" }
      : reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } })), { stream: true, reviewer: fakeTalkReviewer() });
    await said(c, ["Do you like dogs? I have a dog named Max.", "What's your favourite food?"]);
    c.parts.length = 0;
    await c.session.child("Okay. The ones are 12 minus 8, 4.");
    expect(c.parts[0]).toBe("Yes, 12 minus 8 is 4.");
    const t = c.session.trace().turns.filter((x) => x.kind === "maya").at(-1);
    expect(t?.kind === "maya" && typeof t.attempts[0].firstSayMs).toBe("number");
  });
  it("an exact safe answer to an off-topic question streams with no review (the bridge after it, on an off-topic turn, is reviewed)", async () => {
    const c = call(() => ({ ...reply("I'm an AI, so I don't eat. What can you do in the ones?", "redirect", { reading: { offTopic: true } }), kind: "offtopic" }), { stream: true });
    await said(c, ["What's your favourite food?"]);
    expect(c.parts[0]).toBe("I'm an AI, so I don't eat.");
    expect(c.reviewer.requests.map((r) => r.line)).not.toContain("I'm an AI, so I don't eat.");
  });
});

describe("the review of a streamed reply's rest (real runs of round 4)", () => {
  it("a sentence after the streamed ones that needs a review is reviewed, not dropped for want of one", async () => {
    const c = call(() => reply("Yes, 12 minus 8 is 4. That sounds like a plan you can be proud of. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }), { stream: true, reviewer: fakeTalkReviewer() });
    const [out] = await said(c, ["12 minus 8 is 4."]);
    expect(c.reviewer.requests.map((r) => r.line)).toContain("That sounds like a plan you can be proud of.");
    expect(out).toContain("That sounds like a plan you can be proud of.");
  });
});

describe("a hello streams like a math turn", () => {
  it("'Hi, Maya' with kind other still streams its math-only first sentence", async () => {
    const c = call(() => ({ ...reply("Hi {name}! Let's start with the ones. What can you do in the ones?", "guide", { step: "ones" }), kind: "other" }), { stream: true });
    await said(c, ["Hi, Maya"]);
    expect(c.parts[0]).toBe("Hi Ava!");
    expect(c.reviewer.requests).toHaveLength(0);
  });
});

describe("round 4 re-review: statements, place results and names", () => {
  for (const stream of [false, true]) {
    it.each([
      "You are nothing.",
      "You are no good at math.",
      "You should stop trying.",
      "You can do nothing.",
      "There is no need to try the ones.",
      "The ones are too hard.",
      "What can you do in the ones, you are no good at math?",
      "What is 12 minus 8 when nothing matters?",
      "你真笨。",
    ])("keeps personal or unclassified output from a failed review, stream=" + stream + ": %s", async (bad) => {
      const c = call(() => reply(`${bad} What can you do in the ones?`, "guide", { step: "ones" }), { stream });
      const [out] = await said(c, ["Can we start?"]);
      expect(out).not.toContain(bad);
      expect(c.parts.join(" ")).not.toContain(bad);
    });

    it.each(["That works.", "It checks out.", "That adds up."])("does not affirm wrong work, stream=" + stream + ": %s", async (affirmation) => {
      const c = call(() => reply(`${affirmation} What is 12 minus 8?`, "guide", { step: "ones", level: 2, reading: { answers: [ans(5, "ones", "wrong")] } }), { stream });
      const [out] = await said(c, ["12 minus 8 is 5."]);
      expect(out).not.toContain(affirmation);
      expect(c.parts.join(" ")).not.toContain(affirmation);
    });

    it.each([
      "The tens are 2. The ones are 4. What is the whole answer?",
      "Two tens. Four ones. What is the whole answer?",
      "Write 2 in the tens. What is the whole answer?",
      "The tens: write 2. The ones: write 4. What is the whole answer?",
      "Write 2 for the tens. What is the whole answer?",
      "For the tens, put down the digit 2. What is the whole answer?",
      "Write 2. What is the whole answer?",
      "The digit to write is 2. What is the whole answer?",
      "2 goes in the tens. What is the whole answer?",
      "Use 2 for the tens. What is the whole answer?",
    ])("keeps an open place result hidden, stream=" + stream + ": %s", async (bad) => {
      const c = call((b) => /12 minus 8/.test(b.childTurn ?? "")
        ? reply("Yes, 12 minus 8 is 4. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } })
        : reply(bad, "guide", { step: "tens" }), { stream });
      await said(c, ["12 minus 8 is 4."]);
      c.parts.length = 0;
      const out = await c.session.child("I don't know the tens.");
      expect(out.say.join(" ")).not.toContain(bad);
      expect(c.parts.join(" ")).not.toMatch(/(?:tens are 2|two tens|2 in the tens|tens: write 2|write 2|put down the digit 2)/i);
    });
  }

  it.each([
    ["José", "José"], ["Élodie", "Élodie"], ["李明", "李明"],
    ["José", "Jose\u0301"], ["Zoë", "Ｚｏｅ"], ["李明", "我叫李明"],
  ])("hides the name %s as written %s from briefs and reviews", async (name, written) => {
    const c = call(() => reply("I hear you. What can you do in the ones?", "guide", { step: "ones" }), { name });
    await said(c, [`Hi, I am ${written}. Can we start?`]);
    const modelText = JSON.stringify(c.model.briefs);
    const reviewText = JSON.stringify(c.reviewer.requests);
    for (const text of [modelText, reviewText]) {
      expect(text).not.toContain(name);
      expect(text).not.toContain(written);
      expect(text).toContain("{name}");
    }
  });
});
