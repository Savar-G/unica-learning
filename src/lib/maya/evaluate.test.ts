import { describe, expect, it, vi } from "vitest";
import { createSession, heldReason, lineOffers, drawOffers, nextActs, step, type Proposal } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import {
  checkQuestionPackage,
  operationProblem,
  workedSteps,
  type Operation,
  type OperationPackage,
  type QuestionPackage,
  type WorkedStep,
} from "@/lib/question-package";
import {
  closeParts, evaluateFrame, evaluateModelSteps, evaluateSteps, partBoards, givesAway, keepsOrder, leftToRight, partCovered, partEquationSaid, withEvaluateExample,
} from "./evaluate";
import { allLineTexts, packageLines, workbookOpening } from "./lines";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "@/lib/maya-teaching/limits";
import { scopeReason } from "./scope";
import { turnWordLimit } from "./session";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { speechWords } from "./speech";
import { teachSteps } from "./fractions";

vi.mock("server-only", () => ({}));

/** A checked evaluate package: the stored easier example is the generator's "1 + 1 = ?" unless one is given. */
function evaluatePackage(expr: string, text = `What is ${expr}?`, easier = "1 + 1"): QuestionPackage {
  const operation: Operation = { kind: "evaluate", operands: [expr] };
  const steps = workedSteps(operation);
  const result = steps.at(-1)!;
  const value = result.kind === "result" ? result.value : { type: "number" as const, value: 0 };
  const exampleOp: Operation = { kind: "evaluate", operands: [easier] };
  const exampleSteps = workedSteps(exampleOp);
  const exampleResult = exampleSteps.at(-1)!;
  const pkg: QuestionPackage = {
    id: `test-${expr}`,
    ref: { source: "workbook", workbookId: "evaluate-test", page: 1, question: 1 },
    templateId: null,
    text,
    answer: { value, accepted: [], unit: null },
    operation,
    steps,
    skill: { standard: "5.9", skills: ["5.9-multiply-tens"] },
    level: 16,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: (value.type === "number" ? value.value : 0) + 10 }, cause: "test", description: "A wrong answer for the check", step: null }],
    easierExample: { text: `${easier} = ?`, operation: exampleOp, answer: exampleResult.kind === "result" ? exampleResult.value : value, steps: exampleSteps },
  };
  const check = checkQuestionPackage(pkg);
  if (!check.ok) throw new Error(check.reason);
  return pkg;
}

const op = (p: QuestionPackage) => p as OperationPackage;
/** A checked-shape evaluate package for an operation, with a same-shape easier example and a wrong answer. */
function withChain(operation: Operation, answer: number): QuestionPackage {
  const easier: Operation = { kind: "evaluate", operands: ["97 + 10 + 1"] };
  return {
    id: "chain", ref: { source: "workbook", workbookId: "w", page: 1, question: 1 }, templateId: null, text: `${operation.operands[0]} = ?`,
    answer: { value: { type: "number", value: answer }, accepted: [], unit: null }, operation, steps: workedSteps(operation),
    skill: { standard: "5.1", skills: ["5.1-place-value-million"] }, level: 16, difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: answer + 1 }, cause: "calculation", description: "Gives a different result.", step: null }],
    easierExample: { text: "97 + 10 + 1 = ?", operation: easier, answer: { type: "number", value: 108 }, steps: workedSteps(easier) },
  };
}
const operate = (p: OperationPackage, i: number) => p.steps.filter((s): s is Extract<WorkedStep, { kind: "operate" }> => s.kind === "operate")[i];

/** A guide proposal for the ladder's step, with the model's reading of one right step answer. */
const guide = (at: string, value: number, stepId: string): Proposal => ({
  version: 2, act: "guide", step: at, level: 0, parts: [{ line: "step.invite", slots: { step: at } }],
  reading: { start: "has_work", answers: [{ value: { type: "number", value }, step: stepId, verdict: "right" }] },
} as Proposal);

/** A started session after Maya's opening. */
function opened(pkg: OperationPackage) {
  const s = step(createSession({ callId: `part-${pkg.id}`, package: pkg }), { type: "start", at: 0 }).session;
  return step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "assess.ask" }] } as Proposal }).session;
}

/** The child's turns, each read as a right answer for a step, then the last one: its refusal code and the steps done. */
function partTurn(pkg: OperationPackage, before: [string, number, string, string][], text: string, value: number, stepId: string, next: string) {
  let s = opened(pkg);
  let at = 2000;
  for (const [t, v, id, n] of before) {
    s = step(s, { type: "child_turn", text: t, at: at++ }).session;
    s = step(s, { type: "proposal", at: at++, proposal: guide(n, v, id) }).session;
  }
  s = step(s, { type: "child_turn", text, at: at++ }).session;
  const r = step(s, { type: "proposal", at: at++, proposal: guide(next, value, stepId) });
  return { refusal: r.refusal?.code ?? null, done: r.session.done };
}
const ids = (steps: readonly WorkedStep[]) => steps.map((s) => s.id);

describe("evaluate parts (Wave A, A2)", () => {
  it("works a two-part expression part by part: each part's columns, then the part; the last part's columns, then the result", () => {
    const pkg = op(FIXTURES.EV_TWO);
    expect(ids(evaluateSteps(pkg)!)).toEqual([
      "e1.r1-ones", "e1.r1-tens", "e1.r1-hundreds", "e1.r1-thousands", "e1",
      "e2.r1-ones", "e2.r1-tens", "e2.r1-hundreds", "e2",
      "e3.ones", "e3.tens", "e3.hundreds", "e3.thousands",
    ]);
    // The same steps teach and check (fractions.ts teachSteps, the model's steps).
    expect(ids(teachSteps(pkg))).toEqual(ids(evaluateSteps(pkg)!));
    expect(evaluateModelSteps(pkg)!.map((s) => s.id)).toEqual(ids(evaluateSteps(pkg)!));
    expect(evaluateModelSteps(pkg)![1].text).toBe("7 × 640: Multiply the tens: 4 × 7 = 28. Write 8 and carry 2.");
  });

  it("puts the number with more digits that are not 0 on top of a product, and lays out each part's columns", () => {
    expect(partBoards(op(FIXTURES.EV_TWO))).toEqual([
      { partId: "e1", id: "part-e1", operation: "multiply", operands: [640, 7], expr: "7 × 640", after: [] },
      { partId: "e2", id: "part-e2", operation: "multiply", operands: [30, 7], expr: "7 × 30", after: ["e1"] },
      { partId: "e3", id: "part-e3", operation: "add", operands: [4480, 210], expr: "4480 + 210", after: ["e1", "e2"] },
    ]);
    expect(partBoards(op(evaluatePackage("10 × 90 − 220"))).map((b) => b.operands)).toEqual([[90, 10], [900, 220]]);
    // A divide part has no board layout yet.
    expect(partBoards(op(FIXTURES.EV_MISSING)).map((b) => b.partId)).toEqual(["e1"]);
  });

  it("says why each part comes now, in code's words", () => {
    const lines = packageLines(op(FIXTURES.EV_TWO));
    const invite = (id: string) => lines.help(id).find((o) => o.line === "step.invite")!;
    expect(invite("e1.r1-ones").key).toBe("part.first");
    expect(invite("e1.r1-ones").texts[0]).toBe("Multiply before you add. So start with 7 × 640. What is it?");
    expect(invite("e2.r1-ones").key).toBe("part.next");
    expect(invite("e2.r1-ones").texts[0]).toBe("Multiply before you add. Next, 7 × 30. What is it?");
    expect(invite("e3.ones").key).toBe("part.last");
    expect(invite("e3.ones").texts[0]).toBe("Now we have 4480 + 210. What is it?");
    expect(lines.help("e1.r1-ones").find((o) => o.line === "step.order")!.texts[0]).toBe("Multiply before you add. So 7 × 640 comes first.");
    // A later column keeps the column's own invite; every column keeps the existing column lines.
    expect(invite("e1.r1-tens").key).toBe("step.invite");
    expect(lines.help("e1.r1-tens").map((o) => o.key)).toEqual(["step.invite", "point.multiply", "operation.multiply", "step.show"]);
    expect(lines.help("e3.ones").map((o) => o.key)).toEqual(["part.last", "point.add", "operation.add", "step.show"]);
    // The part itself has no help of its own: it is done with its columns.
    expect(lines.help("e1")).toEqual([]);
    expect(lines.rightStep("e1")[0].texts[0]).toBe("Yes! 7 × 640 = 4480.");
    expect(lines.rightStep("e1.r1-tens")[0].texts[0]).toBe("Yes! 4 × 7 = 28.");
    expect(packageLines(op(evaluatePackage("995 × 9 − 60"))).help("e1.r1-ones").find((o) => o.line === "step.invite")!.texts[0])
      .toBe("Multiply before you subtract. So start with 995 × 9. What is it?");
    expect(packageLines(op(evaluatePackage("(8150 − 500) ÷ 9"))).help("e1.ones").find((o) => o.line === "step.invite")!.texts[0])
      .toBe("Work inside the brackets first. So start with 8150 − 500. What is it?");
  });

  it("frames a missing number only when the printed text matches the stored expression exactly", () => {
    const missing = op(FIXTURES.EV_MISSING);
    expect(evaluateFrame(missing)).toEqual({ verb: "divide", equation: "8 × ? = 6960", printed: "8 × ? = 7360 − 400" });
    const lines = packageLines(missing);
    // Maya names the question as the page prints it; the lines that say an equation keep the stored expression.
    expect(lines.question()[0].texts[0]).toBe("Today we're working on 8 × ? = 7360 − 400.");
    expect(lines.answerRight()[0].texts[0]).toBe("Yes! (7360 − 400) ÷ 8 = 870.");
    expect(lines.help("e1.ones").find((o) => o.line === "step.invite")!.texts[0]).toBe("Work out the side with only numbers first. So start with 7360 − 400. What is it?");
    expect(lines.help("e2.thousands").find((o) => o.line === "step.invite")!.texts[0]).toBe("Now 8 × ? = 6960. Divide to find it: 6960 ÷ 8. What is it?");
    expect(evaluateFrame(op(evaluatePackage("(8150 − 500) ÷ 9", "? × 9 = 8150 − 500")))).toEqual({ verb: "divide", equation: "? × 9 = 7650", printed: "? × 9 = 8150 − 500" });
    expect(evaluateFrame(op(evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100")))).toEqual({ verb: "subtract", equation: "8070 − ? = 8000", printed: "8070 − ? = 80 × 100" });
    // A ? code cannot match is held; a ? that ends a question is no blank.
    expect(heldReason(evaluatePackage("(8150 − 500) ÷ 9", "9 × ? = 8150 + 500"))).toBe("Maya cannot read this missing-number question yet");
    expect(evaluateFrame(op(evaluatePackage("(8150 − 500) ÷ 9")))).toBeNull();
  });

  it("holds what it cannot teach, and says why", () => {
    expect(heldReason(evaluatePackage("(8763 + 30) ÷ 977", "977 × ? = 8763 + 30"))).toBe("Maya cannot teach a divide part with a 3-digit divisor in evaluate questions yet");
    // A part above Maya's own limits (999,999) is held.
    expect(heldReason(evaluatePackage("999 × 9999 + 1"))).toMatch(/^Maya cannot teach a part with numbers code does not check yet/);
    expect(heldReason(evaluatePackage("2.5 × 4 + 1"))).toBe("Maya teaches evaluate questions only with whole numbers yet");
    expect(heldReason(evaluatePackage("3 − 5 + 4", undefined, "2 + 2"))).toBe("Maya teaches evaluate questions only with whole numbers yet");
    const unknown: QuestionPackage = { ...evaluatePackage("3 + 4"), operation: { kind: "evaluate", operands: ["3n + 2"], values: { n: 4 } } };
    unknown.steps = workedSteps(unknown.operation!);
    unknown.answer = { value: { type: "number", value: 14 }, accepted: [], unit: null };
    expect(checkQuestionPackage(unknown).ok).toBe(true);
    expect(heldReason(unknown)).toBe("Maya teaches evaluate questions only with no unknowns yet");
    for (const expr of ["9 × 880 + 9 × 40", "995 × 9 − 60", "10 × 90 − 220", "30 + 4 × 3", "50 × 160 + 100", "20 × 350 + 400", "8 × 80 − 120", "901 × 9 + 60", "5 × 350 − 870", "6 × 412 + 8 × 385"]) {
      expect(heldReason(evaluatePackage(expr)), expr).toBeNull();
    }
    for (const [expr, text] of [["(8150 − 500) ÷ 9", "9 × ? = 8150 − 500"], ["(8213 − 50) ÷ 9", "? × 9 = 8213 − 50"], ["8070 − (80 × 100)", "8070 − ? = 80 × 100"]]) {
      expect(heldReason(evaluatePackage(expr, text)), expr).toBeNull();
    }
  });

  it("works an easier example of the same shape: the stored one when it is, else one code makes and checks", () => {
    expect(withEvaluateExample(op(FIXTURES.EV_TWO))).toBe(FIXTURES.EV_TWO);
    const cases: [string, string][] = [
      ["9 × 880 + 9 × 40", "8 × 8 + 8 × 4"],
      ["(8150 − 500) ÷ 9", "(8 − 5) ÷ 3"],
      ["995 × 9 − 60", "10 × 8 − 6"],
      ["10 × 90 − 220", "2 × 9 − 2"],
      ["30 + 4 × 3", "5 + 2 × 2"],
      ["8070 − (80 × 100)", "8 − (3 × 2)"],
      ["6 × 412 + 8 × 385", "5 × 4 + 7 × 3"],
      ["5 × 350 − 870", "4 × 3 − 8"],
    ];
    for (const [expr, easier] of cases) {
      const pkg = op(evaluatePackage(expr));
      const shown = withEvaluateExample(pkg);
      expect(shown.easierExample.operation, expr).toEqual({ kind: "evaluate", operands: [easier] });
      expect(shown.easierExample.steps).toEqual(workedSteps(shown.easierExample.operation));
      expect(checkQuestionPackage(shown).ok).toBe(true);
      // No giveaway (lesson 11): not the answer times a power of 10, not its first digits, none of the question's numbers.
      const exValue = (shown.easierExample.answer as { value: number }).value;
      const value = (pkg.answer.value as { value: number }).value;
      expect(givesAway(easier, exValue, expr, value), expr).toBe(false);
      expect(keepsOrder(easier, exValue, expr, value), expr).toBe(true);
      // The stored package is not changed.
      expect(pkg.easierExample.operation).toEqual({ kind: "evaluate", operands: ["1 + 1"] });
      // The session works the made example, and its lines are among the lines code can say.
      const s = createSession({ callId: `ex-${expr}`, package: pkg });
      expect(s.package!.easierExample.operation).toEqual(shown.easierExample.operation);
      const texts = allLineTexts(pkg);
      expect(texts).toContain(`Let's try an easier one first: ${easier}.`);
    }
  });

  it("counts a part done with its result, and the part done with all of its columns", () => {
    const pkg = op(FIXTURES.EV_TWO);
    expect(closeParts(pkg, ["e1"]).sort()).toEqual(["e1", "e1.r1-hundreds", "e1.r1-ones", "e1.r1-tens", "e1.r1-thousands"]);
    expect(closeParts(pkg, ["e2.r1-ones", "e2.r1-tens", "e2.r1-hundreds"])).toContain("e2");
    expect(closeParts(pkg, ["e2.r1-ones", "e2.r1-tens"])).not.toContain("e2");
    // The last part has no step of its own: its result is the question's answer.
    expect(closeParts(pkg, ["e3.ones", "e3.tens", "e3.hundreds", "e3.thousands"])).not.toContain("e3");
    const plain = op(FIXTURES.A);
    expect(closeParts(plain, ["ones"])).toEqual(["ones"]);
  });

  it("credits a part's result with the #698 step rules: a whole-turn template, only while the child is on that part", () => {
    const pkg = op(FIXTURES.EV_TWO);
    for (const text of ["4480", "It's 4480.", "I got 4480", "So 4480.", "7 times 640 is 4480", "640 times 7 is 4480.", "7 × 640 = 4480", "seven times six hundred forty equals four thousand four hundred eighty"]) {
      const r = partTurn(pkg, [], text, 4480, "e1", "e2.r1-ones");
      expect(r.refusal, text).toBeNull();
      expect(r.done, text).toContain("e1");
    }
    for (const text of ["4480?", "I think it's 4480.", "4480 because 7 times 640 is 4480.", "7 plus 640 is 4480", "My brother said 4480.", "I wrote 4480 in the thousands."]) {
      // Refused (not a whole-turn template, or for "7 plus 640" another problem): no credit.
      const r = partTurn(pkg, [], text, 4480, "e1", "e2.r1-ones");
      expect(r.refusal, text).toMatch(/^(?:answer_not_committed|scope_first)$/);
      expect(r.done, text).not.toContain("e1");
    }
    // Part 2 only once part 1 is done: no part 2 credit while the child is on part 1.
    expect(partTurn(pkg, [], "210", 210, "e2", "e1.r1-ones").refusal).toBe("answer_not_committed");
    expect(partTurn(pkg, [["4480", 4480, "e1", "e2.r1-ones"]], "210", 210, "e2", "e3.ones").done).toContain("e2");
    expect(partTurn(pkg, [["4480", 4480, "e1", "e2.r1-ones"]], "30 times 7 is 210", 210, "e2", "e3.ones").done).toContain("e2");
    // Subtraction keeps its order; the operands of a product may come in either order.
    expect(partEquationSaid("8070 minus 8000 is 70", operate(op(evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100")), 1))).toBe(true);
    expect(partEquationSaid("8000 minus 8070 is 70", operate(op(evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100")), 1))).toBe(false);
    expect(partEquationSaid("100 times 80 is 8000", operate(op(evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100")), 0))).toBe(true);
  });

  it("confirms a part's result like a column's total: one number and filler, then a plain yes credits it", () => {
    const pkg = op(FIXTURES.EV_TWO);
    let s = opened(pkg);
    s = step(s, { type: "child_turn", text: "Is it 4480?", at: 3000 }).session;
    expect(nextActs(s).acts).toContain("confirm");
    const asked = step(s, { type: "proposal", at: 4000, proposal: { version: 2, act: "confirm", parts: [{ line: "confirm.heard", slots: { heard: "4480" } }] } });
    expect(asked.refusal ?? null).toBeNull();
    s = step(asked.session, { type: "child_turn", text: "yes", at: 5000 }).session;
    const yes = step(s, { type: "proposal", at: 6000, proposal: guide("e2.r1-ones", 4480, "e1") });
    expect(yes.refusal ?? null).toBeNull();
    expect(yes.session.done).toContain("e1");
    // A part's result with a column word gets no step confirm.
    const word = step(opened(pkg), { type: "child_turn", text: "4480 in the thousands", at: 3000 }).session;
    expect(nextActs(word).acts).not.toContain("confirm");
  });

  it("offers the columns of the part the help is on, from code's numbers", () => {
    const s = createSession({ callId: "board", package: FIXTURES.EV_TWO });
    const after = step(s, { type: "start", at: 0 }).session;
    const opened = step(after, { type: "proposal", proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "assess.ask" }] } as Proposal, at: 1000 });
    expect(opened.refusal ?? null).toBeNull();
    const open = opened.session;
    const turn = step(open, { type: "child_turn", text: "I don't know.", at: 2000 }).session;
    const draws = drawOffers(turn).guide ?? [];
    expect(draws.map((d) => d.id)).toContain("part.columns.e1");
    // Never a later part: its numbers come from the parts before it (4480 + 210 would give 7 × 640 away).
    expect(draws.map((d) => d.id).filter((id) => id.startsWith("part."))).toEqual(["part.columns.e1"]);
    expect(draws.find((d) => d.id === "part.columns.e1")!.shows).toBe("7 × 640 in columns");
    const lines = lineOffers(turn).guide ?? [];
    expect(lines.find((o) => o.slots.step === "e1.r1-ones" && o.line === "step.invite")!.texts[0]).toBe("Multiply before you add. So start with 7 × 640. What is it?");
  });

  it("never says a column is right when the child gave only its part's result", () => {
    const pkg = op(FIXTURES.EV_TWO);
    const byValue = closeParts(pkg, ["e1"]);
    expect(partCovered(pkg, byValue, "e1.r1-tens")).toBe(true);
    expect(partCovered(pkg, byValue, "e1")).toBe(false);
    const byColumns = closeParts(pkg, ["e1.r1-ones", "e1.r1-tens", "e1.r1-hundreds", "e1.r1-thousands"]);
    expect(partCovered(pkg, byColumns, "e1.r1-tens")).toBe(false);
    // Mixed: the ones done by the child, then the part's result.
    const mixed = closeParts(pkg, ["e1.r1-ones", "e1"]);
    expect(partCovered(pkg, mixed, "e1.r1-ones")).toBe(false);
    expect(partCovered(pkg, mixed, "e1.r1-hundreds")).toBe(true);
    // After the answer, Maya asks about a part, never one column of a part.
    expect(packageLines(pkg).explain().map((o) => o.texts[0])).toEqual(["How did you get 7 × 640?", "How did you get 7 × 30?"]);
  });

  const OPENING_OVER = ["6 × 412 + 8 × 385"];
  it("fits every evaluate line, and the opening, in the 25-word turn of grade 3, at the longest wording", async () => {
    const limit = turnWordLimit({ grade: 3 });
    expect(limit).toBe(25);
    const shapes: QuestionPackage[] = [
      FIXTURES.EV_TWO, FIXTURES.EV_STORY, FIXTURES.EV_MISSING,
      evaluatePackage("9 × 880 + 9 × 40"), evaluatePackage("6 × 412 + 8 × 385"), evaluatePackage("995 × 9 − 60"),
      evaluatePackage("(8150 − 500) ÷ 9", "9 × ? = 8150 − 500"), evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100"),
      evaluatePackage("20 × 350 + 400"), evaluatePackage("30 + 4 × 3"),
    ];
    const longest = (xs: string[]) => xs.reduce((a, b) => (speechWords(b) > speechWords(a) ? b : a), "");
    for (const raw of shapes) {
      const pkg = { ...op(raw), ref: { source: "workbook" as const, workbookId: "w", page: 18, question: 3 } };
      const l = packageLines(pkg);
      const shown = withEvaluateExample(pkg);
      // The new lines: each part's first column (its question, the lead on every column line, its order), the easier
      // example's parts, and the lines that name a missing-number question as printed.
      const firsts = (evaluateSteps(pkg) ?? []).filter((st, i, all) => st.id.includes(".") && (i === 0 || !all[i - 1].id.startsWith(st.id.split(".")[0] + ".")));
      const offers = [
        ...firsts.flatMap((st) => l.help(st.id)), ...l.explain(), ...shown.easierExample.steps.flatMap((st) => l.exampleStep(st.id)),
        ...l.question(), ...l.tryTarget(), ...l.redirect(), ...l.closeSolved("child"), ...l.closeSolved("maya"),
      ];
      expect(firsts.length).toBe(withEvaluateExample(pkg).steps.filter((st) => st.kind === "operate").length);
      for (const o of offers) {
        const text = longest(o.texts);
        expect(speechWords(text), `${pkg.id} ${o.key}: ${text}`).toBeLessThanOrEqual(limit);
      }
      // The workbook opening, with the question as the page prints it. The fixed opening (WORKBOOK_OPENING, not an
      // evaluate line) passes 25 words for any question with two 4-digit numbers, of every kind ("5957 − 1699" too):
      // a known limit of that line, reported, not changed here.
      const book = workbookOpening(pkg)!;
      if (!OPENING_OVER.includes(raw.operation!.kind === "evaluate" ? raw.operation!.operands[0] as string : "")) expect(speechWords(book), book).toBeLessThanOrEqual(limit);
      else expect(speechWords(book)).toBeGreaterThan(limit);
      // The opening turn as the session assembles it at grade 3 (hello and the question), for many wording seeds.
      for (let seed = 1; seed <= 12; seed++) {
        const script = scenarioModel();
        const t = createTextSession({ callId: `open-${pkg.id}-${seed}`, package: pkg, grade: 3, model: script, random: seed, clock: () => 1000 });
        script.next([{ act: "open" }], undefined);
        const out = await t.start();
        expect(out.say.length, `${pkg.id} seed ${seed}`).toBeGreaterThan(0);
        for (const text of out.say) expect(speechWords(text), `${pkg.id} seed ${seed}: ${text}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("allows the missing-number frame's own relation in the scope check (review of #734)", () => {
    const missing = op(FIXTURES.EV_MISSING);
    expect(scopeReason(missing, "8 times 870 is 6960.", false)).toBeNull();
    expect(scopeReason(missing, "870 times 8 is 6960.", false)).toBeNull();
    expect(scopeReason(missing, "8 times 871 is 6968.", false)).toBe("changed_problem");
    const minus = op(evaluatePackage("8070 − (80 × 100)", "8070 − ? = 80 × 100"));
    expect(scopeReason(minus, "8070 minus 70 is 8000.", false)).toBeNull();
    expect(scopeReason(minus, "8070 minus 71 is 7999.", false)).toBe("changed_problem");
    // With no frame there is no such relation.
    expect(scopeReason(op(evaluatePackage("8070 − (80 × 100)")), "8070 minus 70 is 8000.", false)).toBe("changed_problem");
    expect(scopeReason(missing, "8 times 870 is 6960, so 870.", false)).toBeNull();
  });

  it("credits an addition part that is not last before its ones column (review of #734)", () => {
    const pkg = op(FIXTURES.EV_ADD_FIRST);
    const next = evaluateSteps(pkg)!.find((st) => st.id.startsWith("e2."))!.id;
    for (const text of ["85", "47 plus 38 is 85", "It's 85."]) expect(partTurn(pkg, [], text, 85, "e1", next).done, text).toContain("e1");
    // The ones column keeps its own total.
    expect(partTurn(pkg, [], "15", 15, "e1.ones", "e1.tens").done).toContain("e1.ones");
    // "Is it 85?" gets the step confirm, and a plain yes credits the part.
    let s = opened(pkg);
    s = step(s, { type: "child_turn", text: "Is it 85?", at: 3000 }).session;
    expect(nextActs(s).acts).toContain("confirm");
    s = step(s, { type: "proposal", at: 4000, proposal: { version: 2, act: "confirm", parts: [{ line: "confirm.heard", slots: { heard: "85" } }] } }).session;
    s = step(s, { type: "child_turn", text: "yes", at: 5000 }).session;
    const yes = step(s, { type: "proposal", at: 6000, proposal: guide(next, 85, "e1") });
    expect(yes.refusal ?? null).toBeNull();
    expect(yes.session.done).toContain("e1");
  });

  it("gives no part credit for a value Maya showed at H3 on one of the part's columns (review of #734)", () => {
    const pkg = op(evaluatePackage("50 × 160 + 100"));
    expect(evaluateSteps(pkg)!.map((st) => st.id).slice(0, 5)).toEqual(["e1.r2-ones", "e1.r2-tens", "e1.r2-hundreds", "e1.r2", "e1"]);
    let s = opened(pkg);
    let at = 2000;
    for (const [text, value, id, nextId] of [["0.", 0, "e1.r2-ones", "e1.r2-tens"], ["30.", 30, "e1.r2-tens", "e1.r2-hundreds"], ["8.", 8, "e1.r2-hundreds", "e1.r2"]] as const) {
      s = step(s, { type: "child_turn", text, at: at++ }).session;
      const r = step(s, { type: "proposal", at: at++, proposal: guide(nextId, value, id) });
      expect(r.refusal ?? null, text).toBeNull();
      s = r.session;
    }
    s = step(s, { type: "child_turn", text: "Show me.", at: at++ }).session;
    const shown = step(s, { type: "proposal", at: at++, proposal: { version: 2, act: "guide", step: "e1.r2", level: 3, parts: [{ line: "step.show", slots: { step: "e1.r2" } }], reading: { help: "show" } } as Proposal });
    expect(shown.refusal ?? null).toBeNull();
    s = step(shown.session, { type: "child_turn", text: "8000.", at: at++ }).session;
    const copy = step(s, { type: "proposal", at: at++, proposal: guide("e2.ones", 8000, "e1") });
    expect(copy.refusal?.code).toBe("answer_not_committed");
    expect(copy.session.done).not.toContain("e1");
  });

  it("holds \"(6 + 4) ÷ 2\" rather than make \"(5 + 3) ÷ 1\": the answer as a number, and ÷ 1 (round 3)", () => {
    // No smaller example of its shape is free of the question's own numbers, its answer and a trivial operand.
    expect(heldReason(evaluatePackage("(6 + 4) ÷ 2"))).toEqual(expect.stringMatching(/no easier example of the same shape/));
  });

  it("makes \"5 × 5 − 5\" for \"7 × 8 − 50\", not \"6 × 6 − 5\" with the answer as both factors (round 3)", () => {
    expect(withEvaluateExample(op(evaluatePackage("7 × 8 − 50"))).easierExample.operation).toEqual({ kind: "evaluate", operands: ["5 × 5 − 5"] });
  });

  it("never puts the question's answer, or a trivial operand, in an easier example (round 3)", () => {
    expect(givesAway("(5 + 3) ÷ 1", 8, "(6 + 4) ÷ 2", 5)).toBe(true);
    expect(givesAway("6 × 6 − 5", 31, "7 × 8 − 50", 6)).toBe(true);
    expect(givesAway("5 × 5 − 5", 20, "7 × 8 − 50", 6)).toBe(false);
    // A trivial operand anywhere: ÷ 1, × 1 on either side, + 0 on either side, − 0.
    for (const trivial of ["(5 + 3) ÷ 1", "4 + 3 × 1", "1 × 4 + 3", "4 + 0 × 3", "(4 + 0) × 3", "0 + 4 × 3", "4 × 3 − 0"]) {
      expect(givesAway(trivial, 1000, "9 × 880 + 9 × 40", 8280), trivial).toBe(true);
    }
    // A 1 or a 0 inside a longer number is not one.
    expect(givesAway("5 × 12 + 4 × 10", 100, "9 × 880 + 9 × 40", 8280)).toBe(false);
    expect(givesAway("21 × 3 − 10", 53, "9 × 880 + 9 × 40", 8280)).toBe(false);
  });

  it("holds \"7 + 2 × 3\" rather than make \"6 + 1 × 1\", which is 7 both ways (round 3)", () => {
    // Worked left to right and worked right, "6 + 1 × 1" is 7: it shows nothing about the order. Every smaller example
    // of the shape has × 1, × 0 or one of the question's own numbers, so Maya holds the question.
    expect(heldReason(evaluatePackage("7 + 2 × 3"))).toEqual(expect.stringMatching(/no easier example of the same shape/));
  });

  it("keeps the order-of-operations lesson in the easier example (round 3)", () => {
    expect(leftToRight("7 + 2 × 3")).toBe(27);
    expect(leftToRight("8070 − (80 × 100)")).toBe(799000);
    expect(keepsOrder("6 + 1 × 1", 7, "7 + 2 × 3", 13)).toBe(false);
    expect(keepsOrder("5 + 2 × 2", 9, "30 + 4 × 3", 42)).toBe(true);
    // A question whose order changes nothing asks nothing of its example.
    expect(keepsOrder("4 × 3 − 8", 4, "5 × 350 − 870", 880)).toBe(true);
  });

  it("refuses an easier example that gives the answer away (lesson 11)", () => {
    expect(givesAway("5 × 35 − 87", 88, "5 × 350 − 870", 880)).toBe(true);
    expect(givesAway("1700 + 300", 2000, "17000 + 3000", 20000)).toBe(true);
    expect(givesAway("9412 + 300 − 10", 9702, "941231 + 30000 − 1000", 970231)).toBe(true);
    expect(givesAway("2 × 30 + 2 × 4", 68, "7 × 640 + 7 × 30", 4690)).toBe(true);
    expect(givesAway("8 × 8 + 8 × 4", 96, "9 × 880 + 9 × 40", 8280)).toBe(false);
    // A stored example that gives the answer away is replaced by one code makes.
    const story = op(evaluatePackage("5 × 350 − 870", "What is 5 × 350 − 870?", "5 × 35 − 87"));
    expect(withEvaluateExample(story).easierExample.operation).toEqual({ kind: "evaluate", operands: ["4 × 3 − 8"] });
    // Every fixture's example passes.
    for (const f of [FIXTURES.EV_TWO, FIXTURES.EV_STORY, FIXTURES.EV_MISSING, FIXTURES.EV_ADD_FIRST]) {
      const ex = f.easierExample!;
      expect(givesAway((ex.operation as { operands: string[] }).operands[0], (ex.answer as { value: number }).value, (f.operation as { operands: string[] }).operands[0], (f.answer!.value as { value: number }).value), f.id).toBe(false);
    }
  });

  it("teaches big-number parts and expressions under Maya's limits only, passed explicitly (#724)", () => {
    // Parts above 9999 work under Maya's part limits: the stored package passes today's check as it is.
    for (const expr of ["80 × 800 − 100", "(62000 + 300) ÷ 70", "(63400 + 600) ÷ 80"]) expect(heldReason(evaluatePackage(expr)), expr).toBeNull();
    // A chain with a 6-digit number: today's check refuses it; Maya's adapter-made package is checked with her limits.
    const chain: Operation = { kind: "evaluate", operands: ["976746 + 10000 + 1000"] };
    expect(operationProblem(chain)).toMatch(/up to 99999/);
    expect(operationProblem(chain, MAYA_TEACHING_LIMITS)).toBeNull();
    expect(workedSteps(chain).map((st) => (st.kind === "operate" ? st.value : null))).toEqual([986746, 987746, null]);
    const made = { ...withChain(chain, 987746), operationSource: TEACHING_SOURCE } as QuestionPackage;
    expect(checkQuestionPackage(made).ok).toBe(false);
    expect(checkQuestionPackage(made, undefined, MAYA_TEACHING_LIMITS).ok).toBe(true);
    const s = createSession({ callId: "chain", package: made });
    expect(s.contentProblem).toBeNull();
    expect(s.package!.easierExample.operation.kind).toBe("evaluate");
    // Unmarked, the same package keeps today's limits and is held.
    expect(heldReason({ ...made, operationSource: undefined })).toMatch(/up to 99999/);
    // Past Maya's limits, decimals and unknowns stay refused even with them.
    expect(operationProblem({ kind: "evaluate", operands: ["999999 + 1"] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "evaluate", operands: ["1000000 − 1"] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "evaluate", operands: ["123456.5 + 1"] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "evaluate", operands: ["123456 + n"], values: { n: 4 } }, MAYA_TEACHING_LIMITS)).not.toBeNull();
  });

  it("keeps the default expression limits unchanged (regression, #724)", () => {
    // Today's limits: numbers to 99999.999, refused above, with no limits passed.
    expect(operationProblem({ kind: "evaluate", operands: ["99999 + 1"] })).toBeNull();
    expect(operationProblem({ kind: "evaluate", operands: ["100000 + 1"] })).toBe("code checks expressions only with numbers up to 99999.999, with at most 3 decimal places");
    expect(operationProblem({ kind: "evaluate", operands: ["2.5 × 4 + 1"] })).toBeNull();
    expect(operationProblem({ kind: "evaluate", operands: ["3n + 2"], values: { n: 100000 } })).not.toBeNull();
    expect(operationProblem({ kind: "solve", operands: ["x + 100000 = 100005"] })).not.toBeNull();
    expect(operationProblem({ kind: "solve", operands: ["x + 100000 = 100005"] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
    // The worked steps of an expression today's check passes are what they were.
    expect(workedSteps({ kind: "evaluate", operands: ["9 × 880 + 9 × 40"] })).toEqual([
      { id: "e1", kind: "operate", rule: "multiply-divide", op: "×", left: 9, right: 880, value: 7920, rest: "7920 + 9 × 40" },
      { id: "e2", kind: "operate", rule: "multiply-divide", op: "×", left: 9, right: 40, value: 360, rest: "7920 + 360" },
      { id: "e3", kind: "operate", rule: "add-subtract", op: "+", left: 7920, right: 360, value: 8280, rest: "8280" },
      { id: "result", kind: "result", value: { type: "number", value: 8280 } },
    ]);
    expect(workedSteps({ kind: "evaluate", operands: ["7 × 640 + 7 × 30"] })).toEqual(FIXTURES.EV_TWO.steps);
  });

  it("leaves the generator's checks as they are", () => {
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
    expect(operationProblem({ kind: "divide", operands: [8793, 977] })).not.toBeNull();
    expect(checkQuestionPackage(FIXTURES.EV_TWO).ok).toBe(true);
    // The stored steps stay the algebra's operate steps: Maya's part steps are hers only.
    expect(FIXTURES.EV_TWO.steps.map((s) => s.kind)).toEqual(["operate", "operate", "operate", "result"]);
  });
});
