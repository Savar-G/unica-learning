import { describe, expect, it } from "vitest";
import { type FixtureId, FIXTURES } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, type Plan, type Read, scenarioModel } from "@/lib/maya-gate/gate";
import { createTextSession } from "@/lib/maya-text";

const THROWS: Plan[] = [{ throws: true }];

type Turn = { text: string; read?: Read | null; plans?: Plan[] };

interface After { done: string[]; solved: boolean; acts: (string | null)[]; say: string[]; outcome: string | null }

/** Plays turns on a fresh call. A turn with `read: null` is a failed model call (code's fallback decides). */
async function play(turns: Turn[], fixture: FixtureId = "A"): Promise<After> {
  let now = GATE_T0;
  const model = scenarioModel("commit-rule");
  const call = createTextSession({ callId: "commit-rule", package: FIXTURES[fixture], model, clock: () => now, random: 1, grade: 4, freeTalk: false });
  model.next([], undefined);
  const acts: (string | null)[] = [];
  const say: string[] = [];
  const out = await call.start();
  say.push(out.say.join(" "));
  for (const t of turns) {
    now += CHILD_MS;
    model.next(t.read === null ? THROWS : (t.plans ?? []), t.read ?? undefined);
    const o = await call.child(t.text);
    say.push(o.say.join(" "));
    acts.push(call.session.turns.length ? (o.say.length ? "said" : null) : null);
  }
  const s = call.session;
  return { done: [...s.done], solved: s.solved !== null, acts, say, outcome: s.outcome?.reason ?? null };
}

const ones = (text: string, value = 16): Turn => ({ text, read: { answers: [[value, "ones", "right"]] } });

const tens = (text: string, value = 6): Turn => ({ text, read: { answers: [[value, "tens", "right"]] } });

const result = (text: string, value = 66): Turn => ({ text, read: { answers: [[value, "result", "right"]] } });

const down = (text: string): Turn => ({ text, read: null });

const SHOW: Turn = { text: "Show me the ones.", read: { help: "show" }, plans: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };

const ONES_DONE = ones("16.");

const TENS_DONE = tens("6.");

/** Both paths: the model's reading, and a failed model call. */
async function both(before: Turn[], turn: (text: string) => Turn, text: string, fixture: FixtureId = "A") {
  return [await play([...before, turn(text)], fixture), await play([...before, down(text)], fixture)];
}

describe("rule A: the child's own value, with no blocker, is credited on every step kind and the final answer", () => {
  it.each([
    // R1: the final answer, with a sentence about the columns.
    ["I got 66. I put the 6 from the ones with the 6 from the tens.", "result"],
    ["I put the 6 from the ones next to the 6 from the tens. So I got 66.", "result"],
    // R3: a "you" clause with no number of another step.
    ["Yes, 7 plus 9 is 16. You said the 6 stays in the ones.", "ones"],
    ["First I did 7 plus 9. That's 16, like you said.", "ones"],
    ["Fine. 7 + 9 is 16.", "ones"],
    ["Okay, I'll try. Like your warm-up, I add the ones first. 7 plus 9 is 16. What do I do with that?", "ones"],
    ["Can I try 27 plus 39? 7 plus 9 is 16.", "ones"],
    ["I added the ones, 7 and 9. I got 16. Then I got stuck.", "ones"],
    ["That's 16. I got 16.", "ones"],
  ])("credits %j (%s)", async (text, step) => {
    const before = step === "result" ? [ONES_DONE, TENS_DONE] : [];
    const read = step === "result" ? result : ones;
    for (const after of await both(before, read, text)) {
      expect(step === "result" ? after.solved : after.done.includes(step), text).toBe(true);
    }
  });

  it.each([
    // R4: a written-digit claim beside the value.
    "It's 6. I wrote 6 in the tens.",
    "Okay, 2 plus 3 plus 1 is 6. So I write 6 in the tens.",
    "2 plus 3 plus 1 is 6! You said the 1 goes to the tens.",
    "Yes, it's 6. I added the 1 you carried.",
  ])("credits the tens for %j", async (text) => {
    for (const after of await both([ONES_DONE], tens, text)) expect(after.done, text).toContain("tens");
  });

  it("credits a subtraction column and its final answer the same way: 'It's 24. I wrote 4 for the ones and 2 for the tens.'", async () => {
    const text = "It's 24. I wrote 4 for the ones and 2 for the tens.";
    const read: Read = { answers: [[24, "result", "right"], [4, "ones", "right"], [2, "tens", "right"]] };
    for (const after of [await play([{ text, read }], "B"), await play([down(text)], "B")]) {
      expect(after.solved, text).toBe(true);
    }
  });

  // R2: several steps said in order credit each one.
  it("credits the tens and the final answer said in order: '2 plus 3 plus 1 is 6. So the tens are 6, and the answer is 66.'", async () => {
    const text = "Okay, 2 plus 3 plus 1 is 6. So the tens are 6, and the answer is 66.";
    const read: Read = { answers: [[6, "tens", "right"], [66, "result", "right"]] };
    for (const after of [await play([ONES_DONE, { text, read }]), await play([ONES_DONE, down(text)])]) {
      expect(after.done, text).toContain("tens");
      expect(after.solved, text).toBe(true);
    }
  });

  it("credits the ones and the tens said in order on code's fallback: '7 plus 9 is 16, so I wrote 6 and carried 1. 2 plus 3 plus 1 is 6.'", async () => {
    const after = await play([down("7 plus 9 is 16, so I wrote 6 and carried 1. 2 plus 3 plus 1 is 6.")]);
    expect(after.done).toEqual(expect.arrayContaining(["ones", "tens"]));
  });

  it("a wrong value blocks its step and the later ones: '7 plus 9 is 15. 2 plus 3 plus 1 is 6.'", async () => {
    const after = await play([down("7 plus 9 is 15. 2 plus 3 plus 1 is 6.")]);
    expect(after.done).toEqual([]);
  });
});

describe("rule A: each blocker keeps the step uncredited on both paths", () => {
  it.each([
    ["another person", "My mom said 16."],
    ["another person", "7 + 9 is 16. My teacher says so."],
    ["another person", "She wrote 16."],
    ["a hedge", "I think it's 16."],
    ["a hedge", "Maybe 7 + 9 is 16."],
    ["a hedge", "I guess 16."],
    ["a hedge", "It's probably 16."],
    ["a hedge", "7 + 9 is 16 or 17."],
    ["a question about the value", "Is it 16?"],
    ["a question about the value", "16?"],
    ["a question about the value", "7 + 9 is 16. Is that right?"],
    ["a different value", "That's 15. I got 16."],
    ["a different value", "7 + 9 is 15. 7 + 9 is 16."],
    ["an operand counted twice", "I add 9. I add 9. That's 16."],
    ["a request", "Show me. That's 16."],
    ["a request", "7 + 9 is 16. Can you check?"],
    ["a total in the wrong place", "I got 16. I wrote 16 in the tens."],
  ])("never credits the ones for %s: %j", async (_why, text) => {
    for (const after of await both([], ones, text)) expect(after.done, text).not.toContain("ones");
  });

  it.each(["16 in the tens.", "So it's 16 in the tens."])("never credits a total said in the wrong place: %j", async (text) => {
    for (const after of await both([], ones, text)) expect(after.done, text).not.toContain("ones");
  });

  it.each(["I think it's 66. I put the 6 and the 6 together.", "Is it 66?", "My brother got 66.", "66 or 56."])("never accepts the final answer for %j", async (text) => {
    for (const after of await both([ONES_DONE, TENS_DONE], result, text)) expect(after.solved, text).toBe(false);
  });

  it.each(["Yes, 2. I think I'm right?", "2. I think."])("never credits a subtraction column for a hedge: %j", async (text) => {
    const ONES_B: Turn = { text: "4.", read: { answers: [[4, "ones", "right"]] } };
    const read: Read = { answers: [[2, "tens", "right"]] };
    for (const after of [await play([ONES_B, { text, read }], "B"), await play([ONES_B, down(text)], "B")]) expect(after.done, text).not.toContain("tens");
  });

  it("never credits a copy of a subtraction column Maya showed", async () => {
    const SHOW_B: Turn = { text: "Show me the ones.", read: { help: "show" }, plans: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
    const text = "Yes, 4. I got the 4 from 12 take away 8, like you showed me.";
    const read: Read = { answers: [[4, "ones", "right"]] };
    for (const after of [await play([SHOW_B, { text, read }], "B"), await play([SHOW_B, down(text)], "B")]) expect(after.done, text).not.toContain("ones");
  });
});

describe("rule B: after Maya's confirm, yes with the same value credits it", () => {
  it.each(["Yes, I got 66. I put the 6 and the 6 together.", "Yes, 66.", "Yes."])("accepts the final answer after 'Did you say 66?': %j", async (text) => {
    const asked: Turn = { text: "Is it 66?", read: { answers: [[66, "result", "right"]] }, plans: [{ act: "confirm", heard: "66" }] };
    for (const reply of [result(text), down(text)]) {
      const after = await play([ONES_DONE, TENS_DONE, asked, reply]);
      expect(after.say[3], "Maya asked her confirm").toMatch(/66/);
      expect(after.solved, text).toBe(true);
    }
  });

  it.each(["Yes, 7 plus 9 is 16.", "Yes, I said 16. I wrote the 6."])("credits the ones after 'Did you say 16?': %j", async (text) => {
    const asked: Turn = { text: "7 + 9 is 16. Is that right?", read: { answers: [[16, "ones", "right"]] }, plans: [{ act: "confirm", heard: "16" }] };
    for (const reply of [ones(text), down(text)]) {
      const after = await play([asked, reply]);
      expect(after.done, text).toContain("ones");
    }
  });
});

describe("rule C: 'you said' is the child's echo only for the step's own numbers, before any show", () => {
  it.each(["You said 16.", "Yes, 7 plus 9 is 16. You said the 6 stays in the ones."])("credits the ones for %j before any show", async (text) => {
    for (const after of await both([], ones, text)) expect(after.done, text).toContain("ones");
  });

  it.each(["You said 16.", "You said 16", "Yes, 7 plus 9 is 16. You said the 6 stays in the ones."])("does not credit %j after Maya showed the ones at H3", async (text) => {
    for (const after of await both([SHOW], ones, text)) expect(after.done, text).not.toContain("ones");
  });

  it.each(["You said 16.", "You said 16", "Yes, 7 plus 9 is 16. You said the 6 stays in the ones."])("does not credit %j after the show and the easier example", async (text) => {
    for (const after of await both([SHOW, down("Um."), down("Okay.")], ones, text)) expect(after.done, text).not.toContain("ones");
  });

  it.each(["You said 17.", "You said 2 plus 3 is 5. 7 plus 9 is 16."])("does not credit the ones for %j", async (text) => {
    for (const after of await both([], ones, text)) expect(after.done, text).not.toContain("ones");
  });
});

describe("rule D: a turn held back only by its form does not count toward the honest close", () => {
  it("asks the confirm, never closes, for a child who keeps asking about the right value", async () => {
    const asks = ["7 + 9 is 16. Is that right?", "So it's 16?", "16? Is that right?", "Is it 16?"];
    for (const path of [ones, down]) {
      const after = await play(asks.map((t) => path(t)));
      expect(after.outcome, "Maya never closes this call").toBeNull();
      expect(after.say.slice(1).join(" "), "Maya asks her confirm").toMatch(/16/);
    }
  });

  it("still closes for a child who only asks for help, as before", async () => {
    const help = Array.from({ length: 10 }, () => down("I'm stuck. Help me."));
    const after = await play(help);
    expect(after.outcome).not.toBeNull();
  });
});

describe("commit rule refusals and take-backs", () => {
  const THROWS: Plan[] = [{ throws: true }];

  type Turn = { text: string; read?: Read | null };

  async function play(turns: Turn[], fixture: FixtureId) {
    let now = GATE_T0;
    const model = scenarioModel("review3");
    const call = createTextSession({ callId: "review3", package: FIXTURES[fixture], model, clock: () => now, random: 1, grade: 4, freeTalk: false });
    model.next([], undefined);
    await call.start();
    for (const t of turns) {
      now += CHILD_MS;
      model.next(t.read === null ? THROWS : [], t.read ?? undefined);
      await call.child(t.text);
    }
    return { done: [...call.session.done], solved: call.session.solved !== null };
  }

  const read = (value: number, step: string): Read => ({ answers: [[value, step, "right"]] });

  const A_ONES: Turn = { text: "16.", read: read(16, "ones") };

  const A_TENS: Turn = { text: "6.", read: read(6, "tens") };

  const B_ONES: Turn = { text: "4.", read: read(4, "ones") };

  // [fixture, steps done first, the step, its value, the turns]
  const CASES: [FixtureId, Turn[], string, number, string[]][] = [
    ["A", [], "ones", 16, [
      "Sam said 16.", "Alex got 16.", "Mia told me 16.", "Siri said 16.", "My iPad got 16.", "My partner got 16.", "My workbook has 16.", "The answer sheet has 16.",
      "The answer key: 16.", "I copied 16 from the board.", "I looked at the back and it's 16.", "The app showed 16.", "Maya said 16.", "It said 16 on the screen.",
      "I feel like it's 16.", "16, I reckon.", "It's about 16.", "Around 16.", "Roughly 16.", "Something like 16.", "Uh, 16-ish.", "Pretty sure it's 16.",
      "Just say if it's 16.", "16. Let me know.", "Tell me if it's 16.", "Say if it's right. 16.",
      "16, that's the answer.", "16. Done!", "16, I'm finished.",
      "You said 16 and 66.", "You said 6 and 16. So 16.",
    ]],
    ["A", [A_ONES], "tens", 6, ["Sam said 6.", "About 6.", "6, that's the answer.", "Just say if it's 6."]],
    ["B", [], "ones", 4, ["Sam got 4.", "Just say if it's 4.", "I feel like it's 4.", "Around 4."]],
    ["B", [B_ONES], "tens", 2, ["Sam got 2.", "Roughly 2."]],
    ["A", [A_ONES, A_TENS], "result", 66, ["Sam said 66.", "About 66.", "I feel like it's 66."]],
    ["A", [A_ONES], "result", 66, ["You said 66.", "You told me 66.", "Maya said 66."]],
    ["A", [], "result", 66, ["You told me it's 66.", "Okay! You said 66 is right, so I wrote it. I'm done!"]],
  ];

  describe("review of the commit rule: each of these turns is refused on both paths", () => {
    for (const [fixture, before, step, value, turns] of CASES) {
      it.each(turns)(`${fixture} ${step}: %j`, async (text) => {
        for (const turn of [{ text, read: read(value, step) }, { text, read: null }]) {
          const r = await play([...before, turn], fixture);
          expect(step === "result" ? r.solved : r.done.includes(step), `${text} (${turn.read ? "model" : "fallback"})`).toBe(false);
        }
      });
    }

    it("still credits a take-back to the right value: '15. No wait, 16.'", async () => {
      for (const turn of [{ text: "15. No wait, 16.", read: read(16, "ones") }, { text: "15. No wait, 16.", read: null }]) {
        expect((await play([turn], "A")).done).toContain("ones");
      }
    });
  });
});

describe("commit rule honest turns and hedges", () => {
  const THROWS: Plan[] = [{ throws: true }];

  type Turn = { text: string; read?: Read | null };

  async function play(turns: Turn[]) {
    let now = GATE_T0;
    const model = scenarioModel("review4");
    const call = createTextSession({ callId: "review4", package: FIXTURES.A, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
    model.next([], undefined);
    await call.start();
    for (const t of turns) {
      now += CHILD_MS;
      model.next(t.read === null ? THROWS : [], t.read ?? undefined);
      await call.child(t.text);
    }
    return { done: [...call.session.done], solved: call.session.solved !== null };
  }

  const read = (value: number, step: string): Read => ({ answers: [[value, step, "right"]] });

  const ONES: Turn = { text: "16.", read: read(16, "ones") };

  const TENS: Turn = { text: "6.", read: read(6, "tens") };

  const HONEST: [Turn[], string, number, string[]][] = [
    [[], "ones", 16, ["7 and 9 gives 16.", "Adding them gives 16.", "That gives 16.", "The ones have 16.", "The ones got 16.", "The ones column has 16.",
      "I'm done with the ones, it's 16.", "The ones are done. 16.", "16. Now the tens, then the answer.", "It has to be 16."]],
    [[ONES], "tens", 6, ["2 plus 3 plus 1 gives 6.", "The tens have 6.", "The tens got 6.", "That gives 6."]],
    [[ONES, TENS], "result", 66, ["27 plus 39 gives 66.", "That gives 66."]],
  ];

  const REFUSED: [Turn[], string, number, string[]][] = [
    [[], "ones", 16, ["We got 16 in class.", "Sam: 16.", "16, according to Sam.", "From the board, 16.", "On the poster it's 16.", "I peeked, 16.",
      "Most likely 16.", "Let's say 16.", "16 is the whole answer.", "16, the end.", "16, Sam said.", "16. Sam says so."]],
    [[ONES, TENS], "result", 66, ["66, like you said.", "66, as you said.", "66, you told me."]],
  ];

  const credited = async (before: Turn[], step: string, value: number, text: string) =>
    Promise.all([{ text, read: read(value, step) }, { text, read: null }].map(async (turn) => {
      const r = await play([...before, turn]);
      return step === "result" ? r.solved : r.done.includes(step);
    }));

  describe("re-review of the commit rule", () => {
    for (const [before, step, value, turns] of HONEST) {
      it.each(turns)(`credits ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([true, true]));
    }
    for (const [before, step, value, turns] of REFUSED) {
      it.each(turns)(`refuses ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([false, false]));
    }
  });
});

describe("commit rule edge cases", () => {
  const THROWS: Plan[] = [{ throws: true }];

  type Turn = { text: string; read?: Read | null };

  async function play(turns: Turn[]) {
    let now = GATE_T0;
    const model = scenarioModel("review5");
    const call = createTextSession({ callId: "review5", package: FIXTURES.A, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
    model.next([], undefined);
    await call.start();
    for (const t of turns) {
      now += CHILD_MS;
      model.next(t.read === null ? THROWS : [], t.read ?? undefined);
      await call.child(t.text);
    }
    return { done: [...call.session.done], solved: call.session.solved !== null };
  }

  const read = (value: number, step: string): Read => ({ answers: [[value, step, "right"]] });

  const ONES: Turn = { text: "16.", read: read(16, "ones") };

  const TENS: Turn = { text: "6.", read: read(6, "tens") };

  const HONEST: [Turn[], string, number, string[]][] = [
    [[], "ones", 16, ["They make 16.", "Together they make 16.", "7 and 9, they make 16.", "They add up to 16.", "Those two make 16.", "I say 16."]],
    [[ONES], "tens", 6, ["They make 6."]],
    [[ONES, TENS], "result", 66, ["They add up to 66.", "Result: 66."]],
  ];

  const REFUSED: [Turn[], string, number, string[]][] = [
    [[], "ones", 16, ["Sam did 16.", "Sam made 16.", "Sam answered 16.", "Sam worked out 16.", "Sam counted 16.", "Sam was like, 16.", "Sam goes 16.",
      "Sam is saying 16.", "Sam reckons 16.", "Sam's is 16.", "Sam's answer was 16.", "The girl next to me got 16.", "I heard Sam got 16.", "I saw Sam got 16.",
      "I know Sam got 16.", "They got 16.", "They said 16.", "Let's go with 16."]],
  ];

  const credited = async (before: Turn[], step: string, value: number, text: string) =>
    Promise.all([{ text, read: read(value, step) }, { text, read: null }].map(async (turn) => {
      const r = await play([...before, turn]);
      return step === "result" ? r.solved : r.done.includes(step);
    }));

  describe("the subject allow-list", () => {
    for (const [before, step, value, turns] of HONEST) {
      it.each(turns)(`credits ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([true, true]));
    }
    for (const [before, step, value, turns] of REFUSED) {
      it.each(turns)(`refuses ${step} for %j on both paths`, async (text) => expect(await credited(before, step, value, text)).toEqual([false, false]));
    }
    it("does not refuse a product said with a colon: 'Product: 48.' on 6 x 4 is no name", async () => {
      // FIXTURES.C is 6 × 4 = 24; a colon after a math word is no speaker.
      let now = GATE_T0;
      const model = scenarioModel("review5-c");
      const call = createTextSession({ callId: "review5-c", package: FIXTURES.C, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
      model.next([], undefined);
      await call.start();
      now += CHILD_MS;
      model.next(THROWS, undefined);
      await call.child("Product: 24.");
      expect(call.session.solved).not.toBeNull();
    });
  });
});
