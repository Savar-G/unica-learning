import { beforeAll, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { createSession, step, fallbacks, lineOffers, learningEvent, scopeReason, speechWords, allLineTexts, TEMPLATES, plainLanguageProblem, type Session, type Proposal, type Reading } from "@/lib/maya";
import { createTextSession, type TextOutput } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { gateWordCount } from "@/lib/maya-gate/word-count";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planWorkbook } from "@/lib/workbook-plan";
import { generateWorkbook } from "@/lib/workbook-generator";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { keySolver } from "@/lib/workbook-solve-check";
import { checkQuestionPackage, workedSteps, hasOperation, type OperationPackage, type Operation } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

const generated = new Map<string, OperationPackage[]>();
const coverage: unknown[] = [];
beforeAll(async () => {
  const curriculum = curriculumFor("bc")!;
  for (const [level, policy] of [["U4", undefined], ["U4", "approved-v1"], ["U16", "approved-v1"]] as const) {
    const child = sampleChild(curriculum, level)!;
    const planned = planWorkbook(samplePlanInput(curriculum, child, "first"));
    if (!planned.ok) throw new Error(planned.reason);
    const result = await generateWorkbook({
      workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: "00000000-0000-4000-8000-000000000526",
      number: 1, profileBuild: null, plan: planned.plan, curriculum, book: { child: child.name }, itemPolicy: policy,
    }, {
      ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits: async () => ({ ok: true }) }, solver: keySolver(),
      store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
      qrToken: (() => { let n = 0; return () => `token-${String(++n).padStart(12, "0")}`; })(), concurrency: 3,
    });
    if (result.status !== "stored") throw new Error(result.status);
    if (policy) expect(result.draft.counts.failed).toBe(0);
    const packages = result.draft.pages.flatMap(p => p.questions.flatMap(q => q.check.status === "checked" && q.package && hasOperation(q.package) ? [q.package] : []));
    generated.set(`${level}-${policy ?? "legacy"}`, packages);
    const kinds: Record<string, { questions: number; accepts: number }> = {};
    for (const pkg of packages) {
      const row = kinds[pkg.operation.kind] ??= { questions: 0, accepts: 0 };
      row.questions++;
      if (!createSession({ callId: pkg.id, package: pkg }).contentProblem) row.accepts++;
    }
    coverage.push({ level, policy: policy ?? "legacy", counts: result.draft.counts, kinds });
  }
  await writeFile("/tmp/unica-526-generated-coverage.json", JSON.stringify(coverage, null, 2));
}, 300_000);

function commitFallback(s: Session): Session {
  for (const proposal of fallbacks(s, [])) {
    const result = step(s, { type: "proposal", at: 0, proposal });
    if (!result.refusal) return result.session;
  }
  throw new Error("No checked fallback can speak");
}

describe("#526 generated missing parts and count-up steps", () => {
  it("opens every generated U4 missing part through the public controller", () => {
    const packages = generated.get("U4-legacy")!.filter(p => p.operation.kind === "missing-addend");
    expect(packages.length).toBeGreaterThan(0);
    for (const pkg of packages) {
      expect(pkg.steps[0].kind).toBe("count-up");
      const s = createSession({ callId: pkg.id, package: pkg, grade: 1, confirmWorkbook: true });
      expect(s.contentProblem, pkg.text).toBeNull();
      const opened = commitFallback(step(s, { type: "start", at: 0 }).session);
      expect(opened.opened).toBe(true);
      expect(opened.outcome).toBeNull();
    }
  });
});

const num = (value: number) => ({ type: "number" as const, value });
function bond(from = 7, to = 10, easier: [number, number] = [0, 1]): OperationPackage {
  const operation: Operation = { kind: "missing-addend", operands: [from, to] };
  const example: Operation = { kind: "missing-addend", operands: easier };
  return {
    id: `count-${from}-${to}`, ref: { source: "workbook", workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", page: 3, question: 1 },
    templateId: null, text: `${from} + ? = ${to}`, operation, steps: workedSteps(operation),
    answer: { value: num(to - from), accepted: [], unit: null }, level: 4, difficulty: 2,
    skill: { standard: "1.3", skills: ["1.3-make-10-to-add"] },
    wrongAnswers: [{ value: num(to - from + 1), cause: "count", description: "Counts the starting number as a hop.", step: "count" }],
    easierExample: { text: `${easier[0]} + ? = ${easier[1]}`, operation: example, answer: num(easier[1] - easier[0]), steps: workedSteps(example) },
  };
}

function opened(pkg = bond(), grade = 4) {
  const s = createSession({ callId: "count-control", package: pkg, grade });
  expect(s.contentProblem).toBeNull();
  return commitFallback(step(s, { type: "start", at: 0 }).session);
}
const child = (s: Session, text: string, extra = {}) => step(s, { type: "child_turn", at: 0, text, ...extra }).session;
const propose = (s: Session, p: Omit<Proposal, "version">) => step(s, { type: "proposal", at: 0, proposal: { version: 2, ...p } });
const resultReading = (value: number, verdict: "right" | "wrong" = "right"): Reading => ({ answers: [{ value: num(value), step: "result", verdict }] });
const accept = (s: Session, value = 3) => propose(s, { act: "accept_answer", parts: [{ line: "answer.right" }], reading: resultReading(value) });
const said = (out: TextOutput) => out.say.join(" ");
const checkLength = (out: TextOutput) => {
  for (const text of out.say) {
    expect(gateWordCount(text), text).toBeLessThanOrEqual(25);
    expect(speechWords(text), text).toBeLessThanOrEqual(25);
    expect(plainLanguageProblem(text), text).toBeNull();
  }
};

describe("#526 target count commitment", () => {
  it.each(["Maybe seven?", "Seven, I guess.", "Could it be seven?", "I counted maybe seven numbers.", "I counted seven hops, I guess.", "Because I counted seven steps, maybe."])("does not complete a doubtful count from %s", text => {
    const result = propose(child(opened(bond(4, 11, [2, 5])), text), {
      act: "guide", step: "result", level: 0,
      parts: [{ line: "check.right_step", slots: { step: "count" } }, { line: "step.invite", slots: { step: "result" } }],
      reading: { answers: [{ value: num(7), step: "count", verdict: "right" }] },
    });
    expect(result.refusal?.code).toBe("answer_not_committed");
    expect(result.session.done).toEqual([]);
    expect(result.session.solved).toBeNull();
  });

  it.each(["I counted seven numbers.", "Because I counted seven.", "I counted seven hops.", "I counted seven numbers from four to eleven.", "Seven."])("keeps a clear count description from %s", text => {
    const result = propose(child(opened(bond(4, 11, [2, 5])), text), {
      act: "guide", step: "result", level: 0,
      parts: [{ line: "check.right_step", slots: { step: "count" } }, { line: "step.invite", slots: { step: "result" } }],
      reading: { answers: [{ value: num(7), step: "count", verdict: "right" }] },
    });
    expect(result.refusal).toBeNull();
    expect(result.session.done).toEqual(["count"]);
    expect(result.session.solved).toBeNull();
  });

  it.each([false, true])("does not release H4 after a doubtful count and two final misses, fallback=%s", async fallback => {
    const script = scenarioModel();
    const model = fallback ? { ...script, propose: async (...args: Parameters<typeof script.propose>) => ({ ...await script.propose(...args) as object, parts: "invalid" }) } : script;
    const s = createTextSession({ callId: `count-commit-${fallback}`, package: bond(4, 11, [2, 5]), grade: 1, model, clock: () => 1000 });
    script.next([{ act: "open", lines: ["open.hello"] }], undefined);
    await s.start();
    script.next([{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }], { answers: [[7, "count", "right"]] });
    await s.child("Maybe seven?");
    expect(s.session.done).toEqual([]);
    script.next([{ act: "guide", step: "result", level: 0, lines: ["step.invite"] }], { answers: [[8, "result", "wrong"]] });
    await s.child("Eight.");
    script.next([{ act: "give_answer", lines: [] }], { answers: [[9, "result", "wrong"]] });
    await s.child("Nine.");
    expect(s.session.done).toEqual([]);
    expect(s.session.solved).toBeNull();
    expect(s.session.highestHint).toBeLessThan(4);
    expect(s.session.finalMisses).toBe(0);
  });
});

describe("#526 public count-up answer checks", () => {
  it("checks the number of hops, not the endpoint, and waits for the final answer", () => {
    const s = child(opened(), "I counted three numbers.");
    const checked = propose(s, {
      act: "guide", step: "result", level: 0,
      parts: [{ line: "check.right_step", slots: { step: "count" } }, { line: "step.invite", slots: { step: "result" } }],
      reading: { answers: [{ value: num(3), step: "count", verdict: "right" }] },
    });
    expect(checked.refusal).toBeNull();
    expect(checked.session.done).toEqual(["count"]);
    expect(checked.session.solved).toBeNull();
    const final = accept(child(checked.session, "Three."));
    expect(final.refusal).toBeNull();
    expect(final.session.solved).toBe("child");
    const wrong = propose(child(opened(), "Ten."), {
      act: "guide", step: "result", level: 0, parts: [{ line: "step.invite", slots: { step: "result" } }],
      reading: { answers: [{ value: num(10), step: "count", verdict: "right" }] },
    });
    expect(wrong.refusal?.code).toBe("accepts_wrong_answer");
  });

  it.each(["-3", "Not three.", "Maybe three?", "Three or four?", "Three, no, four.", "Because I counted three."])("does not accept a final answer from %s", text => {
    const s = child(opened(), text);
    const result = accept(s);
    expect(result.refusal).not.toBeNull();
    expect(result.session.solved).toBeNull();
    expect(result.session.done).toEqual([]);
  });

  it("does not transfer example progress to the target", () => {
    const s = child(opened(), "One.");
    const result = propose(s, {
      act: "accept_answer", parts: [{ line: "answer.right" }],
      reading: { answers: [{ value: num(1), step: "result", problem: "example", verdict: "right" }] },
    });
    expect(result.refusal?.code).toBe("accepts_wrong_answer");
    expect(result.session.solved).toBeNull();
    expect(result.session.done).toEqual([]);
  });

  it("uses the actual bond and count increments for scope", () => {
    for (const text of ["7 plus 3 is 10", "3 plus 7 is 10", "10 minus 7 is 3", "7 plus 1 is 8", "9 plus 1 is 10"]) {
      expect(scopeReason(bond(), text, false), text).toBeNull();
    }
    for (const text of ["7 plus 10", "3 plus 10", "7 plus 2", "8 plus 2", "7 minus 10"]) {
      expect(scopeReason(bond(), text, false), text).toBe("changed_problem");
    }
  });

  it("keeps unverified keys, counts, examples, and untaught kinds held", () => {
    const badKey = bond(); badKey.answer.value = num(4);
    const badCount = bond(); (badCount.steps[0] as { said: number[] }).said = [7, 8, 9];
    const badExample = bond(); (badExample.easierExample.steps[0] as { said: number[] }).said = [0];
    for (const pkg of [badKey, badCount, badExample]) expect(createSession({ callId: "bad", package: pkg }).contentProblem).not.toBeNull();
    const fraction = bond();
    const op: Operation = { kind: "fraction-multiply", operands: [{ type: "fraction", numerator: 2, denominator: 3 }, { type: "fraction", numerator: 3, denominator: 4 }] };
    fraction.operation = op; fraction.steps = workedSteps(op); fraction.answer.value = { type: "fraction", numerator: 1, denominator: 2 };
    fraction.wrongAnswers = [{ value: num(1), cause: "operation", description: "A different amount.", step: null }];
    const ex: Operation = { kind: "fraction-multiply", operands: [{ type: "fraction", numerator: 1, denominator: 2 }, { type: "fraction", numerator: 1, denominator: 3 }] };
    fraction.easierExample = { text: "1/2 × 1/3", operation: ex, steps: workedSteps(ex), answer: { type: "fraction", numerator: 1, denominator: 6 } };
    expect(checkQuestionPackage(fraction).status).toBe("checked");
    expect(createSession({ callId: "held", package: fraction }).contentProblem).not.toBeNull();
    // Clock count-on is a different worked-step kind and remains held.
    const time = (hours: number, minutes: number) => ({ type: "time" as const, hours, minutes, period: null });
    const clock = bond();
    clock.operation = { kind: "elapsed-time", operands: [time(2, 15), time(3, 45)] };
    clock.steps = workedSteps(clock.operation);
    clock.answer.value = { type: "quantity", value: 90, unit: "min" };
    clock.wrongAnswers = [{ value: num(1), cause: "time", description: "A different amount.", step: null }];
    const easierClock: Operation = { kind: "elapsed-time", operands: [time(2, 0), time(2, 5)] };
    clock.easierExample = { text: "From 2:00 to 2:05", operation: easierClock, steps: workedSteps(easierClock), answer: { type: "quantity", value: 5, unit: "min" } };
    expect(checkQuestionPackage(clock).status).toBe("checked");
    expect(clock.steps.some(s => s.kind === "count-on")).toBe(true);
    expect(createSession({ callId: "clock", package: clock }).contentProblem).toContain("count-on");
  });

  it("keeps the answer and board bound to the target or example role", () => {
    const s = child(opened(), "I cannot start.");
    const wrongBoard = propose(s, { act: "example_step", step: "count", parts: [{ line: "example.intro" }, { line: "example.step", slots: { step: "count" } }],
      reading: { start: "no_start" }, draw: [{ offer: "line.answer.right" }] });
    expect(wrongBoard.refusal?.code).toBe("board_not_code");
    expect(wrongBoard.session.exampleShown).toBe(0);
    const inventedMath = propose(s, { act: "guide", step: "count", level: 0,
      parts: [{ talk: "The answer is three." }, { line: "step.invite", slots: { step: "count" } }] });
    expect(inventedMath.refusal).toBeNull();
    const output = inventedMath.effects.find(e => e.kind === "say");
    expect(output).toMatchObject({ kind: "say", talkReplaced: 1 });
    expect(output?.kind === "say" && output.text).not.toContain("The answer is three.");
    expect(inventedMath.session.solved).toBeNull();
    const stolenExampleLine = propose(s, { act: "example_step", step: "count", reading: { start: "no_start" },
      parts: [{ line: "answer.right" }] });
    expect(stolenExampleLine.refusal?.code).toBe("line_not_offered");
    const inventedConfirmation = propose(child(opened(), "Four."), { act: "confirm", parts: [{ line: "confirm.heard", slots: { heard: "3" } }] });
    expect(inventedConfirmation.refusal?.code).toBe("line_not_offered");
  });

  it("clears a withdrawn answer and accepts only the child's retained correction", () => {
    const accepted = accept(child(opened(), "Four, no, three."));
    expect(accepted.refusal).toBeNull();
    expect(accepted.session.solved).toBe("child");
    const erased = child(accepted.session, "I erased my answer.");
    expect(erased.solved).toBeNull();
    expect(erased.lastResult).not.toBe("right");
    expect(accept(erased).refusal).not.toBeNull();
  });

  it("has code-written H0 to H3 help without releasing the amount", () => {
    const s = child(opened(), "Help me.");
    const offers = lineOffers(s).guide!.filter(o => o.slots.step === "count" && o.level !== undefined);
    expect([...new Set(offers.map(o => o.level))]).toEqual([0, 1, 2, 3]);
    for (const o of offers) for (const text of o.texts) {
      expect(text).not.toMatch(/\b3\b/);
      expect(plainLanguageProblem(text)).toBeNull();
      expect(gateWordCount(text)).toBeLessThanOrEqual(25);
    }
  });
});

describe("#526 dedicated text behavior controls", () => {
  it("accepts number words, confirms uncertainty, and keeps the completed equation correct", async () => {
    const model = scenarioModel();
    const s = createTextSession({ callId: "bond-confirm", package: bond(), grade: 1, model, clock: () => 1000 });
    model.next([{ act: "open", lines: ["open.hello"] }], undefined);
    checkLength(await s.start());
    model.next([{ act: "accept_answer" }], { answers: [[3, "result", "right"]] });
    checkLength(await s.child("Maybe three?"));
    expect(s.session.solved).toBeNull();
    model.next([{ act: "confirm", heard: "3" }], { unclear: true });
    const confirmed = await s.child("I said three.");
    checkLength(confirmed);
    expect(confirmed.say.join(" ")).toMatch(/3/);
    expect(s.session.solved).toBeNull();
    expect(s.session.done).toEqual([]);
    expect(s.session.state).toBe("CONFIRM_HEARD");
    model.next([{ act: "accept_answer", draw: ["line.answer.right"] }], { answers: [[3, "result", "right"]] });
    const accepted = await s.child("Three.");
    checkLength(accepted);
    expect(said(accepted)).toContain("7 + 3 = 10");
    expect(JSON.stringify(accepted.board)).toContain("7 + 3 = 10");
    expect(said(accepted)).not.toContain("? = 10 = 3");
    model.next([{ act: "ask_write", understanding: "uncertain" }], undefined);
    checkLength(await s.child("Okay."));
    model.next([], { paper: "written" });
    checkLength(await s.child("I wrote it."));
    expect(s.session.outcome).toMatchObject({ reason: "solved", assistance: "independent", understanding: "uncertain", paperStatus: "child_confirmed" });
    expect(learningEvent(s.session, { parentId: "p", childId: "c" })?.result).toBe("right");
  });

  it("escalates checked wrong answers to H4 and records who supplied the answer", async () => {
    const model = scenarioModel();
    const s = createTextSession({ callId: "bond-help", package: bond(), grade: 1, model, clock: () => 1000 });
    model.next([{ act: "open", lines: ["open.hello"] }], undefined);
    await s.start();
    for (const [level, line] of [[0, "step.invite"], [1, "step.point"], [2, "step.operation"], [3, "step.show"]] as const) {
      model.next([{ act: "guide", step: "count", level, lines: [line] }], { help: "more", answers: [[4, "result", "wrong"]] });
      checkLength(await s.child("Four. Please help me."));
      expect(s.session.solved).toBeNull();
      expect(s.session.highestHint).toBe(level);
    }
    model.next([{ act: "give_answer", lines: [] }], { help: "more" });
    const answer = await s.child("Please tell me now.");
    checkLength(answer);
    expect(said(answer)).toMatch(/(?:3 more|on 3)/);
    expect(s.session.solved).toBe("maya");
    model.next([], undefined);
    await s.child("Okay.");
    expect(s.session.outcome).toMatchObject({ reason: "solved", assistance: "answer_given", highestHint: 4, understanding: "uncertain" });
    expect(learningEvent(s.session, { parentId: "p", childId: "c" })?.result).toBe("blank");
  });

  it.each([false, true])("finishes the whole example and returns to the real generated target, fallback=%s", async fallback => {
    const packages = generated.get("U4-legacy")!.filter(p => p.operation.kind === "missing-addend");
    for (const [i, pkg] of packages.entries()) {
      const script = scenarioModel();
      const model = fallback ? { ...script, propose: async (...args: Parameters<typeof script.propose>) => ({ ...await script.propose(...args) as object, parts: "invalid" }) } : script;
      const s = createTextSession({ callId: `generated-count-${i}-${fallback}`, package: pkg, grade: 1, model, clock: () => 1000 });
      script.next([{ act: "open", lines: ["open.hello"] }], undefined);
      checkLength(await s.start());
      script.next([{ act: "example_step" }], { start: "no_start" });
      const example = await s.child("I don't know how to start.");
      checkLength(example);
      expect(s.session.exampleShown, pkg.text).toBe(pkg.easierExample.steps.length);
      expect(s.session.outcome).toBeNull();
      script.next([], undefined);
      checkLength(await s.child("Let me try."));
      expect(s.session.retried).toBe(true);
      const answer = (pkg.answer.value as { value: number }).value;
      script.next([], { answers: [[answer, "result", "right"]] });
      checkLength(await s.child(String(answer)));
      script.next([{ act: "ask_write", understanding: "uncertain" }], undefined);
      checkLength(await s.child("Okay."));
      script.next([], { paper: "written" });
      checkLength(await s.child("I wrote it."));
      expect(s.session.outcome).toMatchObject({ reason: "solved", assistance: "worked_example", understanding: "uncertain" });
      expect(learningEvent(s.session, { parentId: "p", childId: "c" })?.result).toBe("right_with_help");
    }
  });

  it("keeps the approved U4 and U16 generated operations usable and reports missing-kind limits", () => {
    for (const key of ["U4-approved-v1", "U16-approved-v1"]) {
      const packages = generated.get(key)!;
      expect(packages.length).toBeGreaterThan(0);
      for (const pkg of packages) {
        const s = createSession({ callId: pkg.id, package: pkg });
        if (s.contentProblem) continue; // These samples also contain intentionally untaught kinds.
        expect(commitFallback(step(s, { type: "start", at: 0 }).session).opened).toBe(true);
      }
      expect(packages.filter(p => p.operation.kind === "missing-addend")).toHaveLength(0);
    }
  });

  it("completes boundary examples and questions through the 25-word public text adapter", async () => {
    for (let from = 0; from < 20; from++) for (let to = from + 1; to <= 20; to++) {
      const pkg = bond(from, to, [0, to - from === 1 ? 0 : 1]);
    expect(checkQuestionPackage(pkg).status, JSON.stringify(checkQuestionPackage(pkg))).toBe("checked");
      const model = scenarioModel();
      const s = createTextSession({ callId: pkg.id, package: pkg, grade: 1, model, clock: () => 1000, random: to });
      model.next([{ act: "open", lines: ["open.hello"] }], undefined);
      checkLength(await s.start());
      model.next([{ act: "example_step" }], { start: "no_start" });
      checkLength(await s.child("I cannot start."));
      expect(s.session.exampleShown, pkg.text).toBe(2);
      expect(s.session.outcome).toBeNull();
      model.next([], undefined);
      checkLength(await s.child("Let me try."));
      model.next([], { answers: [[to - from, "result", "right"]] });
      checkLength(await s.child(String(to - from)));
      expect(s.session.solved, pkg.text).toBe("child");
    }
  });

  it("logs every new wording for the required reading", async () => {
    const keys = ["point.count", "intro.count", "operation.count", "show.count", "example.count", "example.count.sequence"] as const;
    await writeFile("/tmp/unica-526-new-wording.json", JSON.stringify(Object.fromEntries(keys.map(k => [k, TEMPLATES[k]])), null, 2));
    expect(keys.reduce((n, key) => n + TEMPLATES[key].length, 0)).toBe(30);
    const packages = [...generated.get("U4-legacy")!.filter(p => p.operation.kind === "missing-addend"), bond()];
    const expanded = [...new Set(packages.flatMap(p => allLineTexts(p)))].sort();
    expect(expanded.every(text => !text.includes("undefined"))).toBe(true);
    await writeFile("/tmp/unica-526-expanded-lines.txt", expanded.join("\n") + "\n");
  });
});
