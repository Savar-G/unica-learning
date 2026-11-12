import { describe, expect, it } from "vitest";
import { createSession, step, type LineChoice, type LineId, type Proposal, type SessionEvent, type Slots } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type Operation } from "@/lib/question-package";

const operation: Operation = { kind: "add", operands: [18, 25] };
const pkg = {
  ...SAMPLE_PACKAGES["add-27-39"], id: "review-roles-18-25", text: "18 + 25 = ?", operation,
  steps: workedSteps(operation), answer: { value: { type: "number", value: 43 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number", value: 33 }, step: "tens", cause: "O3", description: "Forgets the carry" }],
};
const line = (id: LineId, slots: Slots = {}): LineChoice => ({ line: id, slots });
type Input = SessionEvent extends infer E ? E extends SessionEvent ? Omit<E, "at"> : never : never;
type Column = "ones" | "tens";

function call(column: Column = "ones") {
  let session = createSession({ callId: "review-r6", package: pkg });
  let at = 1000;
  const send = (event: Input) => {
    const result = step(session, { ...event, at: at += 4000 } as SessionEvent);
    session = result.session;
    return result;
  };
  const judge = (part: Column, verdict: "right" | "wrong" = "right") => {
    const next = verdict === "wrong" ? part : part === "ones" ? "tens" : "result";
    const proposal: Proposal = {
      version: 2, act: "guide", step: next, level: 0,
      parts: [line(verdict === "right" ? "check.right_step" : "check.not_yet", { step: part }), line("step.invite", { step: next })],
      reading: { answers: [{ value: { type: "number", value: part === "ones" ? 13 : 4 }, step: part, verdict }] },
    };
    return send({ type: "proposal", proposal });
  };
  send({ type: "start" });
  expect(send({ type: "proposal", proposal: { version: 2, act: "open", parts: [line("open.hello"), line("question.problem")] } }).refusal).toBeNull();
  if (column === "tens") {
    send({ type: "child_turn", text: "8 plus 5 is 13." });
    expect(judge("ones").refusal).toBeNull();
  }
  return {
    get session() { return session; },
    child(text: string) { send({ type: "child_turn", text }); },
    judge(verdict: "right" | "wrong" = "right") { return judge(column, verdict); },
  };
}

/**
 * A turn with a sum and a claim is two templates, so a right one is not heard (the whole-turn rule, review of 771d2127), and
 * code still tells it from a wrong one: the checks of this file stay what they were, only the credit moved.
 */
const expectJudged = (refusal: { code: string } | null, right: boolean) => expect(refusal?.code).toBe(right ? "answer_not_committed" : "accepts_wrong_answer");

describe("PR624 round 6: writing modifiers and column locations", () => {
  const forms = ["wrote the number", "wrote it as", "put the digit"];
  const cases = forms.flatMap((verb) => (["ones", "tens"] as const).flatMap((column) => [false, true].map((right) => ({
    verb, column, right, digit: right ? column === "ones" ? "three" : "four" : "two",
  }))));
  it.each(cases)("checks $verb $digit in $column", ({ verb, column, right, digit }) => {
    const c = call(column);
    c.child(`${column === "ones" ? "8 plus 5 is 13" : "1 plus 2 plus 1 is 4"}, I ${verb} ${digit} in the ${column}.`);
    expectJudged(c.judge().refusal, right);
    expect(c.session.done.includes(column)).toBe(false);
  });

  it.each(["in", "into", "under", "at", "for", "on"].flatMap((place) => [false, true].map((right) => ({ place, right }))))("checks another column $place the ones, correct=$right", ({ place, right }) => {
    const c = call("tens");
    c.child(`I wrote ${right ? 3 : 4} ${place} the ones, then 1 plus 2 plus 1 is 4.`);
    expectJudged(c.judge().refusal, right);
    expect(c.session.done.includes("tens")).toBe(false);
  });

  it.each([false, true])("checks both written digits in one clause, correct=%s", (right) => {
    const c = call("tens");
    c.child(`I wrote 3 in the ones and ${right ? 4 : 2} in the tens, then 1 plus 2 plus 1 is 4.`);
    expectJudged(c.judge().refusal, right);
    expect(c.session.done.includes("tens")).toBe(false);
  });

  it.each(["right", "wrong"] as const)("does not judge an unreadable column relation as %s", (verdict) => {
    const c = call("tens");
    c.child("I wrote 4 beside the ones, then 1 plus 2 plus 1 is 4.");
    expect(c.judge(verdict).refusal).not.toBeNull();
    expect(c.session.done).not.toContain("tens");
  });

  it.each(["right", "wrong"] as const)("clarifies a writing claim with two columns before judging %s", (verdict) => {
    const c = call("tens");
    c.child("I wrote 3 from the ones into the tens, then 1 plus 2 plus 1 is 4.");
    expect(c.judge(verdict).refusal).not.toBeNull();
    expect(c.session.done).not.toContain("tens");
  });

  it.each([false, true])("keeps the column after a decimal point, correct=%s", (right) => {
    const c = call("tens");
    c.child(`I wrote ${right ? "3.0" : "4.0"} under the ones, then 1 plus 2 plus 1 is 4.`);
    expectJudged(c.judge().refusal, right);
    expect(c.session.done.includes("tens")).toBe(false);
  });

  it.each(["two", "three"].flatMap((digit) => (["right", "wrong"] as const).map((verdict) => ({ digit, verdict }))))("does not judge an unreadable writing claim $digit as $verdict", ({ digit, verdict }) => {
    const c = call(); c.child(`8 plus 5 is 13, I wrote the new number ${digit} in the ones.`);
    expect(c.judge(verdict).refusal).not.toBeNull();
    expect(c.session.done).not.toContain("ones");
  });
});

describe("PR624 round 6: carry sources and destinations", () => {
  const routes = ["from the ones to the tens", "from the ones column to the tens column", "from the ones", "to the tens", "in the tens", "into the tens"];
  const cases = routes.flatMap((route) => (["ones", "tens"] as const).flatMap((column) => (["right", "wrong"] as const).map((verdict) => ({ route, column, verdict }))));
  it.each(cases)("checks $route in $column with verdict $verdict", ({ route, column, verdict }) => {
    const c = call(column);
    c.child(column === "ones" ? `8 plus 5 is 13, I carried one ${route} and wrote 3.` : `I carried one ${route}, and 1 plus 2 plus 1 is 4.`);
    expect(c.judge(verdict).refusal?.code).toBe(verdict === "right" ? "answer_not_committed" : "rejects_right_answer");
    expect(c.session.done.includes(column)).toBe(false);
  });

  it.each(["from the tens to the ones", "from the ones to the ones", "from the ones to the hundreds"])("does not approve a wrong carry %s", (route) => {
    const c = call(); c.child(`8 plus 5 is 13, I carried one ${route} and wrote 3.`);
    expect(c.judge().refusal).not.toBeNull();
    expect(c.session.done).not.toContain("ones");
  });
});
