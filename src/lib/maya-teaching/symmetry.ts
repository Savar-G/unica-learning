// "How many lines of symmetry do a square and a scalene triangle have in all?" (template 4.15-line-symmetry#3.5:bare;
// Maya coverage Wave C, group "other-topic"). Code's own fact table gives each shape's lines of symmetry (a square has
// 4, a scalene triangle has 0), and the question is their sum, 4 + 0: an addition Maya already teaches. A count from
// code's fact table is code-computed. The three agreements (Wave A brief, rule 3):
// 1. the printed text, by the closed form below with two shapes from the table, named as the table names them;
// 2. code's facts add up to the answer key;
// 3. the template is exactly this one ("L[i] + L[j]" with the check "i != j"), its lists are code's table in code's
//    order, and its slots i and j point at the printed shapes.
// The easier example is two other shapes from the table with a smaller sum. Pure TypeScript.
import { operationResult, sameValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { boxTemplate, withTopicOperation } from "./topic-package";

/** Code's fact table, in the template's order: each shape as the question names it, and its lines of symmetry. */
export const SYMMETRY_LINES: readonly (readonly [string, number])[] = [
  ["a square", 4],
  ["a rectangle that is not a square", 2],
  ["an isosceles triangle", 1],
  ["a scalene triangle", 0],
  ["a regular hexagon", 6],
  ["a regular pentagon", 5],
];
const SHAPES = SYMMETRY_LINES.map(([name]) => name);
const shapeList = `[${SHAPES.map((s) => `'${s}'`).join(", ")}]`;
/** The template this form comes from, exactly. */
const TEMPLATE = {
  answer: "L[i] + L[j]",
  check: "i != j",
  derived: [["L", `[${SYMMETRY_LINES.map(([, n]) => n).join(", ")}]`], ["A", `${shapeList}[i]`], ["B", `${shapeList}[j]`]],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SHAPE = `(${SHAPES.map(escape).join("|")})`;
/** The closed printed form. */
const FORM = new RegExp(`^How many lines of symmetry do ${SHAPE} and ${SHAPE} have in all\\?$`);

/** The two printed shapes, as indexes of the fact table, or null when the text is not the closed form. */
export function readSymmetry(text: string): [number, number] | null {
  const m = FORM.exec(text.trim());
  if (!m) return null;
  const [i, j] = [SHAPES.indexOf(m[1]), SHAPES.indexOf(m[2])];
  return i >= 0 && j >= 0 && i !== j ? [i, j] : null;
}

/** The printed text of a symmetry question about two shapes of the table. */
export const symmetryText = (i: number, j: number) => `How many lines of symmetry do ${SHAPES[i]} and ${SHAPES[j]} have in all?`;

/** The addition of the two shapes' lines of symmetry, from code's table. */
export const symmetryOperation = (i: number, j: number): Operation => ({ kind: "add", operands: [SYMMETRY_LINES[i][1], SYMMETRY_LINES[j][1]] });

/**
 * The easier example: two other shapes, each with no more lines than the question's shape in its place, with a smaller
 * sum, in the table's order. None of its numbers is the question's answer, unless the question's own numbers hold the
 * answer too (4 + 0), so the example never says it first. Null when there is none.
 */
function easierPair(i: number, j: number): [number, number] | null {
  const [a, b] = [SYMMETRY_LINES[i][1], SYMMETRY_LINES[j][1]];
  for (let x = 0; x < SHAPES.length; x++) for (let y = 0; y < SHAPES.length; y++) {
    if (x === y || (x === i && y === j)) continue;
    const [p, q] = [SYMMETRY_LINES[x][1], SYMMETRY_LINES[y][1]];
    const shows = a !== a + b && b !== a + b && [p, q, p + q].includes(a + b);
    if (p <= a && q <= b && p + q < a + b && !shows) return [x, y];
  }
  return null;
}

/** The teaching package of a symmetry question, or null when any agreement fails. */
export function deriveSymmetry(printed: QuestionPackage): QuestionPackage | null {
  if (printed.templateId !== "4.15-line-symmetry#3.5:bare") return null;
  const read = readSymmetry(printed.text);
  const box = boxTemplate(printed, "write-number");
  if (!read || !box) return null;
  const { source, key, values } = box;
  const sameTemplate = source.answer === TEMPLATE.answer && source.check === TEMPLATE.check
    && JSON.stringify(source.derived) === JSON.stringify(TEMPLATE.derived);
  const [i, j] = read;
  if (!sameTemplate || values.i !== i || values.j !== j) return null;
  const operation = symmetryOperation(i, j);
  const facts = { type: "number" as const, value: SYMMETRY_LINES[i][1] + SYMMETRY_LINES[j][1] };
  if (!sameValue(facts, key) || !sameValue(operationResult(operation), facts)) return null;
  const easier = easierPair(i, j);
  if (!easier) return null;
  return withTopicOperation(printed, operation, facts, { text: symmetryText(...easier), operation: symmetryOperation(...easier) });
}
