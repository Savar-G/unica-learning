// "Roll a die numbered 1 to 8. How many of the numbers are odd?" (template 4.17-predict-outcome#3.2:story; Maya
// coverage Wave C, group "other-topic"). From 1 to an even number, odd and even numbers take turns, so half of them are
// odd and half are even: 8 ÷ 2 = 4, a division Maya already teaches. The three agreements (Wave A brief, rule 3):
// 1. the printed text, by the closed form below (the die's last number and the word "odd" or "even");
// 2. code counts the odd (or even) numbers from 1 to that number one by one, and the count equals the answer key and
//    the division's result;
// 3. the template is exactly this one ("s // 2", with the check "s % 2 == 0"), and its slots give the same number and
//    word as the printed text.
// The easier example is the same question with a smaller die (1 to 4 or 1 to 6) none of whose numbers is the
// question's answer, so the example never says it. Pure TypeScript.
import { operationResult, sameValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { boxTemplate, withTopicOperation } from "./topic-package";

/** The closed printed form. */
const FORM = /^Roll a die numbered 1 to ([1-9]\d?)\. How many of the numbers are (odd|even)\?$/;
/** The template this form comes from, exactly. */
const TEMPLATE = { answer: "s // 2", check: "s % 2 == 0", derived: [["kind", "'even' if flip == 0 else 'odd'"]] } as const;
/** The easier example's dice, in order of preference. */
const EXAMPLE_DICE = [4, 6] as const;

/** The smaller die of the easier example: none of its numbers (its last, 2 and its answer) is the question's answer. */
export function exampleDie(last: number): number | null {
  const answer = last / 2;
  return EXAMPLE_DICE.find((d) => d < last && ![d, 2, d / 2].includes(answer)) ?? null;
}

/** The printed question's die and the kind of number it asks about, or null when the text is not the closed form. */
export function readDieCount(text: string): { last: number; kind: "odd" | "even" } | null {
  const m = FORM.exec(text.trim());
  if (!m) return null;
  return { last: Number(m[1]), kind: m[2] as "odd" | "even" };
}

/** The printed text of a die question, the same closed form. */
export const dieCountText = (last: number, kind: "odd" | "even") => `Roll a die numbered 1 to ${last}. How many of the numbers are ${kind}?`;

/** Code's own count: the numbers from 1 to `last` of that kind, counted one by one. */
export function countKind(last: number, kind: "odd" | "even"): number {
  let n = 0;
  for (let x = 1; x <= last; x++) if ((x % 2 === 1) === (kind === "odd")) n++;
  return n;
}

/** The division a die question is: the die's numbers shared in two halves. */
export const dieOperation = (last: number): Operation => ({ kind: "divide", operands: [last, 2] });

/** The teaching package of a die-count question, or null when any agreement fails. */
export function deriveDieCount(printed: QuestionPackage): QuestionPackage | null {
  if (printed.templateId !== "4.17-predict-outcome#3.2:story") return null;
  const read = readDieCount(printed.text);
  const box = boxTemplate(printed, "write-number");
  const example = read && exampleDie(read.last);
  if (!read || !box || read.last % 2 !== 0 || !example) return null;
  const { source, key, values } = box;
  const sameTemplate = source.answer === TEMPLATE.answer && source.check === TEMPLATE.check
    && JSON.stringify(source.derived) === JSON.stringify(TEMPLATE.derived);
  if (!sameTemplate || values.s !== read.last || values.flip !== (read.kind === "even" ? 0 : 1)) return null;
  const operation = dieOperation(read.last);
  const counted = { type: "number" as const, value: countKind(read.last, read.kind) };
  if (!sameValue(counted, key) || !sameValue(operationResult(operation), counted)) return null;
  return withTopicOperation(printed, operation, counted, { text: dieCountText(example, read.kind), operation: dieOperation(example) });
}
