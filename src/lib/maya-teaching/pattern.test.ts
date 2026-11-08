import { describe, expect, it, vi } from "vitest";
import { teachingPackage } from ".";
import { derivePattern } from "./pattern";
import { printedPattern } from "./pattern-fixtures";
import { createSession, heldReason, learningEvent, scopeReason, teachSteps, speechWords } from "@/lib/maya";
import { packageLines, workbookOpening } from "@/lib/maya/lines";
import { exampleGivesAway, patternOf, patternRows, readPattern, type Pattern, type PatternForm } from "@/lib/maya/pattern";
import { operationProblem, workedSteps, type OperationPackage, type QuestionPackage } from "@/lib/question-package";
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";
import { PATTERN_BEHAVIOURS, PATTERN_FIXTURES } from "@/lib/maya-gate/pattern-cases";
import { runBehaviour, judge, memoryTraceStore, scenarioModel, GATE_T0, CHILD_MS } from "@/lib/maya-gate/gate";
import { createTextSession } from "@/lib/maya-text";

vi.mock("server-only", () => ({}));
const forms: PatternForm[] = ["missing3", "missing9", "term4", "plant3", "pair", "days8"];
const make = (form: PatternForm) => printedPattern(form, 36, 9);

describe("closed pattern derivation", () => {
  it.each(forms)("derives %s without changing a printed field or the stored object", form => {
    const stored = make(form), before = structuredClone(stored);
    const p = teachingPackage(stored) as OperationPackage;
    expect(p.operation.kind).toBe("evaluate");
    expect(heldReason(p)).toBeNull();
    expect(createSession({ callId: form, package: p }).package).not.toBeNull();
    expect(printedWorkbookQuestion(p)).toEqual(stored);
    expect(stored).toEqual(before);
    expect(patternOf(p.easierExample)?.form).toBe(form);
    expect(teachSteps(p).every(s => s.kind === "operate")).toBe(true);
    // A supplied teaching mark never lets a changed equation bypass re-derivation.
    const forged = structuredClone(p);
    forged.text += " Use a different rule.";
    expect((teachingPackage(forged) as QuestionPackage).operation).toBeNull();
  });

  it("rejects independent print, key, expression, template and slot disagreements", () => {
    const mutations: ((p: QuestionPackage) => void)[] = [
      p => { p.text = p.text.replace("40.", "42."); },
      p => { p.templateId = "5.10-pattern-rule#2.3:missing"; },
      p => { p.skill.skills = ["5.10-nth-term"]; },
      p => { const r = p.item!.regions[0]; if (r.kind === "box") r.answer = { type: "number", value: 8 }; },
      p => { const c = p.item!.checks[0]; if (c.kind === "template") c.source.answer = "d + 0"; },
      p => { const c = p.item!.checks[0]; if (c.kind === "template") c.source.derived = [["t", "s + d + d"]]; },
      p => { const c = p.item!.checks[0]; if (c.kind === "template") c.source.slots[0].value = { int: "27" }; },
      p => { p.text = "A pattern starts at s and adds ? each time. The 3rd term is t."; },
      p => { p.text += " What is another pattern?"; },
      p => { p.item!.checks.push(structuredClone(p.item!.checks[0])); },
    ];
    for (const change of mutations) {
      const p = printedPattern("missing3");
      change(p);
      expect(derivePattern(p), p.text).toBeNull();
      expect((teachingPackage(p) as QuestionPackage).operation, p.text).toBeNull();
    }
  });

  it("keeps the missing-step and term-count limits distinct, including a step of two", () => {
    for (const [s, d] of [[4, 3], [50, 12], [26, 7], [36, 4]]) {
      const p = teachingPackage(printedPattern("missing3", s, d)) as OperationPackage;
      expect(heldReason(p), `${s},${d}`).toBeNull();
      expect(p.answer.value).toEqual({ type: "number", value: d });
    }
    // Lesson 12: an answer of 2 is the 3rd term's count of steps, which every same-form example writes ("÷ 2"), so it is held.
    // Start 1 with step 3 has no example that is smaller and shares none of its numbers.
    for (const [s, d] of [[31, 2], [1, 3]]) expect(derivePattern(printedPattern("missing3", s, d)), `${s},${d}`).toBeNull();
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
  });
});

describe("the easier pattern never gives the question away (lessons 11 and 12)", () => {
  const values = (p: Pattern) => workedSteps(p.operation).flatMap(st => (st.kind === "operate" ? [st.left, st.right, st.value] : []));
  it.each(forms)("checks every made %s example against its own question", form => {
    let made = 0;
    for (let s = 2; s <= 50; s += 3) for (let d = 2; d <= 12; d++) {
      const p = derivePattern(printedPattern(form, s, d));
      if (!p) continue;
      made++;
      const question = patternOf(p)!, example = patternOf(p.easierExample)!;
      expect(exampleGivesAway(question, example), `${s},${d}`).toBe(false);
      const parts = workedSteps(question.operation).flatMap(st => (st.kind === "operate" ? [st.value] : []));
      // The ordinals ("3rd term") are the form's own words, printed in the question too.
      const written = [...values(example), ...(example.text.replace(/\d+(?:st|nd|rd|th)\b/g, "").match(/\d+/g) ?? []).map(Number)];
      // Never the answer or a part value of the question, whatever the role; never its own printed numbers as a value.
      for (const n of parts) expect(written, `${s},${d}: ${example.text}`).not.toContain(n);
      for (const n of [question.start, question.missing ? question.start + question.count * question.step : question.step]) {
        expect([example.start, example.missing ? example.start + example.count * example.step : example.step, ...workedSteps(example.operation).flatMap(st => (st.kind === "operate" ? [st.value] : []))], `${s},${d}`).not.toContain(n);
      }
    }
    expect(made).toBeGreaterThan(50);
  });

  it("refuses an example whose answer is the question's answer times a power of 10 or its first digits", () => {
    const q = readPattern("A pattern starts at 20 and adds 8 each time. What is the 4th term?")!; // 44
    expect(exampleGivesAway(q, readPattern("A pattern starts at 1 and adds 1 each time. What is the 4th term?")!)).toBe(true); // 4: first digit of 44
    expect(exampleGivesAway(q, readPattern("A pattern starts at 2 and adds 3 each time. What is the 4th term?")!)).toBe(false); // 11
  });
});

describe("pattern teaching and scope", () => {
  it.each(forms.flatMap(form => [[form, 36, 9], [form, 47, 12], [form, 50, 12]] as const))("keeps every new %s line within a grade 3 turn (start %i, step %i)", (form, start, step) => {
    const p = teachingPackage(printedPattern(form, start, step)) as OperationPackage, l = packageLines(p);
    expect(speechWords(workbookOpening(p)!)).toBeLessThanOrEqual(25);
    // The opening never reads the method out (the expression is the way to the answer).
    expect(workbookOpening(p)).toMatch(/, the pattern\.$/);
    expect(workbookOpening(p)).not.toMatch(/[−+×÷]/);
    const offers = [...l.exampleIntro(), ...p.easierExample.steps.flatMap(s => l.exampleStep(s.id)),
      ...teachSteps(p).flatMap(s => l.help(s.id)), ...l.help("result"), ...l.tryTarget(), ...l.answerRight()];
    for (const o of offers) for (const text of o.texts) expect(speechWords(text), text).toBeLessThanOrEqual(25);
    for (const s of teachSteps(p)) for (const level of [0, 1, 2, 3]) expect(l.help(s.id).some(o => o.level === level)).toBe(true);
  });

  it("permits checked forward sums but refuses changed rules and repeated operands", () => {
    const p = PATTERN_FIXTURES.PT_TERM;
    expect(scopeReason(p, "20 plus 8 is 28.", false)).toBeNull();
    expect(scopeReason(p, "28 minus 20 is 8.", false)).toBeNull();
    expect(scopeReason(p, "20 plus 9 is 29.", false)).toBe("changed_problem");
    expect(scopeReason(p, "20 times 20 is 400.", false)).toBe("changed_problem");
  });

  it("does not disclose the missing rule or uncomputed terms in a table", () => {
    expect(patternRows(PATTERN_FIXTURES.PT_MISSING, false)).toEqual(["26    ?    40", "Add ? each time"]);
    expect(patternRows(PATTERN_FIXTURES.PT_MISSING, true)).toEqual(["26    33    40", "Add 7 each time"]);
    expect(patternRows(PATTERN_FIXTURES.PT_TERM, false)).toEqual(["20    ?    ?    ?", "Add 8 each time"]);
  });

  it.each(PATTERN_BEHAVIOURS)("passes $id through the text adapter and saved-trace gate", async b => {
    const store = memoryTraceStore();
    expect((await runBehaviour(b, store)).error ?? null).toBeNull();
    const verdict = judge(b, store.load(b.id));
    expect(verdict.failures).toEqual([]);
  });
});

describe("the honest close writes the stuck step (lesson 10)", () => {
  // The session through the text adapter, as the gate runs it, with a failing model: code's fallback says every turn.
  const closeStuck = async (turns: { text: string; read?: Parameters<ReturnType<typeof scenarioModel>["next"]>[1] }[]) => {
    let now = GATE_T0;
    const model = scenarioModel();
    const text = createTextSession({ callId: "pattern-stuck", package: PATTERN_FIXTURES.PT_MISSING, model, clock: () => now, random: 1, grade: 3, freeTalk: false });
    model.next([], undefined);
    await text.start();
    for (const t of turns) {
      if (text.ended) break;
      now += CHILD_MS;
      model.next([{ throws: true }], t.read);
      await text.child(t.text);
    }
    return text.session;
  };
  const stuck = (n: number) => Array.from({ length: n }, () => ({ text: "I'm stuck.", read: { help: "more" as const } }));

  it("on the first part: the example, the close, and a blank event stuck on e1, never technical_issue", async () => {
    const s = await closeStuck(stuck(6));
    expect(s.outcome?.reason).toBe("child_stopped");
    expect(s.turns.filter(t => t.speaker === "maya").at(-1)?.text).toMatch(/fine to stop|okay to stop/);
    expect(learningEvent(s, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank", stuckStep: "e1" });
  });

  it("on the last part: the example, the close, and a blank event stuck on the last part", async () => {
    const s = await closeStuck([{ text: "40 minus 26 is 14.", read: { start: "has_work", answers: [[14, "e1", "right"]] } }, ...stuck(4)]);
    expect(s.outcome?.reason).toBe("child_stopped");
    expect(learningEvent(s, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank", stuckStep: "result" });
  });
});

// Pending for #735 (the Maya lane's shared final-answer confirm; brief, "My mom said 66."): another speaker's final answer
// gets the base say-back confirm ("I think I heard 7. Is that it?"), and a "Yes." to it is accepted. The pattern path does
// not touch that confirm, so it is not fixed here. Drop the `.skip` in #735: the run must not accept 7.
describe("#735, pending: 'My mom said 7.' on a pattern", () => {
  it.skip("is not accepted after the say-back confirm and a yes", async () => {
    const store = memoryTraceStore();
    await runBehaviour({ id: "pt-735", title: "pt-735", fixture: "PT_MISSING", status: "passing", grade: 3, expect: { outcome: {} }, steps: [
      { child: "40 minus 26 is 14.", read: { start: "has_work", answers: [[14, "e1", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      { child: "My mom said 7.", read: { unclear: true }, maya: [{ act: "confirm", heard: "7" }] },
      { child: "Yes.", read: { answers: [[7, "result", "right"]] }, maya: [{ act: "accept_answer", lines: ["answer.right"] }] },
    ] }, store);
    const acts = (JSON.parse(store.load("pt-735")!) as { turns: { kind: string; output?: { act: string } }[] }).turns.flatMap(t => t.kind === "maya" ? [t.output?.act] : []);
    expect(acts).not.toContain("accept_answer");
  });
});
