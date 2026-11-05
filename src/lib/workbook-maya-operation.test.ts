import { describe, expect, it } from "vitest";
import { checkQuestionPackage, operationResult, sameValue, type QuestionPackage } from "./question-package";
import { withWorkbookMayaOperation, printedWorkbookQuestion } from "./workbook-maya-operation";
import { createSession } from "./maya/session";
import { curriculumFor } from "./workbook-curriculum";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { planWorkbook } from "./workbook-plan";
import { generateWorkbook, reviseWorkbookPage, type GenerateInput, type GenerateDeps } from "./workbook-generator";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { keySolver, toSolve } from "./workbook-solve-check";
import { renderableDraft } from "./workbook-fit";
import { workbookTemplate } from "./workbook-template";
import { workbookQuality } from "./workbook-quality";
import { taskIdentity } from "./workbook-task-identity";
import { mayaCoverage, samplePages, changedPages } from "../../scripts/workbook-sample-pages";

function question(expression = "a - b", a = 9, b = 3, key = 6): QuestionPackage {
  return {
    id: "story", ref: { source: "workbook", workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", page: 3, question: 1 },
    templateId: "1.3-subtract-within-10#1.1:story", textSource: "code", text: "Jin has 9 cookies. Jin gives away 3. How many cookies are left?",
    operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
    level: 4, difficulty: 2, skill: { standard: "1.3", skills: ["1.3-subtract-within-10"] },
    item: { format: "show-work", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: key } }, { id: "work", kind: "work", label: "Show your work" }],
      checks: [{ kind: "template", region: "answer", source: { answer: expression, check: null, derived: [], values: null,
        slots: [{ name: "a", value: { int: String(a) }, domain: { min: 0, max: 100 } }, { name: "b", value: { int: String(b) }, domain: { min: 0, max: 100 } }] } }],
    },
  };
}

describe("workbook teaching operations", () => {
  it("makes a subtraction story teachable without changing the printed item or its key", () => {
    const original = question();
    expect(checkQuestionPackage(original).status).toBe("checked");
    const attached = withWorkbookMayaOperation(original);
    expect(attached.operation).toEqual({ kind: "subtract", operands: [9, 3] });
    expect(attached.answer?.value).toEqual({ type: "number", value: 6 });
    expect(createSession({ callId: "story", package: attached }).contentProblem).toBeNull();
    expect(printedWorkbookQuestion(attached)).toEqual(original);
    expect(taskIdentity(attached)).toBe(taskIdentity(original));
    expect(withWorkbookMayaOperation(attached)).toBe(attached);
    expect(toSolve(attached)).toEqual(toSolve(original));
  });

  it("uses a number bond's whole and known part, not an operation guessed from the answer", () => {
    const bond = question("a - b", 10, 7, 3);
    bond.text = "7 + ? = 10";
    expect(withWorkbookMayaOperation(bond).operation).toEqual({ kind: "subtract", operands: [10, 7] });
    expect(createSession({ callId: "bond", package: withWorkbookMayaOperation(bond) }).contentProblem).toBeNull();
    const unknown = question("max(a, b)", 9, 3, 9);
    expect(checkQuestionPackage(unknown).ok).toBe(true);
    expect(withWorkbookMayaOperation(unknown)).toBe(unknown);
  });

  it("rejects a changed key, invalid source, non-arithmetic source and a minimal target with no smaller example", () => {
    for (const pkg of [question("a - b", 9, 3, 5), question("a", 9, 3, 9), question("a + b", 0, 0, 0)]) {
      expect(withWorkbookMayaOperation(pkg)).toBe(pkg);
    }
    const invalid = question();
    const check = invalid.item!.checks[0];
    if (check.kind === "template") check.source.slots[0].value = { int: "999" };
    expect(withWorkbookMayaOperation(invalid)).toBe(invalid);
  });

  it("reads the stored number-bond relationship for a sampled missing part", () => {
    const bond = question("b", 10, 7, 7);
    bond.templateId = "1.3-subtract-within-10#1.1:missing";
    const check = bond.item!.checks[0];
    if (check.kind !== "template") throw new Error("missing template");
    check.source.slots = [
      { name: "w", value: { int: "10" }, domain: { min: 0, max: 20 } },
      { name: "p", value: { int: "7" }, domain: { min: 0, max: 20 } },
    ];
    check.source.answer = "p";
    check.source.derived = [["q", "w - p"]];
    bond.text = "7 and 3 make 10. 3 and __ make 10.";
    const attached = withWorkbookMayaOperation(bond);
    expect(attached.operation).toEqual({ kind: "subtract", operands: [10, 3] });
    expect(createSession({ callId: "bond", package: attached }).contentProblem).toBeNull();
  });

  it("checks decimal and fraction arithmetic against the exact item key", () => {
    const decimal = question("a + b", 9, 3, 1.5);
    const check = decimal.item!.checks[0];
    if (check.kind !== "template") throw new Error("missing template");
    check.source.slots[0].value = { dec: "1.2" };
    check.source.slots[1].value = { dec: "0.3" };
    check.source.slots.forEach(s => { s.domain = { min: 0, max: 100, decimal_places: 1 }; });
    expect(withWorkbookMayaOperation(decimal).operation?.kind).toBe("decimal-add");
    const fraction = question("Fraction(a, 12) + Fraction(b, 12)", 1, 5);
    const region = fraction.item!.regions[0];
    if (region.kind === "box") region.answer = { type: "fraction", numerator: 1, denominator: 2 };
    const attached = withWorkbookMayaOperation(fraction);
    expect(attached.operation?.kind).toBe("fraction-add");
    expect(checkQuestionPackage(attached).status).toBe("checked");
    expect(createSession({ callId: "fraction", package: attached }).contentProblem).toBeNull();
  });

  it("leaves place-value, circle and drawing tasks without operations", () => {
    const place = question("a + b", 9, 3, 12);
    place.skill = { standard: "2.1", skills: ["2.1-place-value-tens-ones"] };
    expect(checkQuestionPackage(place).ok).toBe(true);
    expect(withWorkbookMayaOperation(place)).toBe(place);
    const circle = question("a + b", 9, 3, 12);
    const check = circle.item!.checks[0];
    if (check.kind !== "template") throw new Error("missing template");
    circle.item = { ...circle.item!, format: "circle",
      regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["12", "13"], answer: "12" }],
      checks: [{ kind: "template-choice", region: "answer", source: check.source }],
    };
    expect(checkQuestionPackage(circle).ok).toBe(true);
    expect(withWorkbookMayaOperation(circle)).toBe(circle);
    const draw = question();
    draw.item = { format: "draw", scorable: false, parentChecked: true, error: null,
      regions: [{ id: "drawing", kind: "picture", label: null }], checks: [] };
    expect(checkQuestionPackage(draw).status).toBe("not-checked");
    expect(withWorkbookMayaOperation(draw)).toBe(draw);
  });

  it("keeps multi-step order and checks an independently computed result", () => {
    const pkg = question("a + b * 2", 9, 3, 15);
    const attached = withWorkbookMayaOperation(pkg);
    expect(attached.operation?.kind).toBe("evaluate");
    expect(checkQuestionPackage(attached).status).toBe("checked");
    expect(attached.answer?.value).toEqual({ type: "number", value: 15 });
  });

  it("uses a zero example for a smallest nonzero addition", () => {
    const attached = withWorkbookMayaOperation(question("a + b", 0, 1, 1));
    expect(attached.easierExample?.answer).toEqual({ type: "number", value: 0 });
    expect(createSession({ callId: "small", package: attached }).contentProblem).toBeNull();
  });
});

const BC = curriculumFor("bc")!;
describe("generated Maya coverage by print band", () => {
  it.each(["U3", "U4", "U16"])("pins all ten days of %s and keeps the exact print input", async level => {
    const child = sampleChild(BC, level)!;
    const planned = planWorkbook(samplePlanInput(BC, child, "first"));
    if (!planned.ok) throw new Error(planned.reason);
    const result = await generateWorkbook({ workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: "00000000-0000-4000-8000-000000000525", number: 1, profileBuild: null,
      plan: planned.plan, curriculum: BC, book: { child: child.name }, itemPolicy: "approved-v1" }, {
      ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits: async () => ({ ok: true }) }, solver: keySolver(),
      store: { save: async () => ({ status: "saved", draftId: "17fc5da1-2442-488a-a450-611a471e73e6" }), draft: async () => null },
      qrToken: (() => { let n = 0; return () => `token-${String(++n).padStart(12, "0")}`; })(), concurrency: 3,
    });
    if (result.status !== "stored") throw new Error(result.status);
    const draft = result.draft;
    // The existing fake U3 writer leaves one failed question. Keep it in the coverage denominator.
    expect(draft.counts.failed).toBe(level === "U3" ? 1 : 0);
    expect(mayaCoverage(draft)).toMatchSnapshot();
    // The counter uses the public createSession for every generated question. Assert every attached package as well.
    for (const q of draft.pages.flatMap(p => p.questions)) if (q.package?.operationSource === "maya") {
      expect(checkQuestionPackage(q.package).status, q.package.text).toBe("checked");
      expect(toSolve(q.package)).toEqual(toSolve(printedWorkbookQuestion(q.package)));
    }
    const original = { ...draft, pages: draft.pages.map(p => ({ ...p, questions: p.questions.map(q => ({ ...q, package: q.package ? printedWorkbookQuestion(q.package) : null })) })) };
    expect(workbookQuality(draft.pages)).toEqual(workbookQuality(original.pages));
    const template = workbookTemplate();
    expect(changedPages(await samplePages(original, template, []), await samplePages(draft, template, []))).toEqual([]);
    const old = renderableDraft(original), current = renderableDraft(draft);
    for (const [i, page] of current.pages.entries()) {
      expect(template.page(page, { qr: "", qrUrl: "sample" }, current)).toBe(template.page(old.pages[i], { qr: "", qrUrl: "sample" }, old));
    }
  }, 300_000);
});

async function editFixture() {
  const child = sampleChild(BC, "U4")!;
  const planned = planWorkbook(samplePlanInput(BC, child, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const input: GenerateInput = { workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: "00000000-0000-4000-8000-000000000525", number: 1, profileBuild: null,
    plan: { ...planned.plan, days: planned.plan.days.slice(0, 1) }, curriculum: BC, book: { child: child.name }, itemPolicy: "approved-v1" };
  let token = 0;
  const deps: GenerateDeps = {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits: async () => ({ ok: true }) }, solver: keySolver(),
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
  };
  const result = await generateWorkbook(input, deps);
  if (result.status !== "stored") throw new Error(result.status);
  const page = result.draft.pages.find(p => p.questions.some(q => q.package?.operationSource === "maya" && q.itemPlan?.template))!;
  const question = page.questions.find(q => q.package?.operationSource === "maya" && q.itemPlan?.template)!;
  return { input, deps, page, question };
}

describe("edited workbook teaching data", () => {
  it("keeps the checked operation when an edit keeps the numbers", async () => {
    const { input, deps, page, question } = await editFixture();
    const next = await reviseWorkbookPage(input, deps, page, { question: question.number, note: "Keep the numbers." });
    const pkg = next.questions.find(q => q.number === question.number)!.package!;
    expect(pkg.operation).toEqual(question.package!.operation);
    expect(pkg.answer).toEqual(question.package!.answer);
    expect(pkg.text).toBe(question.package!.text);
    expect(pkg.item).toEqual(question.package!.item);
    expect(checkQuestionPackage(pkg).status).toBe("checked");
    expect(printedWorkbookQuestion(pkg)).toEqual(printedWorkbookQuestion(question.package!));
  }, 300_000);

  it("computes fresh teaching data or none when an edit changes the maths", async () => {
    const { input, deps, page, question } = await editFixture();
    const next = await reviseWorkbookPage(input, deps, page, { question: question.number, note: "Change the numbers." });
    const pkg = next.questions.find(q => q.number === question.number)!.package!;
    expect(printedWorkbookQuestion(pkg)).not.toEqual(printedWorkbookQuestion(question.package!));
    expect(checkQuestionPackage(pkg).status).toBe("checked");
    if (pkg.operation) {
      const box = pkg.item!.regions.find(r => r.kind === "box");
      expect(box?.kind === "box" && box.answer && sameValue(operationResult(pkg.operation), box.answer)).toBe(true);
      expect(pkg.steps.length).toBeGreaterThan(0);
    } else {
      expect(pkg.answer).toBeNull();
      expect(pkg.steps).toEqual([]);
      expect(pkg.easierExample).toBeNull();
      expect(pkg.operationSource).toBeUndefined();
    }
  }, 300_000);
});
