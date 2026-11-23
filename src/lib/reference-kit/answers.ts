import {
  computeExprAnswer,
  NOT_STATED,
  UNCLEAR,
  type ComputedAnswer,
  type ItemResponse,
  type PageItem,
  type PageRecord,
  type ReferenceRecord,
} from "@/lib/reference-record";

const NON_ANSWER_POSITIONS = new Set<string>(["work_area", "checkbox"]);

export const KIT_REF_SEGMENT_RE = /^[A-Za-z0-9]+$/;

export function fileSlugFromRef(sourceRef: string): string {
  return sourceRef.replace(/:/g, "-");
}

// What code found when it computed the answers of one item.
// - answer_differs: a stored concrete answer (reader, printed, or an earlier computed one) is not the
//   computed value.
// - places_do_not_fit: the computed answers do not fit the answer places, so the stored answers
//   were kept.
// - place_not_reached: a higher decimal place that the computed value does not reach; the response
//   was kept as it is.
export type AnswerNoteKind = "answer_differs" | "places_do_not_fit" | "place_not_reached";

export interface AnswerNote {
  kind: AnswerNoteKind;
  path: string;
  message: string;
}

// Decimal place names that a reader may write in `place`, by power of ten.
const PLACE_POWERS = new Map<string, number>([
  ["one", 0],
  ["ones", 0],
  ["unit", 0],
  ["units", 0],
  ["ten", 1],
  ["tens", 1],
  ["hundred", 2],
  ["hundreds", 2],
  ["thousand", 3],
  ["thousands", 3],
  ["ten thousand", 4],
  ["ten thousands", 4],
]);

export function decimalPlacePower(place: unknown): number | null {
  if (typeof place !== "string") return null;
  const key = place
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/ (place|digit)$/, "");
  return PLACE_POWERS.get(key) ?? null;
}

function normalizeAnswerCompare(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[rR]\s*(\d+)/g, "R$1");
}

function isConcreteAnswer(answer: ItemResponse["answer"]): answer is string {
  return (
    typeof answer === "string" &&
    answer !== UNCLEAR &&
    answer !== NOT_STATED &&
    answer.trim().length > 0
  );
}

function isAnswerBearingResponse(resp: ItemResponse): boolean {
  return !NON_ANSWER_POSITIONS.has(resp.position);
}

function hasNoPlace(resp: ItemResponse): boolean {
  return resp.place === undefined || resp.place === null;
}

// How the computed answer of one item maps onto its responses.
type ItemAnswerPlan =
  | { kind: "none" }
  | { kind: "fill"; values: Map<number, string>; unreached: number[] }
  | { kind: "misfit"; message: string };

function planPlaceDigits(
  item: PageItem,
  answerIndices: readonly number[],
  value: string,
): { values: Map<number, string>; unreached: number[] } | null {
  if (!/^\d+$/.test(value)) return null;
  const powerByIndex = new Map<number, number>();
  const seen = new Set<number>();
  for (const idx of answerIndices) {
    const power = decimalPlacePower(item.responses[idx].place);
    if (power === null || seen.has(power)) return null;
    seen.add(power);
    powerByIndex.set(idx, power);
  }
  const digits = value.replace(/^0+(?=\d)/, "");
  for (let p = 0; p < digits.length; p += 1) {
    if (!seen.has(p)) return null;
  }
  const values = new Map<number, string>();
  const unreached: number[] = [];
  for (const [idx, power] of powerByIndex) {
    if (power < digits.length) {
      values.set(idx, digits[digits.length - 1 - power]);
    } else {
      unreached.push(idx);
    }
  }
  return { values, unreached };
}

function planItemAnswers(item: PageItem, computed: ComputedAnswer | null): ItemAnswerPlan {
  if (!computed) return { kind: "none" };
  const answerIndices: number[] = [];
  item.responses.forEach((resp, idx) => {
    if (isAnswerBearingResponse(resp)) answerIndices.push(idx);
  });

  if (computed.kind === "single") {
    if (answerIndices.length === 1) {
      return { kind: "fill", values: new Map([[answerIndices[0], computed.value]]), unreached: [] };
    }
    if (answerIndices.length > 1) {
      const hasRemainder = (computed.remainder ?? 0) > 0;
      // One value in several unnamed places (an equation box and an answer line).
      if (!hasRemainder && answerIndices.every((idx) => hasNoPlace(item.responses[idx]))) {
        return {
          kind: "fill",
          values: new Map(answerIndices.map((idx) => [idx, computed.value])),
          unreached: [],
        };
      }
      // One digit in each decimal place box.
      const byPlace = planPlaceDigits(item, answerIndices, computed.value);
      if (byPlace) return { kind: "fill", ...byPlace };
    }
    return {
      kind: "misfit",
      message: `computed single answer "${computed.value}" but item has ${answerIndices.length} answer-bearing response(s); kept reader answers`,
    };
  }

  // Multi-answer (chain blanks, linked pair parts)
  if (answerIndices.length === computed.values.length) {
    const values = new Map<number, string>();
    answerIndices.forEach((respIdx, slotIdx) => {
      const val = computed.values[slotIdx];
      if (val !== null) values.set(respIdx, val);
    });
    return { kind: "fill", values, unreached: [] };
  }
  return {
    kind: "misfit",
    message: `computed ${computed.values.length} answer(s) but item has ${answerIndices.length} answer-bearing response(s); kept reader answers`,
  };
}

function itemPathOf(sectionIndex: number, item: PageItem): string {
  return `sections[${sectionIndex}].items[n=${item.n}]`;
}

function fillResponse(
  resp: ItemResponse,
  value: string,
  path: string,
  notes: AnswerNote[],
): ItemResponse {
  const differs =
    isConcreteAnswer(resp.answer) &&
    normalizeAnswerCompare(resp.answer) !== normalizeAnswerCompare(value);
  if (differs) {
    const who =
      resp.answer_source === "printed"
        ? "page prints"
        : resp.answer_source === "computed"
          ? "record holds"
          : "reader gave";
    notes.push({
      kind: "answer_differs",
      path,
      message: `${path}: ${who} "${String(resp.answer)}", computed "${value}"`,
    });
  }
  // The page prints this answer: the record keeps what is printed.
  if (resp.answer_source === "printed") return resp;
  return { ...resp, answer: value, answer_source: "computed" };
}

function processItemAnswers(item: PageItem, sectionIndex: number, notes: AnswerNote[]): PageItem {
  const plan = planItemAnswers(item, computeExprAnswer(item.expr));
  const itemPath = itemPathOf(sectionIndex, item);
  if (plan.kind === "none") return item;
  if (plan.kind === "misfit") {
    notes.push({ kind: "places_do_not_fit", path: itemPath, message: `${itemPath}: ${plan.message}` });
    return item;
  }

  for (const idx of plan.unreached) {
    const resp = item.responses[idx];
    const path = `${itemPath}.responses[${idx}]`;
    if (isConcreteAnswer(resp.answer)) {
      notes.push({
        kind: "answer_differs",
        path,
        message: `${path}: place "${String(resp.place)}" holds "${resp.answer}", but the computed value does not reach this place`,
      });
    } else {
      notes.push({
        kind: "place_not_reached",
        path,
        message: `${path}: the computed value does not reach place "${String(resp.place)}"; kept as it is`,
      });
    }
  }

  const nextResponses = item.responses.map((resp, idx): ItemResponse => {
    const value = plan.values.get(idx);
    if (value === undefined) return resp;
    return fillResponse(resp, value, `${itemPath}.responses[${idx}]`, notes);
  });
  return { ...item, responses: nextResponses };
}

export function applyComputedAnswers(record: ReferenceRecord): {
  record: ReferenceRecord;
  notes: string[];
  details: AnswerNote[];
} {
  if (record.kind !== "page") {
    return { record, notes: [], details: [] };
  }
  const details: AnswerNote[] = [];
  const nextPage: PageRecord = {
    ...record,
    sections: record.sections.map((section, si) => ({
      ...section,
      items: section.items.map((item) => processItemAnswers(item, si, details)),
    })),
  };
  return { record: nextPage, notes: details.map((d) => d.message), details };
}

function isEmptyAnswer(answer: ItemResponse["answer"]): boolean {
  return answer === null || (typeof answer === "string" && answer.trim().length === 0);
}

// Answer places of question items that hold no answer and no "unclear" marker. A higher decimal
// place that the computed value does not reach may stay empty.
export function findEmptyAnswers(record: ReferenceRecord | null | undefined): string[] {
  if (!record || record.kind !== "page") return [];
  const paths: string[] = [];
  record.sections.forEach((section, si) => {
    for (const item of section.items) {
      if (item.expr === null) continue;
      const plan = planItemAnswers(item, computeExprAnswer(item.expr));
      const unreached = new Set(plan.kind === "fill" ? plan.unreached : []);
      item.responses.forEach((resp, ri) => {
        if (!isAnswerBearingResponse(resp) || unreached.has(ri)) return;
        if (isEmptyAnswer(resp.answer)) {
          paths.push(`${itemPathOf(si, item)}.responses[${ri}]`);
        }
      });
    }
  });
  return paths;
}
