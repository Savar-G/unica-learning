// The commit rule as a block-list (2026-11-12, approved by Savar through the Chief of Staff). A step, or the final answer, is
// credited when the child's turn states its value as the child's own and the turn has no blocker: another person's number,
// a hedge, a question about the value, a different value for the same step, an operand counted twice, a request to Maya,
// or a copy of a step Maya showed. Several steps said in order credit each one. The model's reading and code's fallback
// use the one check. After Maya's confirm, "Yes" with the same value credits it. "You said X" is the child's echo only
// when X holds that step's own numbers and Maya has not shown the step. A turn held back only by its form never counts
// toward the loop guard or the honest close: Maya asks her confirm. FIXTURES.A is 27 + 39; FIXTURES.B is 52 - 28.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES, type FixtureId } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

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
