import { afterEach, describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import type { OperationPackage } from "@/lib/question-package";
import { checkTutorSay, plainTeaching } from "./tutor";
import { testKind } from "./tutor-kinds";
import type { TutorKind } from "./tutor-kind";

// The two core gaps the F2 and F4 builders found (2026-11-15): the claim reader read no × or ÷, and code's credit did
// not see a word answer.

describe("the claim reader reads × and ÷ (F2 builder)", () => {
  const none = { stance: "none" as const };
  it.each(["6 times 440 is 2640.", "6 × 440 = 2640.", "3 tens times 2 is 6 tens.", "6 times 4 tens is 24 tens.", "1340 divided by 2 is 670.", "1340 ÷ 2 = 670.", "2 × 670 = 1340.", "6 × 870 is 5220.", "72 ÷ 9 = 8.", "Multiply the ones: 0 × 6 = 0.", "15 ÷ 6 = 2 R 3.", "15 divided by 6 is 2 remainder 3.", "6 × 40 + 6 × 4 = 264.", "3 x 4 = 12."])("passes %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: true }));
  it.each(["6 times 440 is 2650.", "6 × 440 = 2600.", "3 tens times 2 is 5 tens.", "1340 divided by 2 is 680.", "1340 ÷ 2 = 660.", "15 ÷ 6 = 2 R 4.", "15 divided by 6 is 3 remainder 3.", "6 × 40 + 6 × 4 = 254.", "72 ÷ 9 is not 8."])("refuses %s", (x) => expect(checkTutorSay(x, none)).toMatchObject({ ok: false }));
});

describe("code's credit sees a word answer (F4 builder)", () => {
  let undo: () => void = () => {};
  afterEach(() => undo());
  const claimKind = (id: string): TutorKind => ({
    id, fits: (p) => p.text === (FIXTURES.CLAIM_TF as OperationPackage).text || p.text === (FIXTURES.CLAIM_GT as OperationPackage).text, steps: (p) => p.steps.filter((x) => x.kind !== "result").map((x) => ({ id: x.id, work: "Check the claim", result: "?" })),
    numberMeaning: () => "not a value of this question", workValues: () => [], streamScope: () => ({ numbers: [], expressions: [] }), stepQuestion: () => "Is the claim true?",
    drawings: () => [], draw: () => ({ commands: [], keys: [] }), boardNeeds: () => ({}), claimProblems: () => [],
  });
  const wrongWord = (name: string) => (name === "CLAIM_TF" ? ["I circle false.", "It's false.", "false"] : ["I circle no.", "It's no.", "no"]);
  for (const name of ["CLAIM_TF", "CLAIM_GT"] as const) {
    it(`never says "yes" to a wrong word on ${name}`, async () => {
      const pkg = FIXTURES[name] as OperationPackage;
      undo = testKind(claimKind(name));
      for (const child of wrongWord(name)) {
        let now = Date.UTC(2026, 10, 15);
        const model = conversationalFake({ answer: (_b, n) => (n === 0 ? reply("Yes, that's right! Well done.", "guide") : reply("Let's check it together. Is the claim true?", "guide")) });
        // A reviewer that passes everything: only code's stance can stop the false "yes".
        const session = createTextSession({ callId: `w-${name}`, package: pkg, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
        await session.start();
        expect(session.session.tutor).toBeDefined();
        const out = await session.child(child);
        expect(out.say.join(" ")).not.toContain("that's right");
      }
    });
  }
});

describe("review of #1009: a kind cannot bypass the core", () => {
  let undo: () => void = () => {};
  afterEach(() => undo());
  const SUB = { ...(FIXTURES.CLAIM_TF as OperationPackage) };
  const liar = (over: Partial<TutorKind>): TutorKind => ({
    id: "liar", fits: (p) => p.text === SUB.text, steps: (p) => p.steps.filter((x) => x.kind !== "result").map((x) => ({ id: x.id, work: "Check it", result: "?" })),
    numberMeaning: () => "not a value of this question", workValues: () => [], streamScope: () => ({ numbers: [], expressions: [] }), stepQuestion: () => "What is 6 times 8?",
    drawings: () => [{ id: "note", does: "a note" }], draw: () => ({ commands: [], keys: [] }), boardNeeds: () => ({}), claimProblems: () => [], ...over,
  });
  it("never says a kind's unsafe step question as code's line", async () => {
    undo = testKind(liar({ stepQuestion: () => "You are no good at math, not even 2 plus 2." }));
    let now = Date.UTC(2026, 10, 15);
    const model = conversationalFake({ answer: () => reply("6 × 8 = 49.", "guide") });
    const session = createTextSession({ callId: "liar-1", package: SUB, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    const out = await session.child("I need help");
    expect(out.say.join(" ")).not.toContain("no good");
    expect(out.say.join(" ")).toContain("Let me say that another way.");
  });
  it("never draws a kind's unchecked text on the board", async () => {
    undo = testKind(liar({ draw: (_p, req) => ({ commands: req.map((r, i) => ({ op: "write", id: `liar-${i}`, text: r.place ?? "", place: { below: "question" } })), keys: [] }) }));
    let now = Date.UTC(2026, 10, 15);
    const model = conversationalFake({ answer: () => reply("What is 6 times 8?", "guide", { draw: [{ offer: "note", place: "12 - 8 = 5" }, { offer: "note", place: "You are dumb" }] }) });
    const session = createTextSession({ callId: "liar-2", package: SUB, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    const out = await session.child("I need help");
    const writes = out.board.flatMap((b) => b.commands).filter((c) => (c as { op?: string }).op === "write");
    expect(writes).toEqual([]);
  });
});

describe("core gaps of F1 and F3 (2026-11-15)", () => {
  const sub = { stance: "none" as const, op: "subtract" as const };
  it.each(["4,000 is 4 thousands.", "48,942 is 4 ten thousands and 8 thousands and 9 hundreds and 4 tens and 2 ones.", "4 × 10,000 = 40,000.", "0 tens become 10 tens.", "0 tens are now 9 tens.", "10000 is 9 thousands and 10 hundreds."])("passes %s", (x) => expect(checkTutorSay(x, sub)).toMatchObject({ ok: true }));
  it.each(["4,000 is 5 thousands.", "48,942 is 4 ten thousands.", "5 tens are now 6 tens.", "0 tens become 11 tens."])("refuses %s", (x) => expect(checkTutorSay(x, sub)).toMatchObject({ ok: false }));
  it.each(["Is 5220 greater than 5226?", "Is 6 times 870 less than 5226?", "Which digit is in the thousands place?", "What is the value of the 4?", "What is 6 times 440?", "What do you get for 1340 divided by 2?", "What is the missing number?"])("treats %s as plain math", (x) => expect(plainTeaching(x)).toBe(true));
});

// Core gaps of F2 and F4 (2026-11-15): the step questions of × ÷ and comparisons are closed plain forms, and "N groups of
// M" is read as N × M (a true one passes, a false one is refused).
describe("core gaps of F2 and F4 (2026-11-15)", () => {
  it.each(["What is 6 × 870?", "What is 72 ÷ 9?", "What is 6 times 440?", "What is 13 divided by 2?", "Is 1440 greater than 1436?", "Is 7 the same as 6?", "Which is bigger, 42 or 30?", "Which is smaller, 4 times 6 or 30?"])("sends %s with no review", (x) => expect(plainTeaching(x)).toBe(true));
  it.each(["Which is bigger, you or me?", "Is my sister bigger than me?", "Which is better, 42 or a puppy?"])("reviews %s", (x) => expect(plainTeaching(x)).toBe(false));
  it.each(["6 groups of 440 is 2640.", "3 groups of 4 make 12."])("passes the true sentence %s", (x) => expect(checkTutorSay(x, { stance: "none" })).toMatchObject({ ok: true }));
  it.each(["6 groups of 440 is 2600.", "3 groups of 4 make 7."])("refuses %s", (x) => expect(checkTutorSay(x, { stance: "none" })).toMatchObject({ ok: false }));
  it("reads 'in groups of 4' as words, not an operation", () => expect(checkTutorSay("Put them in groups of 4.", { stance: "none" })).toMatchObject({ ok: true }));
});

describe("comma numbers in plain forms (F3, 2026-11-15)", () => {
  it.each(["So what is 9,000 plus 60?", "What is the value of the 4 in 48,942?", "48,942 is 4 ten thousands and 8,942 ones."])("sends %s with no review", (x) => expect(plainTeaching(x)).toBe(true));
  it.each(["So, 9, my friend.", "What is 12 minus 8, my friend?"])("reviews %s", (x) => expect(plainTeaching(x)).toBe(false));
});

// Review of #1009 (Sol, 2026-11-15): three regressions of the core additions, each said to the child before the fix.
describe("review of #1009: core additions (2026-11-15)", () => {
  const sub = { stance: "none" as const, op: "subtract" as const };
  it.each(["5 tens become 15 tens.", "5 tens are now 14 tens."])("refuses the impossible borrow %s", (x) => expect(checkTutorSay(x, sub)).toMatchObject({ ok: false }));
  it.each(["0 tens become 10 tens.", "0 tens are now 9 tens.", "5 tens become 4 tens."])("still passes the true trade %s", (x) => expect(checkTutorSay(x, sub)).toMatchObject({ ok: true }));
  it("refuses a product read as a place quantity", () => {
    expect(checkTutorSay("3 groups of 4 is 12 tens.", { stance: "none" })).toMatchObject({ ok: false });
    expect(checkTutorSay("3 × 4 is 12 tens.", { stance: "none" })).toMatchObject({ ok: false });
    expect(checkTutorSay("1 + 2 + 3 = 6 tens.", { stance: "none" })).toMatchObject({ ok: true });
  });
  it("reads a bare word after Maya's own question against that question, not the printed claim", async () => {
    const pkg = FIXTURES.COMPARE_FRACTIONS as OperationPackage;
    const kind: TutorKind = {
      id: "comparison-review", fits: (p) => p.operation.kind === "comparison",
      steps: (p) => p.steps.filter((s) => s.kind !== "result").map((s) => ({ id: s.id, work: "Check the comparison", result: "?" })),
      numberMeaning: () => "not a value of this question", workValues: () => [],
      streamScope: () => ({ numbers: [], expressions: [] }), stepQuestion: () => "Which is bigger, 9 or 5?",
      drawings: () => [], draw: () => ({ commands: [], keys: [] }), boardNeeds: () => ({}), claimProblems: () => [],
    };
    const undo = testKind(kind);
    try {
      let now = Date.UTC(2026, 10, 15);
      const answerWord = String((pkg.answer.value as unknown as { value?: unknown }).value);
      const question = answerWord === "true" ? "Is 5 less than 3?" : "Is 5 greater than 3?";
      const child = answerWord === "true" ? "false" : "true";
      const model = conversationalFake({ answer: (_b, n) => reply(n === 0 ? question : "Yes. Which is bigger, 5 or 3?", "guide") });
      const session = createTextSession({ callId: "comparison-review", package: pkg, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
      await session.start();
      expect((await session.child("I need help")).say).toEqual([question]);
      expect((await session.child(child)).say.join(" ").startsWith("Yes.")).toBe(true);
    } finally { undo(); }
  });
});

describe("a place that lends and borrows (review of #1009)", () => {
  const sub = { stance: "none" as const, op: "subtract" as const };
  it("passes '2 tens become 11 tens' only when 11 is a work value of the question", () => {
    expect(checkTutorSay("2 tens become 11 tens.", { ...sub, trades: [11, 9, 4] })).toMatchObject({ ok: true });
    expect(checkTutorSay("2 tens become 11 tens.", sub)).toMatchObject({ ok: false });
    expect(checkTutorSay("5 tens become 15 tens.", { ...sub, trades: [12, 4, 2, 24] })).toMatchObject({ ok: false });
  });
});

describe("the next open step's result is right (review of #1018)", () => {
  it("never lets 'Not quite' answer the open step's own result", async () => {
    const pkg = FIXTURES.COMPARE_FRACTIONS as OperationPackage;
    const kind: TutorKind = {
      id: "open-step-review", fits: (p) => p.text === pkg.text,
      steps: () => [{ id: pkg.steps[0].id, work: "Find the second term", result: 28 }],
      numberMeaning: () => "a value of the work", workValues: () => [28],
      streamScope: () => ({ numbers: [], expressions: [] }), stepQuestion: () => null,
      drawings: () => [], draw: () => ({ commands: [], keys: [] }), boardNeeds: () => ({}), claimProblems: () => [],
    };
    const undo = testKind(kind);
    try {
      let now = Date.UTC(2026, 10, 15);
      const model = conversationalFake({ answer: () => reply("Not quite. What comes next?", "guide") });
      const session = createTextSession({ callId: "open-step-review", package: pkg, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
      await session.start();
      expect((await session.child("28")).say.join(" ")).not.toMatch(/not quite/i);
    } finally { undo(); }
  });
});
