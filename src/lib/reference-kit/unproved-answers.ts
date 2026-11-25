import {
  computeExprAnswer,
  type AnswerBoxesScaffold,
  type ComputedAnswer,
  type ItemResponse,
  type PageItem,
  type PageSection,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isConcreteAnswer, normalizeAnswerCompare, plainNumber } from "./answer-text";
import {
  decimalPlacePower,
  hasNoPlace,
  isAnswerBearingResponse,
  isDivisionExpr,
  isMultiBox,
  itemPathOf,
  planItemAnswers,
  planPlaceDigits,
  scaffoldsFor,
  type AnswerNote,
} from "./answers";

// The computed answer of an item, when code knows every value of it.
export function completeAnswer(expr: PageItem["expr"]): ComputedAnswer | null {
  const computed = computeExprAnswer(expr);
  return computed?.kind === "multi" && computed.values.includes(null) ? null : computed;
}

export function answerValues(computed: ComputedAnswer): string[] {
  return computed.kind === "single" ? [computed.value] : computed.values.filter((v) => v !== null);
}

// True when the stored answers of an item with several answer places (or one place that does not
// take the value) are right place by place: a place with no decimal name holds the whole value, a
// named one holds its digit, and together they hold the whole value. A division with remainder may
// hold its quotient and its remainder in two places with no name.
function answersAreProved(
  item: PageItem,
  responses: readonly ItemResponse[],
  computed: ComputedAnswer,
  boxScaffolds: readonly AnswerBoxesScaffold[],
): boolean {
  if (computed.kind !== "single" || responses.length === 0) return false;
  const holds = (resp: ItemResponse, value: string): boolean =>
    isConcreteAnswer(resp.answer) && normalizeAnswerCompare(resp.answer) === normalizeAnswerCompare(value);
  if (isDivisionExpr(item.expr)) {
    return (
      responses.length === 2 &&
      responses.every(hasNoPlace) &&
      computed.quotient !== undefined &&
      holds(responses[0], String(computed.quotient)) &&
      holds(responses[1], String(computed.remainder))
    );
  }
  if (boxScaffolds.some(isMultiBox)) return false;
  const powers = new Map<number, number>();
  const whole: ItemResponse[] = [];
  responses.forEach((resp, idx) => {
    const power = decimalPlacePower(resp.place);
    if (power === null) whole.push(resp);
    else powers.set(idx, power);
  });
  if (!whole.every((resp) => holds(resp, computed.value))) return false;
  if (powers.size === 0) return true;
  const digits = planPlaceDigits(powers, computed.value, whole.length === 0);
  return (
    digits !== null &&
    [...digits.values].every(([idx, digit]) => holds(responses[idx], digit)) &&
    digits.unreached.every((idx) => !isConcreteAnswer(responses[idx].answer) || holds(responses[idx], "0"))
  );
}

function unprovedItemAnswers(item: PageItem, section: PageSection, path: string): AnswerNote[] {
  const computed = completeAnswer(item.expr);
  if (!computed) return [];
  const note = (at: string, text: string): AnswerNote => ({
    kind: "unproved_answer",
    path: at,
    message: `${at}: ${text}`,
  });
  const values = answerValues(computed).map((v) => `"${v}"`).join(", ");
  const inPlaces = item.responses.filter((resp) => isAnswerBearingResponse(item, resp));
  const boxScaffolds = scaffoldsFor(section.scaffolds, item.n);
  if (
    planItemAnswers(item, computed, section.scaffolds).kind === "misfit" &&
    !answersAreProved(item, inPlaces, computed, boxScaffolds)
  ) {
    if (inPlaces.length === 0) return [note(path, `no answer place for the computed answer ${values}`)];
    const held = inPlaces.map((r) => (r.answer === null ? "nothing" : `"${r.answer}"`)).join(", ");
    return [note(path, `answer places hold ${held}, computed ${values}`)];
  }
  // A number in a checkbox or in the working space beside an answer place is an answer too.
  const right = [...answerValues(computed)];
  if (computed.kind === "single" && computed.quotient !== undefined) {
    right.push(String(computed.quotient), String(computed.remainder));
  }
  return item.responses.flatMap((resp, idx) => {
    if (isAnswerBearingResponse(item, resp) || resp.answer_source === "printed") return [];
    const held = isConcreteAnswer(resp.answer) ? plainNumber(resp.answer) : null;
    if (held === null || right.some((v) => normalizeAnswerCompare(v) === held)) return [];
    return [note(`${path}.responses[${idx}]`, `holds "${resp.answer}", computed ${values}`)];
  });
}

// Stored answers of items that code can compute but cannot prove: they do not fit the computed
// answer, so no computed value was written.
export function findUnprovedAnswers(record: ReferenceRecord | null | undefined): AnswerNote[] {
  if (!record || record.kind !== "page") return [];
  return record.sections.flatMap((section, si) =>
    section.items.flatMap((item) => unprovedItemAnswers(item, section, itemPathOf(si, item))),
  );
}
