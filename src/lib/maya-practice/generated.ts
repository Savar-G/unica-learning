// Local synthetic inputs go through the real planner and generator. No provider or hosted store is used.
import { fakeAiClient } from "@/lib/ai-client-fake";
import { createSession, valuesIn } from "@/lib/maya";
import { packageHash } from "@/lib/maya-trace";
import { checkQuestionPackage, stepText, valueText, type AnswerValue, type QuestionPackage } from "@/lib/question-package";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { generateWorkbook, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { reviewDays } from "@/lib/workbook-review-days";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";
import type { PracticeCase } from "./cases";
import { practicePackage } from "./packages";

export type GeneratedLevel = "U4" | "U16";
export interface PackageCoverage {
  page: number; question: number; packageHash: string | null;
  status: "teachable" | "held" | "rejected";
  reason: string | null;
  kind: string;
}
export interface GeneratedPracticeBook {
  level: GeneratedLevel;
  plan: WorkbookPlan;
  planHash: string;
  draft: GeneratedWorkbook;
  draftHash: string;
  coverage: PackageCoverage[];
}
export interface GeneratedPracticeSet {
  kind: "maya-practice-generated";
  version: 1;
  evidence: "synthetic inputs; real planner and generator; fake writer, fit and key solver; Day 1 only";
  books: GeneratedPracticeBook[];
  cases: PracticeCase[];
}

function support(pkg: QuestionPackage): { status: "teachable" | "held"; reason: string | null } {
  const s = createSession({ callId: "practice-package-check", package: pkg, random: 1 });
  return { status: s.contentProblem ? "held" : "teachable", reason: s.contentProblem };
}

/** Select only checked outputs. Keep an explicit row for every rejected or unsupported question. */
export function casesFromGeneratedBook(book: GeneratedPracticeBook): PracticeCase[] {
  if (book.planHash !== packageHash(book.plan) || book.draftHash !== packageHash(book.draft)
    || book.plan.level !== Number(book.level.slice(1)) || !book.draft.levels.includes(book.plan.level))
    throw new Error("practice: generated book provenance does not match");
  const coverage: PackageCoverage[] = [];
  const selected = new Map<string, PracticeCase>();
  for (const page of book.draft.pages) for (const q of page.questions) {
    const pkg = q.package;
    const checked = pkg ? checkQuestionPackage(pkg) : null;
    const refOk = pkg?.ref.source === "workbook" && pkg.ref.workbookId === book.draft.id && pkg.ref.page === page.number && pkg.ref.question === q.number;
    const ready = q.check.status === "checked" && checked?.ok && refOk;
    const supported = ready ? support(pkg!) : { status: "rejected" as const, reason: "question is unchecked, invalid or has a mismatched workbook reference" };
    coverage.push({ page: page.number, question: q.number, packageHash: pkg ? packageHash(pkg) : null, ...supported, kind: pkg?.operation?.kind ?? pkg?.item?.format ?? "missing" });
    if (!ready || !pkg || page.day === null || selected.has(supported.status)) continue;
    const held = supported.status === "held";
    const answer = pkg.answer ? valueText(pkg.answer.value) : null;
    const method = pkg.operation ? pkg.steps.map(s => stepText(s, pkg.operation!)).join(" ") : "";
    const known: AnswerValue[] = [...valuesIn(method, { fractions: true }), ...(pkg.answer ? [pkg.answer.value] : [])];
    const id = `G-${book.level}-${held ? "held" : "solved"}`;
    const c: PracticeCase = {
      id, title: `${book.level} generated ${held ? "unsupported question" : "checked answer and method"}`, fixture: "A", package: structuredClone(pkg),
      generated: { source: "real-generator-synthetic-v1", level: book.level, day: page.day, page: page.number, question: q.number, planHash: book.planHash, draftHash: book.draftHash, packageHash: packageHash(pkg), support: held ? "held" : "teachable" },
      persona: { name: book.level === "U4" ? held ? "Rae" : "Milo" : held ? "Finn" : "Ada", age: book.level === "U4" ? 6 : 11, question: pkg.text,
        knows: held ? "You see this question but do not know how to start. You do not know its answer." : `You already solved this question and wrote the answer ${answer}. Your method is: ${method}`,
        behaviour: held ? "Ask for help to start. Do not guess an answer." : `Start by saying your answer is ${answer}. Explain the checked method if asked. Say that you wrote the answer when asked.` },
      expected: held ? "Close as content_issue without teaching or inventing an answer. This is unsupported-kind refusal coverage, not teaching coverage." : "Check the child's answer and method from this package. Accept right work without inventing an error. Close after the child wrote it.",
      dimensions: held ? ["J02", "J03", "J05", "J06"] : ["J01", "J02", "J03", "J04", "J05", "J06"],
      reasons: held ? ["content_issue"] : ["solved"],
      validity: { stages: [{ name: held ? "cannot start" : "checked known method", opens: "start", numbers: [], values: held ? [] : known }] },
      fakeScript: held ? ["I don't know how to start."] : [`I got ${answer}.`, ...pkg.steps.filter(s => s.kind !== "result").map(s => stepText(s, pkg.operation!)), "I wrote it."],
    };
    practicePackage(c);
    selected.set(supported.status, c);
  }
  if (packageHash(coverage) !== packageHash(book.coverage)) throw new Error("practice: generated coverage does not match its draft");
  if (!selected.has("teachable")) throw new Error(`practice: no checked teachable package at ${book.level}`);
  return [...selected.values()];
}

/** Fixed local inputs make --report reproduce the same package identities without a live call. */
export async function generatedPracticeSet(): Promise<GeneratedPracticeSet> {
  const curriculum = curriculumFor("bc")!;
  const books: GeneratedPracticeBook[] = [];
  for (const level of ["U4", "U16"] as const) {
    const child = sampleChild(curriculum, level)!;
    const planned = planWorkbook(samplePlanInput(curriculum, child, "first"));
    if (!planned.ok) throw new Error(planned.reason);
    const plan = reviewDays(planned.plan, "1");
    const workbookId = `00000000-0000-4000-8000-${level === "U4" ? "000000000004" : "000000000016"}`;
    const childId = "00000000-0000-4000-8000-000000000531";
    let token = 0;
    const result = await generateWorkbook({ workbookId, childId, number: 1, profileBuild: null, plan, curriculum, book: { child: child.name }, itemPolicy: "approved-v1" }, {
      ai: fakeAiClient({ model: "practice-synthetic-writer", answer: fakeWorkbookItems }),
      fit: { fits: async () => ({ ok: true }) }, solver: keySolver(),
      store: memoryDraftStore({ [childId]: "00000000-0000-4000-8000-000000000532" }),
      qrToken: () => `practice-token-${String(++token).padStart(12, "0")}`,
    });
    if (result.status !== "stored") throw new Error(`practice: generator ${result.status}`);
    const draft = result.draft;
    const coverage = draft.pages.flatMap(p => p.questions.map(q => {
      const pkg = q.package;
      const checked = pkg && checkQuestionPackage(pkg).ok && q.check.status === "checked"
        && pkg.ref.source === "workbook" && pkg.ref.workbookId === draft.id && pkg.ref.page === p.number && pkg.ref.question === q.number;
      return { page: p.number, question: q.number, packageHash: pkg ? packageHash(pkg) : null,
        ...(checked ? support(pkg!) : { status: "rejected" as const, reason: "question is unchecked, invalid or has a mismatched workbook reference" }),
        kind: pkg?.operation?.kind ?? pkg?.item?.format ?? "missing" };
    }));
    books.push({ level, plan, planHash: packageHash(plan), draft, draftHash: packageHash(draft), coverage });
  }
  return { kind: "maya-practice-generated", version: 1, evidence: "synthetic inputs; real planner and generator; fake writer, fit and key solver; Day 1 only", books, cases: books.flatMap(casesFromGeneratedBook) };
}
