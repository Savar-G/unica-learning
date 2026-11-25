import {
  computeExprAnswer,
  type AnswerBoxesScaffold,
  type ComputedAnswer,
  type ItemResponse,
  type PageItem,
  type PageSection,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isConcreteAnswer, plainNumber, sameValue } from "./answer-text";
import {
  divisionRole,
  isAnswerBearingResponse,
  isDivisionExpr,
  isMultiBox,
  itemPathOf,
  placePower,
  planItemAnswers,
  planPlaceDigits,
  scaffoldsFor,
  type AnswerNote,
} from "./answers";
import { compareLineWithExpr, exprWithExactAnswer, itemLine } from "./printed-line";

// The computed answer of an item, when code knows every value of it.
export function completeAnswer(expr: PageItem["expr"]): ComputedAnswer | null {
  const computed = computeExprAnswer(expr);
  return computed?.kind === "multi" && computed.values.includes(null) ? null : computed;
}

export function answerValues(computed: ComputedAnswer): string[] {
  return computed.kind === "single" ? [computed.value] : computed.values.filter((v) => v !== null);
}

interface RoleValue {
  value: string;
  role: ReturnType<typeof divisionRole>;
}

// Every way to write the answers of an expression into places in order: one place for each answer,
// or two places (quotient, remainder) for an answer of a division.
function answerForms(expr: PageItem["expr"]): RoleValue[][] {
  if (expr?.kind === "linked") {
    const [left, right] = expr.pair.map(answerForms);
    return left.flatMap((l) => right.map((r) => [...l, ...r]));
  }
  const computed = completeAnswer(expr);
  if (!computed) return [];
  const one = answerValues(computed).map((value): RoleValue => ({ value, role: null }));
  if (computed.kind !== "single" || computed.quotient === undefined) return [one];
  return [
    one,
    [
      { value: String(computed.quotient), role: "quotient" },
      { value: String(computed.remainder), role: "remainder" },
    ],
  ];
}

function holds(resp: ItemResponse, value: string): boolean {
  return isConcreteAnswer(resp.answer) && sameValue(resp.answer, value);
}

// True when the stored answers of an item that the placing rules do not fit are right all the same:
// they are its answers in order (see answerForms), or, for one answer, each place with no decimal
// name holds the whole value, each named one holds its digit, and together they hold the value.
function answersAreProved(
  expr: PageItem["expr"],
  responses: readonly ItemResponse[],
  computed: ComputedAnswer,
  boxScaffolds: readonly AnswerBoxesScaffold[],
): boolean {
  const inOrder = answerForms(expr).some(
    (form) =>
      form.length === responses.length &&
      responses.every((resp, i) => {
        const role = divisionRole(resp.place);
        return holds(resp, form[i].value) && placePower(resp.place) === null && (!role || role === form[i].role);
      }),
  );
  if (responses.length > 0 && inOrder && !boxScaffolds.some(isMultiBox)) return true;
  if (computed.kind !== "single" || responses.length === 0) return false;
  if (boxScaffolds.some(isMultiBox)) return false;
  // The places of a division with no decimal name can be a quotient and a remainder.
  if (isDivisionExpr(expr) && responses.some((resp) => placePower(resp.place) === null)) return false;
  const powers = new Map<number, number>();
  const whole: ItemResponse[] = [];
  const decimals: ItemResponse[] = [];
  responses.forEach((resp, idx) => {
    const power = placePower(resp.place);
    if (power === null) whole.push(resp);
    else if (power < 0) decimals.push(resp);
    else powers.set(idx, power);
  });
  if (!whole.every((resp) => holds(resp, computed.value))) return false;
  if (!decimals.every((resp) => holds(resp, "0"))) return false;
  if (powers.size === 0) return whole.length > 0;
  const digits = planPlaceDigits(powers, computed.value, whole.length === 0);
  return (
    digits !== null &&
    [...digits.values].every(([idx, digit]) => holds(responses[idx], digit)) &&
    digits.unreached.every((idx) => !isConcreteAnswer(responses[idx].answer) || holds(responses[idx], "0"))
  );
}

// An item whose question is stored as notation, with the expression of its printed line when that
// has one exact answer and every stored answer is a number.
function withLineExpr(item: PageItem, section: PageSection): PageItem | null {
  const stored = item.expr?.kind === "word" && typeof item.expr.expr === "object" ? item.expr.expr : item.expr;
  const line = stored?.kind === "notation" ? itemLine(item, section) : null;
  const expr = line && stored && compareLineWithExpr(line, stored) === "match" ? exprWithExactAnswer(line) : null;
  const readable = item.responses.every((r) => !isConcreteAnswer(r.answer) || plainNumber(r.answer) !== null);
  return expr && readable ? { ...item, expr } : null;
}

function unprovedItemAnswers(stored: PageItem, section: PageSection, path: string): AnswerNote[] {
  const fromLine = withLineExpr(stored, section);
  const item = fromLine ?? stored;
  const computed = completeAnswer(item.expr);
  if (!computed) return [];
  const out: AnswerNote[] = [];
  const add = (at: string, text: string): void => {
    out.push({ kind: "unproved_answer", path: at, message: `${at}: ${text}` });
  };
  const values = answerValues(computed).map((v) => `"${v}"`).join(", ");
  const inPlaces = item.responses.filter((resp) => isAnswerBearingResponse(item, resp));
  const plan = planItemAnswers(item, computed, section.scaffolds);
  if (plan.kind === "misfit" && !answersAreProved(item.expr, inPlaces, computed, scaffoldsFor(section.scaffolds, item.n))) {
    const held = inPlaces.map((r) => (r.answer === null ? "nothing" : `"${r.answer}"`)).join(", ");
    if (inPlaces.length === 0) add(path, `no answer place for the computed answer ${values}`);
    else add(path, `answer places hold ${held}, computed ${values}`);
  }
  // Code writes no answer into an item that stores notation, so its answers are compared here.
  const placed = new Map(fromLine && plan.kind === "fill" ? [...plan.unreached.map((idx) => [idx, "0"] as const), ...plan.values] : []);
  const right = answerForms(item.expr).flat().map((form) => form.value);
  item.responses.forEach((resp, idx) => {
    if (!isConcreteAnswer(resp.answer)) return;
    const at = `${path}.responses[${idx}]`;
    const value = placed.get(idx);
    if (value !== undefined && !sameValue(resp.answer, value)) add(at, `holds "${resp.answer}", computed "${value}"`);
    // A number in a checkbox or in the working space beside an answer place is an answer too.
    if (isAnswerBearingResponse(item, resp) || resp.answer_source === "printed") return;
    if (plainNumber(resp.answer) === null || right.some((v) => holds(resp, v))) return;
    add(at, `holds "${resp.answer}", computed ${values}`);
  });
  return out;
}

// Stored answers of items that code can compute but cannot prove: they do not fit the computed
// answer, so no computed value was written.
export function findUnprovedAnswers(record: ReferenceRecord | null | undefined): AnswerNote[] {
  if (!record || record.kind !== "page") return [];
  return record.sections.flatMap((section, si) =>
    section.items.flatMap((item) => unprovedItemAnswers(item, section, itemPathOf(si, item))),
  );
}
