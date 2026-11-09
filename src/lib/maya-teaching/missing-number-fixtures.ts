// Synthetic printed missing-number packages, in the shape the workbook generator stores them (no operation, one box,
// one template check whose answer is the missing slot b): for the deriver's tests, the behaviour gate and the practice
// cases. Made-up numbers only; no customer data. Pure TypeScript.
import type { QuestionPackage } from "@/lib/question-package";

export interface PrintedMissing {
  /** The known number a and the missing number b: "a × ? = a·b" or "a − ? = a − b". */
  known: number;
  missing: number;
  sign: "×" | "−";
  unknownFirst?: boolean;
  format?: "write-number" | "two-ways";
  id?: string;
  /** Overrides the printed text (to test a form that is not read). */
  text?: string;
  /** Overrides the template's expression for the printed number. */
  relation?: string;
  /** Overrides the answer key in the box. */
  key?: number;
}

/** A printed missing-number package as the generator stores it. */
export function printedMissing(p: PrintedMissing): QuestionPackage {
  const total = p.sign === "×" ? p.known * p.missing : p.known - p.missing;
  const text = p.text ?? (p.unknownFirst ? `? ${p.sign} ${p.known} = ${total}` : `${p.known} ${p.sign} ? = ${total}`);
  const key = p.key ?? p.missing;
  const domain = { min: 0, max: 999_999 };
  const box = { id: "answer", kind: "box" as const, label: null, answer: { type: "number" as const, value: key } };
  return {
    id: p.id ?? `missing-${p.known}-${p.sign === "×" ? "x" : "m"}-${p.missing}`,
    ref: { source: "workbook", workbookId: "missing-number-fixtures", page: 1, question: 1 },
    templateId: p.sign === "×" ? "5.9-distributive#1.3:missing" : "5.8-extend-facts#2.4:missing",
    textSource: "code",
    text,
    item: {
      format: p.format ?? "write-number",
      error: null,
      scorable: true,
      parentChecked: false,
      regions: p.format === "two-ways"
        ? [{ id: "method-1", kind: "work", label: "Method 1" }, { id: "method-2", kind: "work", label: "Method 2" }, box]
        : [box],
      checks: [{
        kind: "template",
        region: "answer",
        source: {
          answer: "b",
          check: null,
          derived: [["a", "a0"], ["b", "b0"], ["c", p.relation ?? (p.sign === "×" ? "a * b" : "a - b")]],
          slots: [{ name: "a0", value: { int: String(p.known) }, domain }, { name: "b0", value: { int: String(p.missing) }, domain }],
          values: null,
        },
      }],
    },
    answer: null,
    operation: null,
    steps: [],
    skill: p.sign === "×" ? { standard: "5.9", skills: ["5.9-distributive"] } : { standard: "5.8", skills: ["5.8-extend-facts"] },
    level: 16,
    difficulty: 2,
    wrongAnswers: [],
    easierExample: null,
  };
}
