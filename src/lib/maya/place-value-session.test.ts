// B1a: place value in Maya's controller, through createSession, step, nextActs and fallbacks. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { createSession, fallbacks, heldReason, learningEvent, nextActs, step, turnWordLimit, TIME_LIMITS, type Session } from "./session";
import { packageLines } from "./lines";
import type { OperationPackage } from "@/lib/question-package";
import { scopeReason } from "./scope";
import { speechWords } from "./speech";
import { PROPOSAL_VERSION } from "./proposal";
import { placeValueTeachingPackage } from "@/lib/maya-teaching/place-value";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { Place, QuestionPackage } from "@/lib/question-package";

const pkg = (variant: "1.1" | "2.2", n0: number, place: Place): QuestionPackage => {
  const r = placeValueTeachingPackage(storedPlaceValue({ variant, n0, place }));
  if ("held" in r) throw new Error(r.held);
  return r.package;
};
const DIGIT = pkg("1.1", 53172, "thousands");
const VALUE = pkg("2.2", 785243, "ten thousands");
const num = (value: number) => ({ type: "number" as const, value });

/** A session that has said hello and heard the child's first turn. */
function opened(p: QuestionPackage, text: string): Session {
  let s = createSession({ callId: "pv", package: p });
  s = step(s, { type: "start", at: 0 }).session;
  const open = step(s, { type: "proposal", at: 1, proposal: { version: PROPOSAL_VERSION, act: "open", parts: [{ line: "open.hello" }, { line: "assess.ask" }] } });
  expect(open.refusal).toBeNull();
  return step(open.session, { type: "child_turn", at: 2, text }).session;
}

describe("place value in the controller", () => {
  it("teaches both asks, and holds a stored question it cannot derive", () => {
    expect(heldReason(DIGIT)).toBeNull();
    expect(heldReason(VALUE)).toBeNull();
    expect(heldReason(storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" }))).toMatch(/no operation/);
  });

  it("credits the digit step only from its own place word: '8 ten thousands', never '8 thousands'", () => {
    const guide = (reading: unknown) => ({ version: PROPOSAL_VERSION, act: "guide", step: "result", level: 0, reading, parts: [{ line: "check.right_step", slots: { step: "digit" } }, { line: "step.invite", slots: { step: "result" } }] });
    const right = step(opened(VALUE, "8 ten thousands"), { type: "proposal", at: 3, proposal: guide({ answers: [{ value: num(8), step: "digit", verdict: "right" }] }) });
    expect(right.refusal).toBeNull();
    expect(right.session.done).toEqual(["digit"]);
    const wrong = step(opened(VALUE, "8 thousands"), { type: "proposal", at: 3, proposal: guide({ answers: [{ value: num(8), step: "digit", verdict: "right" }] }) });
    expect(wrong.refusal?.code).toBe("answer_not_committed");
  });

  it("code's fallback hears an early digit in the child's own words and goes on to the value (J06)", () => {
    const s = opened(VALUE, "The digit is 8.");
    const first = fallbacks(s)[0];
    expect(first).toMatchObject({ act: "guide", step: "result", reading: { answers: [{ value: num(8), step: "digit", verdict: "right" }] } });
    expect(step(s, { type: "proposal", at: 3, proposal: first, fallback: true }).refusal).toBeNull();
  });

  it("never offers a given answer, in the closing minute either", () => {
    let s = opened(DIGIT, "I don't know.");
    s = step(s, { type: "tick", at: TIME_LIMITS.closingAtMs + 1 }).session;
    expect(nextActs(s).acts).not.toContain("give_answer");
    expect(fallbacks(s).map((p) => p.act)).not.toContain("give_answer");
  });

  it("refuses a stripe or the digit on the board before the child says it", () => {
    const s = opened(DIGIT, "I don't know.");
    const early = step(s, { type: "proposal", at: 3, proposal: { version: PROPOSAL_VERSION, act: "guide", step: "result", level: 0, parts: [{ line: "step.invite", slots: { step: "result" } }], draw: [{ offer: "question.chart" }, { offer: "question.answer" }] } });
    expect(early.refusal?.code).toBe("board_not_code");
    const chart = step(s, { type: "proposal", at: 3, proposal: { version: PROPOSAL_VERSION, act: "guide", step: "result", level: 0, parts: [{ line: "step.invite", slots: { step: "result" } }], draw: [{ offer: "question.chart" }] } });
    expect(chart.refusal).toBeNull();
    expect(chart.effects.find((e) => e.kind === "board")).toMatchObject({ batch: { commands: [{ op: "place_chart", number: "53172", blank: true }] } });
  });

  it("fits the fixed workbook opening in a grade 3 turn, for the longest real wording", () => {
    // The longest: a value question about the hundred thousands, on a two-digit page and question number.
    const r = placeValueTeachingPackage(storedPlaceValue({ variant: "2.2", n0: 785243, place: "hundred thousands", page: 26, question: 12 }));
    if ("held" in r) throw new Error(r.held);
    let s = createSession({ callId: "pv-g3", package: r.package, grade: 3, confirmWorkbook: true });
    s = step(s, { type: "start", at: 0 }).session;
    const open = step(s, { type: "proposal", at: 1, proposal: { version: PROPOSAL_VERSION, act: "open", parts: [{ line: "open.hello" }] } });
    expect(open.refusal).toBeNull();
    const said = open.effects.find((e) => e.kind === "say");
    expect(said).toMatchObject({ text: "Hi, I'm Maya, an AI helper. Let's do page 26, number 12: the value of the hundred thousands digit." });
    expect(speechWords((said as { text: string }).text)).toBeLessThanOrEqual(turnWordLimit({ grade: 3 }));
  });

  it("keeps a child's full-sentence work on this question in scope", () => {
    for (const t of ["8 times 10,000 is 80,000.", "8 × 10,000 = 80,000", "The 8 is in the ten thousands place.", "8 times 1000 is 8000.", "7 times 10,000 is 70,000.", "8 ten thousands is 80,000."]) {
      expect(scopeReason(VALUE as never, t, false), t).toBeNull();
    }
    expect(scopeReason(DIGIT as never, "3 times 1000 is 3000.", false)).toBeNull();
    // Another problem's numbers are still another problem.
    expect(scopeReason(VALUE as never, "6 times 7 is 42.", false)).toBe("changed_problem");
  });

  /** Each child turn answered by code's first fallback, as when the model fails; returns the acts and the session. */
  function stuckCall(p: QuestionPackage, turns: string[]): { acts: string[]; s: Session; last: string } {
    let s = opened(p, turns[0]);
    let at = 3;
    const acts: string[] = [];
    let last = "";
    const answer = () => {
      while (s.expect === "maya" && !s.outcome) {
        const r = step(s, { type: "proposal", at: at++, proposal: fallbacks(s)[0], fallback: true });
        expect(r.refusal).toBeNull();
        s = r.session;
        const said = r.effects.find((e) => e.kind === "say");
        if (said && said.kind === "say") { acts.push(said.act); last = said.text; }
      }
    };
    answer();
    for (const t of turns.slice(1)) {
      if (s.outcome) break;
      s = step(s, { type: "child_turn", at: at++, text: t }).session;
      answer();
    }
    return { acts, s, last };
  }

  it("closes honestly after the easier example and writes the stuck step as a learning event (brief lesson 10)", () => {
    const { acts, s, last } = stuckCall(DIGIT, ["I'm stuck.", "I'm stuck.", "I'm stuck.", "I'm stuck.", "I don't know."]);
    expect(acts).toEqual(["guide", "guide", "guide", "example_step", "close"]);
    expect(acts).not.toContain("give_answer");
    // The close: hard, fine to stop, one next step, from code's lines, with no hint at the answer (3).
    expect(packageLines(DIGIT as OperationPackage).closeUnsolved().flatMap((o) => o.texts)).toContain(last);
    expect(last).not.toMatch(/\b3\b|three/i);
    expect(s.outcome).toMatchObject({ reason: "maya_closed", assistance: "worked_example" });
    expect(learningEvent(s, { parentId: "parent-1", childId: "child-1" })).toMatchObject({
      key: "call:pv", source: "call", question: DIGIT.ref, skill: DIGIT.skill, result: "blank", stuckStep: "result", mistake: null,
    });
  });

  it("writes the digit step as the stuck step of a value question left on it", () => {
    const { acts, s } = stuckCall(VALUE, ["I'm stuck.", "I'm stuck.", "I'm still stuck.", "I'm stuck.", "I'm stuck.", "I still don't know."]);
    expect(acts.slice(-3)).toEqual(["example_step", "example_step", "close"]);
    expect(acts).not.toContain("give_answer");
    expect(learningEvent(s, { parentId: "parent-1", childId: "child-1" })).toMatchObject({ result: "blank", stuckStep: "digit" });
  });
});

