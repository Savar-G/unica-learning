// "A rectangle has length 245 m and width 126 m, but only two sides are labelled. What is its perimeter in m?"
// (template 4.14-perimeter#3.1:bare; Maya coverage Wave C, group "other-topic"). A rectangle has two lengths and two
// widths, so its perimeter is 2 × (245 + 126): an `evaluate` expression, which Maya teaches once A2's evaluate path
// lands (until then the session holds it). The three agreements (Wave A brief, rule 3):
// 1. the printed text, by the closed form below (the length, the width and one unit, named the same three times);
// 2. code's expression gives the answer key;
// 3. the template is exactly this one ("2 * (l + w)" with the check "w <= l"), and its slots l and w are the printed
//    length and width.
// The easier example is a 5 by 3 rectangle in the same unit. Pure TypeScript.
import { operationResult, sameValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { boxTemplate, withTopicOperation } from "./topic-package";

/** The closed printed form, with its unit from code's list. */
const FORM = /^A rectangle has length ([1-9]\d{0,3}) (mm|cm|m|km) and width ([1-9]\d{0,3}) \2, but only two sides are labelled\. What is its perimeter in \2\?$/;
/** The template this form comes from, exactly. */
const TEMPLATE = { answer: "2 * (l + w)", check: "w <= l" } as const;
/** The easier example's rectangle. */
const EXAMPLE = { length: 5, width: 3 } as const;

/** The printed rectangle, or null when the text is not the closed form. */
export function readPerimeter(text: string): { length: number; width: number; unit: string } | null {
  const m = FORM.exec(text.trim());
  if (!m) return null;
  return { length: Number(m[1]), width: Number(m[3]), unit: m[2] };
}

/** The printed text of a perimeter question, the same closed form. */
export const perimeterText = (length: number, width: number, unit: string) =>
  `A rectangle has length ${length} ${unit} and width ${width} ${unit}, but only two sides are labelled. What is its perimeter in ${unit}?`;

/** Two lengths and two widths: 2 × (length + width). */
export const perimeterOperation = (length: number, width: number): Operation => ({ kind: "evaluate", operands: [`2 × (${length} + ${width})`] });

/** The teaching package of a perimeter question, or null when any agreement fails. */
export function derivePerimeter(printed: QuestionPackage): QuestionPackage | null {
  if (printed.templateId !== "4.14-perimeter#3.1:bare") return null;
  const read = readPerimeter(printed.text);
  const box = boxTemplate(printed, "write-number");
  if (!read || !box) return null;
  const { source, key, values } = box;
  if (source.answer !== TEMPLATE.answer || source.check !== TEMPLATE.check || source.derived.length !== 0) return null;
  if (values.l !== read.length || values.w !== read.width || read.width > read.length) return null;
  if (read.width <= EXAMPLE.width || read.length <= EXAMPLE.length) return null;
  const operation = perimeterOperation(read.length, read.width);
  const sides = { type: "number" as const, value: read.length + read.width + read.length + read.width };
  if (!sameValue(sides, key) || !sameValue(operationResult(operation), sides)) return null;
  return withTopicOperation(printed, operation, sides, {
    text: perimeterText(EXAMPLE.length, EXAMPLE.width, read.unit),
    operation: perimeterOperation(EXAMPLE.length, EXAMPLE.width),
  });
}
