// The sample workbook (#299): hand-made fixture data for a test family, so the store, the admin view and later Maya
// (#301) have one real workbook to read before the workbook generator exists. Three pages of a grade 3 workbook at
// level U10 ("Numbers to 1000 and bigger sums", BC standard 3.3): a cover, a day of three-digit addition and a day of
// three-digit subtraction, the only operations the question package can check today (#298).
//
// The page images are drawn from the same layout as the question boxes (pageSvg), so each box is the measured place of
// its question on the image. The loader (scripts/load-workbook-sample.ts) turns the SVG into a PNG and stores it.
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
import type { PageInput, QuestionBox, WorkbookInput } from "@/lib/workbook-content";

/** The page image size in pixels: US Letter at 100 dots per inch. */
export const SAMPLE_PAGE_SIZE = { width: 850, height: 1100 } as const;

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

/** The box of question `n` (from 1) on a practice page: two columns, two rows. */
export function sampleBox(n: number): QuestionBox {
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

/** The path of a sample page image in the workbook bucket. */
export const samplePagePath = (parentId: string, workbookId: string, page: number) => `${parentId}/${workbookId}/page-${page}.png`;

/**
 * The sample workbook for a child. `qrTokens`: one token per page, made by the caller (random for the loaded sample,
 * fixed in tests).
 */
export function sampleWorkbook(o: { workbookId: string; childId: string; parentId: string; number?: number; qrTokens: readonly string[] }): WorkbookInput {
  if (o.qrTokens.length !== PAGES.length) throw new Error(`the sample needs ${PAGES.length} QR tokens`);
  let key = 0;
  const pages: PageInput[] = PAGES.map((p, i) => ({
    number: i + 1,
    dayLabel: p.dayLabel,
    type: p.type,
    image: { path: samplePagePath(o.parentId, o.workbookId, i + 1), ...SAMPLE_PAGE_SIZE },
    qrToken: o.qrTokens[i],
    questions: p.questions.map((q, j) => ({ number: j + 1, box: sampleBox(j + 1), package: samplePackage(o.workbookId, i + 1, j + 1, ++key, q) })),
  }));
  return { id: o.workbookId, childId: o.childId, number: o.number ?? 1, levels: [LEVEL], pdfPath: null, profileBuild: null, pages };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A page drawn as SVG, with each question inside its box. The loader renders it to the page image. */
export function pageSvg(page: PageInput): string {
  const { width, height } = SAMPLE_PAGE_SIZE;
  const font = `font-family="Helvetica, Arial, sans-serif"`;
  const parts = [
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
    `<text x="60" y="80" ${font} font-size="22" fill="#555">Unica Learning · Sample workbook</text>`,
    `<text x="790" y="80" ${font} font-size="22" fill="#555" text-anchor="end">Page ${page.number}</text>`,
    // The QR code's place, bottom right. The real code comes with the workbook generator.
    `<rect x="710" y="1005" width="80" height="80" fill="none" stroke="#999" stroke-width="2"/>`,
    `<text x="750" y="1051" ${font} font-size="16" fill="#999" text-anchor="middle">QR</text>`,
  ];
  if (page.type === "cover") {
    parts.push(
      `<text x="425" y="420" ${font} font-size="56" font-weight="700" fill="#222" text-anchor="middle">My math workbook</text>`,
      `<text x="425" y="490" ${font} font-size="28" fill="#555" text-anchor="middle">Numbers to 1000 and bigger sums</text>`,
      `<text x="425" y="540" ${font} font-size="24" fill="#888" text-anchor="middle">Level U${LEVEL} · Sample</text>`,
    );
  } else {
    const title = page.questions[0]?.package.operation.kind === "subtract" ? "Subtract. Show your work." : "Add. Show your work.";
    parts.push(
      `<text x="60" y="150" ${font} font-size="34" font-weight="700" fill="#222">${escape(page.dayLabel ?? "")}</text>`,
      `<text x="60" y="195" ${font} font-size="24" fill="#444">${title}</text>`,
    );
    for (const q of page.questions) {
      const { x, y, width: w, height: h } = q.box;
      const [a, b] = q.package.operation.operands;
      const sign = q.package.operation.kind === "add" ? "+" : "−";
      const right = x + w - 70;
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#bbb" stroke-width="2"/>`,
        `<text x="${x + 20}" y="${y + 40}" ${font} font-size="24" font-weight="700" fill="#222">${q.number}.</text>`,
        `<text x="${right}" y="${y + 120}" ${font} font-size="48" fill="#222" text-anchor="end" letter-spacing="8">${a}</text>`,
        `<text x="${right - 150}" y="${y + 185}" ${font} font-size="48" fill="#222">${sign}</text>`,
        `<text x="${right}" y="${y + 185}" ${font} font-size="48" fill="#222" text-anchor="end" letter-spacing="8">${b}</text>`,
        `<line x1="${right - 160}" y1="${y + 210}" x2="${right + 10}" y2="${y + 210}" stroke="#222" stroke-width="3"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
}
