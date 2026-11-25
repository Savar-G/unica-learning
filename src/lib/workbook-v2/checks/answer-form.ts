// What an answer must look like, whoever computed it. The build asks it of both computations before it compares them.
import type { Answer, AnswerKind } from "../contract";

/** What the value of each kind must look like. A new kind needs its rule here. */
const VALUE_FORMS: Readonly<Record<AnswerKind, { form: RegExp; name: string }>> = { "whole-number": { form: /^(0|[1-9]\d*)$/, name: "whole-number" } };
/** The names that marking knows. A shape with another part adds its name here. */
const PART_NAME = /^(answer|quotient|remainder|blank-[1-9]\d?)$/;
const PART_FIELDS = ["kind", "name", "value"];

function partProblem(part: unknown, kind: AnswerKind): string | null {
  if (typeof part !== "object" || part === null || Object.keys(part).sort().join() !== PART_FIELDS.join()) return "has a part that is not a name, a kind and a value";
  const { name, kind: partKind, value } = part as Record<string, unknown>;
  if (typeof name !== "string" || !PART_NAME.test(name)) return `has a part with the name ${JSON.stringify(name)}, which is not known`;
  if (!Object.hasOwn(VALUE_FORMS, kind) || partKind !== kind) return `has a part of the kind ${JSON.stringify(partKind)}, which is not "${kind}"`;
  if (typeof value !== "string" || !VALUE_FORMS[kind].form.test(value)) return `has a wrong value: the part "${name}" has the value ${JSON.stringify(value)}, which is no ${VALUE_FORMS[kind].name}`;
  return null;
}

/** What is wrong with an answer of a kind, or null: known names, each one time, and a value in the form of the kind. */
export function answerProblem(answer: Answer, kind: AnswerKind): string | null {
  const { parts, ...more } = answer;
  if (!Array.isArray(parts) || Object.keys(more).length > 0) return "is not a list of parts";
  if (parts.length === 0) return "has no part";
  for (const part of parts as unknown[]) {
    const problem = partProblem(part, kind);
    if (problem) return problem;
  }
  const twice = parts.find((part, i) => parts.findIndex((other) => other.name === part.name) !== i);
  return twice ? `has two parts with the name "${twice.name}"` : null;
}
