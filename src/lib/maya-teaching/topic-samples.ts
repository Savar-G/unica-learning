// Synthetic printed workbook packages with the template shapes of the "other-topic" group (Maya coverage, Wave C), for
// tests, the behaviour gate and the practice suite. Each is a package as the generator stores it: no operation, an item
// with one template check, and the template source with its slot values. The numbers are free choices, never a
// customer's. Pure TypeScript.
import type { AnswerValue, QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";
import { SYMMETRY_LINES } from "./symmetry";

const int = (n: number) => ({ int: String(n) });
const shapeList = `[${SYMMETRY_LINES.map(([name]) => `'${name}'`).join(", ")}]`;

/** A printed package with one template-checked answer box (write-number, or write-words for a word answer). */
export function printed(id: string, templateId: string, skill: string, text: string, source: TemplateSource, answer: AnswerValue, format = "write-number"): QuestionPackage {
  return {
    id,
    ref: { source: "workbook", workbookId: "other-topic-samples", page: 1, question: 1 },
    templateId,
    textSource: "code",
    text,
    item: {
      format,
      error: null,
      scorable: true,
      parentChecked: false,
      checks: [{ kind: "template", region: "answer", source }],
      regions: [{ id: "answer", kind: "box", label: null, answer }],
    },
    answer: null,
    operation: null,
    steps: [],
    skill: { standard: skill.split("-")[0], skills: [skill] },
    level: 16,
    difficulty: 1,
    wrongAnswers: [],
    easierExample: null,
  } as QuestionPackage;
}

/** "Roll a die numbered 1 to {last}. How many of the numbers are {kind}?" (4.17-predict-outcome#3.2:story). */
export function diePrinted(last: number, kind: "odd" | "even", answer = Math.floor(last / 2)): QuestionPackage {
  return printed(`sample-die-${last}-${kind}`, "4.17-predict-outcome#3.2:story", "4.17-predict-outcome",
    `Roll a die numbered 1 to ${last}. How many of the numbers are ${kind}?`, {
      answer: "s // 2", check: "s % 2 == 0", values: null,
      slots: [{ name: "s", value: int(last), domain: { min: 6, max: 12 } }, { name: "flip", value: int(kind === "even" ? 0 : 1), domain: { min: 0, max: 1 } }],
      derived: [["kind", "'even' if flip == 0 else 'odd'"]],
    }, { type: "number", value: answer });
}

/** "How many lines of symmetry do {A} and {B} have in all?" (4.15-line-symmetry#3.5:bare), shapes by table index. */
export function symmetryPrinted(i: number, j: number): QuestionPackage {
  return printed(`sample-symmetry-${i}-${j}`, "4.15-line-symmetry#3.5:bare", "4.15-line-symmetry",
    `How many lines of symmetry do ${SYMMETRY_LINES[i][0]} and ${SYMMETRY_LINES[j][0]} have in all?`, {
      answer: "L[i] + L[j]", check: "i != j", values: null,
      slots: [{ name: "i", value: int(i), domain: { min: 0, max: 5 } }, { name: "j", value: int(j), domain: { min: 0, max: 5 } }],
      derived: [["L", `[${SYMMETRY_LINES.map(([, n]) => n).join(", ")}]`], ["A", `${shapeList}[i]`], ["B", `${shapeList}[j]`]],
    }, { type: "number", value: SYMMETRY_LINES[i][1] + SYMMETRY_LINES[j][1] });
}

/** "A rectangle has length {l} {unit} and width {w} {unit}, ... What is its perimeter in {unit}?" (4.14-perimeter#3.1:bare). */
export function perimeterPrinted(length: number, width: number, unit = "m"): QuestionPackage {
  return printed(`sample-perimeter-${length}-${width}`, "4.14-perimeter#3.1:bare", "4.14-perimeter",
    `A rectangle has length ${length} ${unit} and width ${width} ${unit}, but only two sides are labelled. What is its perimeter in ${unit}?`, {
      answer: "2 * (l + w)", check: "w <= l", values: null, derived: [],
      slots: [{ name: "l", value: int(length), domain: { min: 9, max: 250 } }, { name: "w", value: int(width), domain: { min: 5, max: 150 } }],
    }, { type: "number", value: 2 * (length + width) });
}

/** A printed true/false package: one template-choice check on a circled "true" or "false". */
export function choicePrinted(templateId: string, text: string, source: TemplateSource, word: "true" | "false"): QuestionPackage {
  const pkg = printed(`sample-${templateId}`, templateId, templateId.split("#")[0], text, source, { type: "text", value: word }, "circle");
  pkg.item!.checks = [{ kind: "template-choice", region: "answer", source }];
  pkg.item!.regions = [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["true", "false"], answer: word }];
  return pkg;
}
