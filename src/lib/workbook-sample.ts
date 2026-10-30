// The sample workbook (#299): hand-made content for a test family, so the store, the admin view and later Maya (#301)
// have one real workbook to read before the workbook generator exists. Three pages of a grade 3 workbook at level U10
// ("Numbers to 1000 and bigger sums", BC standard 3.3): a cover, a day of three-digit addition and a day of three-digit
// subtraction, the only operations the question package can check today (#298).
//
// sampleDraft is the content; the renderer (#309, src/lib/workbook-render.ts) lays it out with the fixed test template
// and measures each question's box (scripts/load-workbook-sample.ts stores the result). sampleWorkbook is the same
// content with fixed images and boxes, a ready workbook for tests that do not render.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { MISCONCEPTIONS, type MisconceptionId } from "@/lib/assessment";
import {
  operationResult,
  operationText,
  workedSteps,
  type Operation,
  type QuestionPackage,
  type WrongAnswer,
} from "@/lib/question-package";
import type { QuestionBox, WorkbookInput } from "@/lib/workbook-content";
import type { WorkbookDraft } from "@/lib/workbook-render";

/** The page image size of sampleWorkbook in pixels: US Letter at 100 dots per inch. */
const SAMPLE_PAGE_SIZE = { width: 850, height: 1100 } as const;

const LEVEL = 10;
const STANDARD = "3.3";
/** The sample's operations: whole-number addition and subtraction only. */
type SampleOperation = Extract<Operation, { kind: "add" | "subtract" }>;

const SKILL: Record<SampleOperation["kind"], string> = { add: "3.3-add-within-1000", subtract: "3.3-subtract-within-1000" };

/** A question of the sample: its operation and one easier operation of the same kind with fewer digits. */
interface SampleQuestion {
  operation: SampleOperation;
  easier: SampleOperation;
}

const add = (a: number, b: number): SampleOperation => ({ kind: "add", operands: [a, b] });
const subtract = (a: number, b: number): SampleOperation => ({ kind: "subtract", operands: [a, b] });

/** The sample's pages in order. Every question carries in (addition) or regroups in the ones (subtraction). */
const PAGES: readonly { type: string; dayLabel: string | null; questions: SampleQuestion[] }[] = [
  { type: "cover", dayLabel: null, questions: [] },
  {
    type: "practice", dayLabel: "Day 1", questions: [
      { operation: add(268, 157), easier: add(48, 37) },
      { operation: add(345, 286), easier: add(26, 7) },
      { operation: add(419, 193), easier: add(57, 26) },
      { operation: add(176, 248), easier: add(38, 5) },
    ],
  },
  {
    type: "practice", dayLabel: "Day 2", questions: [
      { operation: subtract(532, 178), easier: subtract(83, 46) },
      { operation: subtract(704, 256), easier: subtract(42, 7) },
      { operation: subtract(615, 349), easier: subtract(71, 28) },
      { operation: subtract(823, 467), easier: subtract(53, 8) },
    ],
  },
];

/** The box of question `n` (from 1) on a practice page of sampleWorkbook: two columns, two rows. */
function sampleBox(n: number): QuestionBox {
  const i = n - 1;
  return { x: 60 + (i % 2) * 380, y: 230 + Math.floor(i / 2) * 400, width: 350, height: 360 };
}

/** Each column's digits added with no carry: the answer of a child who forgets to carry. */
function withoutCarry(a: number, b: number): number {
  let result = 0;
  for (let p = 1; p <= Math.max(a, b); p *= 10) result += ((Math.floor(a / p) % 10 + Math.floor(b / p) % 10) % 10) * p;
  return result;
}

/** Each column's smaller digit taken from its larger: the answer of a child who never regroups. */
function smallerFromLarger(a: number, b: number): number {
  let result = 0;
  for (let p = 1; p <= Math.max(a, b); p *= 10) result += Math.abs(Math.floor(a / p) % 10 - Math.floor(b / p) % 10) * p;
  return result;
}

function wrong(value: number, cause: MisconceptionId, step: string | null): WrongAnswer {
  return { value: { type: "number", value }, cause, description: MISCONCEPTIONS[cause].description, step };
}

/** The expected wrong answers: the column mistake of the operation, and the other operation. */
function wrongAnswers({ kind, operands: [a, b] }: SampleOperation): WrongAnswer[] {
  return kind === "add"
    ? [wrong(withoutCarry(a, b), "O3", "tens"), wrong(a - b, "operation", null)]
    : [wrong(smallerFromLarger(a, b), "O1", "ones"), wrong(a + b, "operation", null)];
}

/** A question's package, with its answer, steps and the easier example's answer and steps computed from the operations. */
function samplePackage(workbookId: string, page: number, question: number, key: number, q: SampleQuestion): QuestionPackage {
  return {
    id: `${workbookId}:q${key}`,
    ref: { source: "workbook", workbookId, page, question },
    templateId: null,
    text: `${operationText(q.operation)} = ?`,
    answer: { value: operationResult(q.operation), accepted: [], unit: null },
    operation: q.operation,
    steps: workedSteps(q.operation),
    skill: { standard: STANDARD, skills: [SKILL[q.operation.kind]] },
    level: LEVEL,
    difficulty: 2,
    wrongAnswers: wrongAnswers(q.operation),
    easierExample: {
      text: `${operationText(q.easier)} = ?`,
      operation: q.easier,
      answer: operationResult(q.easier),
      steps: workedSteps(q.easier),
    },
  };
}

/** The sample workbook's content for a child. `qrTokens`: one token per page, made by the caller (random for the
 * loaded sample, fixed in tests). */
export function sampleDraft(o: { workbookId: string; childId: string; number?: number; qrTokens: readonly string[] }): WorkbookDraft {
  if (o.qrTokens.length !== PAGES.length) throw new Error(`the sample needs ${PAGES.length} QR tokens`);
  let key = 0;
  return {
    id: o.workbookId, childId: o.childId, number: o.number ?? 1, levels: [LEVEL], profileBuild: null,
    pages: PAGES.map((p, i) => ({
      number: i + 1,
      dayLabel: p.dayLabel,
      type: p.type,
      qrToken: o.qrTokens[i],
      questions: p.questions.map((q, j) => ({ number: j + 1, package: samplePackage(o.workbookId, i + 1, j + 1, ++key, q) })),
    })),
  };
}

/** The path of a page image of sampleWorkbook in the workbook bucket. */
const samplePagePath = (parentId: string, workbookId: string, page: number) => `${parentId}/${workbookId}/page-${page}.png`;

/** The sample workbook with fixed page images and question boxes, as if rendered: for tests that do not render. */
export function sampleWorkbook(o: { workbookId: string; childId: string; parentId: string; number?: number; qrTokens: readonly string[] }): WorkbookInput {
  const { pages, ...book } = sampleDraft(o);
  return {
    ...book,
    pdfPath: null,
    pages: pages.map((p) => ({
      ...p,
      image: { path: samplePagePath(o.parentId, o.workbookId, p.number), ...SAMPLE_PAGE_SIZE },
      questions: p.questions.map((q) => ({ ...q, box: sampleBox(q.number) })),
    })),
  };
}
