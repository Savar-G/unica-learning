import { describe, expect, it, vi } from "vitest";
import fixtures from "./comparison-fixtures.json";
import { teachingPackage } from ".";
import { deriveComparison } from "./comparison";
import { comparisonAnswer, comparisonProblem, type ComparisonOperation } from "../question-package-comparison";
import { checkQuestionPackage, operationProblem, type OperationPackage, type QuestionPackage } from "../question-package";
import { createSession, heldReason } from "../maya";
import { printedWorkbookQuestion } from "../workbook-maya-operation";
import { createTextSession } from "../maya-text";
import { MAYA_TEACHING_LIMITS } from "./limits";
import { packageLines } from "../maya/lines";

vi.mock("server-only", () => ({}));
const printed = fixtures as unknown as QuestionPackage[];
const offline = { id: "offline", promptVersion: "offline", propose: async () => { throw new Error("offline"); } };
const options = (p: QuestionPackage, conversational = false) => ({ callId: p.id, package: teachingPackage(p), clock: () => 1000,
  model: { ...offline, ...(conversational ? { output: 3 as const } : {}) } });

describe("closed two-sided comparisons", () => {
  it.each(printed)("admits $id without changing the printed item", p => {
    const made = deriveComparison(structuredClone(p));
    expect(made).not.toBeNull();
    expect(checkQuestionPackage(made, undefined, MAYA_TEACHING_LIMITS).ok).toBe(true);
    expect(heldReason(teachingPackage(p))).toBeNull();
    expect(printedWorkbookQuestion(made!)).toEqual(p);
    expect(operationProblem(made!.operation)).not.toBeNull();
    expect(createSession({ callId: p.id, package: teachingPackage(p) }).package).not.toBeNull();
  });

  it("does not accept a supplied result, unsupported event, tie or changed printed key", () => {
    for (const op of [
      { kind: "comparison", context: "same-denominator", operands: [2, 1], denominator: 5, result: true },
      { kind: "comparison", context: "die-events", operands: [4] },
      { kind: "comparison", context: "rectangle-areas", operands: [3, 4, 2, 6] },
    ]) expect(comparisonProblem(op)).not.toBeNull();
    const p = structuredClone(printed[0]); p.text += " Explain a different rectangle.";
    expect(deriveComparison(p)).toBeNull();
    const key = structuredClone(printed[0]);
    const box = key.item!.regions[0]; if (box.kind === "box") box.answer = { type: "text", value: "the same" };
    expect(deriveComparison(key)).toBeNull();
  });

  it.each(printed.flatMap(p => [false, true].map(conversational => ({ p, conversational }))))("completes checked work for $p.id, conversational=$conversational", async ({ p, conversational }) => {
    const pkg = teachingPackage(p) as OperationPackage;
    expect(pkg.operation?.kind).toBe("comparison");
    const op = pkg.operation as ComparisonOperation, replies: string[] = [];
    const text = createTextSession(options(p, conversational));
    await text.start();
    for (const st of pkg.steps) {
      let input: string | null = null;
      if (st.kind === "operate") input = `${st.left} times ${st.right} is ${st.value}`;
      if (st.kind === "comparison-count") input = String(st.value);
      if (st.kind === "comparison") input = `${st.left} is ${st.left > st.right ? "greater" : "less"} than ${st.right}`;
      if (st.kind === "result") input = `The answer is ${comparisonAnswer(op).value}`;
      if (input) { const out = await text.child(input); replies.push(JSON.stringify(out)); }
    }
    expect(text.session.solved, replies.join("\n")).toBe("child");
    expect(text.session.done).toEqual(pkg.steps.filter(st => st.kind !== "result").map(st => st.id));
  });

  it.each(printed)("does not let a final word bypass work for $id", async p => {
    const text = createTextSession(options(p, true)); await text.start();
    const pkg = text.session.package!, answer = comparisonAnswer(pkg.operation as ComparisonOperation).value;
    await text.child(`The answer is ${answer}.`);
    expect(text.session.solved).toBeNull(); expect(text.session.done).toEqual([]);
  });

  it.each(printed)("closes repeated help honestly for $id", async p => {
    const text = createTextSession(options(p, true)); await text.start();
    const outputs: string[] = [];
    for (let i = 0; i < 24 && !text.ended; i++) outputs.push(...(await text.child("I'm stuck.")).say);
    expect(text.session.outcome?.reason, outputs.join("\n")).toBe("maya_closed");
    expect(text.session.done).toEqual([]);
    expect(text.session.assistance).not.toContain("answer_given");
    expect(text.session.turns.some(t => t.act === "accept_answer" || t.act === "give_answer")).toBe(false);
    expect(text.session.exampleShown).toBe(pkgExampleCount(text.session.package!));
  });

  it("checks both rectangle products in order and resumes the same comparison", async () => {
    const p = printed.find(p => p.ref.source === "workbook" && p.ref.page === 9 && p.ref.question === 2)!;
    const opts = options(p, true), text = createTextSession(opts); await text.start();
    await text.child("5 times 6 is 30."); expect(text.session.done).toEqual([]);
    await text.child("7 times 6 is 42."); expect(text.session.done).toEqual(["left-area"]);
    const resumed = createTextSession({ ...opts, resume: await text.saved() });
    await resumed.child("5 times 6 is 30."); expect(resumed.session.done).toEqual(["left-area", "right-area"]);
    await resumed.child("30 is greater than 42."); expect(resumed.session.done).not.toContain("compare");
    await resumed.child("30 is less than 42."); expect(resumed.session.done).toContain("compare");
    await resumed.child("The answer is 7 by 6."); expect(resumed.session.solved).toBe("child");
  });

  it.each(["Maybe 5 is greater than 3?", "Maya said 5 is greater than 3.", "I copied 5 is greater than 3.", "Help, 5 is greater than 3.", "5 is greater than 3. I guess."])("refuses comparison credit for %s", async input => {
    const p = printed.find(p => p.ref.source === "workbook" && p.ref.page === 9 && p.ref.question === 5)!;
    const text = createTextSession(options(p, true)); await text.start(); await text.child(input);
    expect(text.session.done).toEqual([]); expect(text.session.solved).toBeNull(); expect(text.session.ladder.failures).toBe(0);
  });

  it("requires the die's current event before accepting its count", async () => {
    const p = printed.find(p => p.ref.source === "workbook" && p.ref.page === 21)!;
    const text = createTextSession(options(p, true)); await text.start();
    await text.child("1"); expect(text.session.done).toEqual([]);
    await text.child("2, 4, 6, so 3 outcomes."); expect(text.session.done).toEqual(["left-count"]);
    await text.child("3"); expect(text.session.done).toEqual(["left-count"]);
    await text.child("1"); expect(text.session.done).toEqual(["left-count", "right-count"]);
    await text.child("3 is greater than 1."); expect(text.session.done).toContain("compare");
    await text.child("The answer is even."); expect(text.session.solved).toBe("child");
  });

  it("keeps comparison math in the checked code plan when V3 invents a winner", async () => {
    const p = printed[0], opts = options(p, true);
    const text = createTextSession({ ...opts, model: { ...opts.model, propose: async () => ({ version: 3, say: "The first one is larger. The answer is 7 by 6." }) } });
    await text.start(); const out = await text.child("I'm stuck.");
    expect(out.say.join(" ")).not.toContain("The first one is larger");
    expect(out.say.join(" ")).not.toContain("The answer is 7 by 6");
    expect(text.session.solved).toBeNull();
  });

  it.each(printed.filter(p => p.item?.format === "circle"))("preserves the printed circle task for $id", p => {
    const l = packageLines(teachingPackage(p) as OperationPackage);
    for (const o of [...l.help("result"), ...l.writeAnswer(), ...l.writeYours()]) {
      expect(o.texts.some(t => /\bwrite\b/i.test(t))).toBe(false);
    }
    expect(l.help("result").some(o => o.texts.some(t => /circle/i.test(t)))).toBe(true);
    expect([...l.writeAnswer(), ...l.writeYours()].every(o => o.texts.every(t => /circle/i.test(t)))).toBe(true);
  });

  it.each(["COMPARE_FRACTIONS", "COMPARE_AREAS", "COMPARE_DIE"] as const)("confirms a bare final label once for %s", async fixture => {
    const { FIXTURES } = await import("../maya-gate/fixtures");
    const pkg = FIXTURES[fixture] as OperationPackage;
    const text = createTextSession({ callId: fixture, package: pkg, clock: () => 1000, model: { ...offline, output: 3 } });
    await text.start();
    for (const st of pkg.steps) {
      if (st.kind === "operate") await text.child(`${st.left} times ${st.right} is ${st.value}`);
      if (st.kind === "comparison-count") await text.child(String(st.value));
      if (st.kind === "comparison") await text.child(`${st.left} is greater than ${st.right}`);
    }
    const answer = comparisonAnswer(pkg.operation as ComparisonOperation).value;
    const out = await text.child(answer);
    expect(out.say.join(" ")).toContain(answer);
    expect(out.say.join(" ")).toContain("?");
    expect(text.session.wordAsked).toBe(answer); expect(text.session.solved).toBeNull();
    await text.child("Yes."); expect(text.session.solved).toBe("child");
  });

  it.each(["COMPARE_FRACTIONS", "COMPARE_AREAS", "COMPARE_DIE"] as const)("reads the chosen greater number only after its own prompt for %s", async fixture => {
    const { FIXTURES } = await import("../maya-gate/fixtures");
    const pkg = FIXTURES[fixture] as OperationPackage;
    const text = createTextSession({ callId: fixture, package: pkg, clock: () => 1000, model: { ...offline, output: 3 } });
    await text.start();
    const compare = pkg.steps.find(st => st.kind === "comparison")!;
    if (compare.kind !== "comparison") throw new Error("missing comparison");
    // An unasked bare number cannot create comparison work at the opening.
    await text.child(String(compare.left)); expect(text.session.done).not.toContain("compare");
    for (const st of pkg.steps) {
      if (st.kind === "operate") await text.child(`${st.left} times ${st.right} is ${st.value}`);
      if (st.kind === "comparison-count") await text.child(String(st.value));
    }
    // The fraction has no side work. Ask for help to reach its explicit compare invite.
    if (pkg.operation.kind === "comparison" && pkg.operation.context === "same-denominator") await text.child("Help me compare them.");
    expect(text.session.done).not.toContain("compare");
    await text.child(String(compare.right)); expect(text.session.done).not.toContain("compare");
    await text.child(String(compare.left)); expect(text.session.done).toContain("compare");
  });
});

const pkgExampleCount = (pkg: OperationPackage) => pkg.easierExample.steps.length;
