import {
  computeExprAnswer,
  UNCLEAR,
  type ComputedAnswer,
  type ComputedSingleAnswer,
  type AnswerBoxesScaffold,
  type ItemResponse,
  type PageItem,
  type PageSection,
  type PageRecord,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isConcreteAnswer, normalizeAnswerCompare } from "./answer-text";

const NON_ANSWER_POSITIONS = new Set<string>(["work_area", "checkbox"]);

export const KIT_REF_SEGMENT_RE = /^[A-Za-z0-9]+$/;

export function fileSlugFromRef(sourceRef: string): string {
  return sourceRef.replace(/:/g, "-");
}

// What code found when it computed the answers of one item.
// - answer_differs: a stored concrete answer (reader, printed, or an earlier computed one) is not the
//   computed value.
// - unclear_filled: a reader marked the answer "unclear" and code replaced it with the computed value.
// - places_do_not_fit: the computed answers do not fit the answer places, so the stored answers
//   were kept.
// - unproved_answer: a stored answer of an item that code can compute, and that the rules above
//   cannot prove.
// - printed_differs: the printed line does not say what the stored expression says.
// - place_not_reached: a higher decimal place that the computed value does not reach; the response
//   was kept as it is.
export type AnswerNoteKind =
  | "answer_differs"
  | "unclear_filled"
  | "places_do_not_fit"
  | "unproved_answer"
  | "printed_differs"
  | "place_not_reached";

export interface AnswerNote {
  kind: AnswerNoteKind;
  path: string;
  message: string;
}

export interface StoredAnswerNote {
  kind: AnswerNoteKind;
  path: string;
}

const ANSWER_DIFFERS_VALUE_RE =
  /^(sections\[\d+\]\.items\[n=\d+\]\.responses\[\d+\]): (?:reader gave|page prints|record holds) "[\s\S]*", computed "[\s\S]*"$/;
const ANSWER_DIFFERS_UNREACHED_RE =
  /^(sections\[\d+\]\.items\[n=\d+\]\.responses\[\d+\]): place "[\s\S]*" holds "[\s\S]*", but the computed value does not reach this place$/;

export function parseAnswerDiffersPath(note: string): string | null {
  const match = ANSWER_DIFFERS_VALUE_RE.exec(note) ?? ANSWER_DIFFERS_UNREACHED_RE.exec(note);
  return match ? match[1] : null;
}

export function collectReadTimeAnswerConflicts(
  reader: "a" | "b",
  notes: readonly string[],
  details?: readonly StoredAnswerNote[],
  opts?: { excludePaths?: ReadonlySet<string> },
): string[] {
  const excluded = opts?.excludePaths;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (body: string): void => {
    const entry = `reader ${reader}: ${body}`;
    if (!seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  };
  if (Array.isArray(details)) {
    const notesByPath = new Map<string, string[]>();
    for (const note of notes) {
      const path = parseAnswerDiffersPath(note);
      if (path !== null) {
        const list = notesByPath.get(path) ?? [];
        list.push(note);
        notesByPath.set(path, list);
      }
    }
    for (const detail of details) {
      if (detail?.kind !== "answer_differs" || typeof detail.path !== "string") continue;
      if (excluded?.has(detail.path)) continue;
      const matched = notesByPath.get(detail.path);
      if (matched && matched.length > 0) {
        for (const note of matched) add(note);
      } else {
        add(detail.path);
      }
    }
    return out;
  }
  for (const note of notes) {
    const path = parseAnswerDiffersPath(note);
    if (path !== null && !excluded?.has(path)) add(note);
  }
  return out;
}

export function collectReadTimeUnclearAnswers(
  reader: "a" | "b",
  details?: readonly StoredAnswerNote[],
): string[] {
  if (!Array.isArray(details)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const detail of details) {
    if (detail?.kind === "unclear_filled" && typeof detail.path === "string") {
      const answerPath = detail.path.endsWith(".answer") ? detail.path : `${detail.path}.answer`;
      const entry = `reader ${reader}: ${answerPath}`;
      if (!seen.has(entry)) {
        seen.add(entry);
        out.push(entry);
      }
    }
  }
  return out;
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

// Fractional decimal place names (known place names, not mapped to whole-number powers).
const FRACTIONAL_PLACE_NAMES = new Set<string>([
  "tenth",
  "tenths",
  "hundredth",
  "hundredths",
  "thousandth",
  "thousandths",
  "ten thousandth",
  "ten thousandths",
]);

function normalizePlaceKey(place: unknown): string | null {
  if (typeof place !== "string") return null;
  return place
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/ (place|digit)$/, "");
}

export function decimalPlacePower(place: unknown): number | null {
  const key = normalizePlaceKey(place);
  return key === null ? null : (PLACE_POWERS.get(key) ?? null);
}

export function isKnownPlaceName(place: unknown): boolean {
  const key = normalizePlaceKey(place);
  return key !== null && (PLACE_POWERS.has(key) || FRACTIONAL_PLACE_NAMES.has(key));
}

// A division can print a quotient place and a remainder place. One value must not go into both.
export function isDivisionExpr(expr: PageItem["expr"]): boolean {
  if (!expr) return false;
  if (expr.kind === "word") {
    const inner = expr.expr;
    return typeof inner === "object" && inner !== null && isDivisionExpr(inner);
  }
  return (expr.kind === "arith" || expr.kind === "missing") && expr.op === "div";
}

function isSoleWorkArea(item: PageItem, resp: ItemResponse): boolean {
  return item.expr !== null && item.responses.length === 1 && resp.position === "work_area";
}

export function isAnswerBearingResponse(item: PageItem, resp: ItemResponse): boolean {
  if (!NON_ANSWER_POSITIONS.has(resp.position)) return true;
  return isSoleWorkArea(item, resp);
}

export function hasNoPlace(resp: ItemResponse): boolean {
  return resp.place === undefined || resp.place === null;
}

// How the computed answer of one item maps onto its responses.
type ItemAnswerPlan =
  | { kind: "none" }
  | { kind: "fill"; values: Map<number, string>; unreached: number[] }
  | { kind: "misfit"; message: string };

// The decimal place power of each answer index, from the given place names. Null when a name is
// not a known decimal place or two names give one place.
function placePowers(
  answerIndices: readonly number[],
  names: readonly unknown[],
): Map<number, number> | null {
  const powerByIndex = new Map<number, number>();
  const seen = new Set<number>();
  for (let i = 0; i < answerIndices.length; i += 1) {
    const power = decimalPlacePower(names[i]);
    if (power === null || seen.has(power)) return null;
    seen.add(power);
    powerByIndex.set(answerIndices[i], power);
  }
  return powerByIndex;
}

// One digit of a whole number in each decimal place box. With `requireFit`, every digit of the
// value must have a box.
export function planPlaceDigits(
  powerByIndex: Map<number, number>,
  value: string,
  requireFit: boolean,
): { values: Map<number, string>; unreached: number[] } | null {
  if (!/^\d+$/.test(value)) return null;
  const digits = value.replace(/^0+(?=\d)/, "");
  const powers = new Set(powerByIndex.values());
  if (requireFit) {
    for (let p = 0; p < digits.length; p += 1) {
      if (!powers.has(p)) return null;
    }
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

export function scaffoldsFor(scaffolds: PageSection["scaffolds"], n: number): AnswerBoxesScaffold[] {
  if (!Array.isArray(scaffolds)) return [];
  return scaffolds.filter(
    (sc): sc is AnswerBoxesScaffold =>
      sc.kind === "answer_boxes" &&
      (sc.applies_to === "all" || (Array.isArray(sc.applies_to) && sc.applies_to.includes(n))),
  );
}

export function isMultiBox(sc: AnswerBoxesScaffold): boolean {
  return (
    (typeof sc.box_count === "number" && sc.box_count > 1) ||
    (Array.isArray(sc.places) && sc.places.length > 1)
  );
}

function planSingleInPlaces(
  item: PageItem,
  answerIndices: readonly number[],
  computed: ComputedSingleAnswer,
  boxScaffolds: readonly AnswerBoxesScaffold[],
): ItemAnswerPlan | null {
  const responses = answerIndices.map((idx) => item.responses[idx]);
  // Every place names a decimal place: one digit in each.
  if (responses.every((r) => !hasNoPlace(r))) {
    const powers = placePowers(answerIndices, responses.map((r) => r.place));
    const byPlace = powers && planPlaceDigits(powers, computed.value, true);
    return byPlace ? { kind: "fill", ...byPlace } : null;
  }
  // Some digit boxes have no place, but a scaffold names the places in order. It fills the
  // missing names when every name that is present agrees with it.
  const named = boxScaffolds.find(
    (sc) => Array.isArray(sc.places) && sc.places.length === answerIndices.length,
  );
  if (named && Array.isArray(named.places)) {
    const scaffoldPlaces = named.places;
    const agrees = responses.every((r, i) => {
      if (hasNoPlace(r)) return true;
      const power = decimalPlacePower(r.place);
      return power !== null && power === decimalPlacePower(scaffoldPlaces[i]);
    });
    if (!agrees) return null;
    const names = responses.map((r, i) => (hasNoPlace(r) ? scaffoldPlaces[i] : r.place));
    const powers = placePowers(answerIndices, names);
    const byPlace = powers && planPlaceDigits(powers, computed.value, true);
    return byPlace ? { kind: "fill", ...byPlace } : null;
  }
  if (!responses.every(hasNoPlace)) return null;
  // One value in several places (an equation box and an answer line): only when no scaffold
  // prints digit boxes, every stored answer already is that value, and the item is not a division
  // (its places can be a quotient and a remainder).
  const value = normalizeAnswerCompare(computed.value);
  if (
    (computed.remainder ?? 0) === 0 &&
    !isDivisionExpr(item.expr) &&
    !boxScaffolds.some(isMultiBox) &&
    responses.every((r) => !isConcreteAnswer(r.answer) || normalizeAnswerCompare(r.answer) === value)
  ) {
    return {
      kind: "fill",
      values: new Map(answerIndices.map((idx) => [idx, computed.value])),
      unreached: [],
    };
  }
  return null;
}

export function planItemAnswers(
  item: PageItem,
  computed: ComputedAnswer | null,
  sectionScaffolds: PageSection["scaffolds"],
): ItemAnswerPlan {
  if (!computed) return { kind: "none" };
  const answerIndices: number[] = [];
  item.responses.forEach((resp, idx) => {
    if (isAnswerBearingResponse(item, resp)) answerIndices.push(idx);
  });

  if (computed.kind === "single") {
    if (answerIndices.length === 1) {
      const only = answerIndices[0];
      // A sole work_area on an inexact division may expect a decimal or a remainder; keep the stored answer.
      if (isSoleWorkArea(item, item.responses[only]) && (computed.remainder ?? 0) > 0) {
        return { kind: "none" };
      }
      const power = decimalPlacePower(item.responses[only].place);
      if (power === null) {
        return { kind: "fill", values: new Map([[only, computed.value]]), unreached: [] };
      }
      // One box with a decimal place gets the digit of that place.
      const byPlace = planPlaceDigits(new Map([[only, power]]), computed.value, false);
      if (byPlace) return { kind: "fill", ...byPlace };
    } else if (answerIndices.length > 1) {
      const plan = planSingleInPlaces(
        item,
        answerIndices,
        computed,
        scaffoldsFor(sectionScaffolds, item.n),
      );
      if (plan) return plan;
    }
    return {
      kind: "misfit",
      message: `computed single answer "${computed.value}" but it does not fit the ${answerIndices.length} answer-bearing response(s); kept reader answers`,
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

export function itemPathOf(sectionIndex: number, item: PageItem): string {
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
  if (resp.answer === UNCLEAR) {
    notes.push({
      kind: "unclear_filled",
      path,
      message: `${path}: reader marked "unclear", computed "${value}"`,
    });
  }
  return { ...resp, answer: value, answer_source: "computed" };
}

function processItemAnswers(
  item: PageItem,
  section: PageSection,
  sectionIndex: number,
  notes: AnswerNote[],
): PageItem {
  const plan = planItemAnswers(item, computeExprAnswer(item.expr), section.scaffolds);
  const itemPath = itemPathOf(sectionIndex, item);
  if (plan.kind === "none") return item;
  if (plan.kind === "misfit") {
    notes.push({ kind: "places_do_not_fit", path: itemPath, message: `${itemPath}: ${plan.message}` });
    return item;
  }

  for (const idx of plan.unreached) {
    const resp = item.responses[idx];
    const path = `${itemPath}.responses[${idx}]`;
    // A leading "0" in a place that the value does not reach is correct.
    if (isConcreteAnswer(resp.answer) && resp.answer.trim() === "0") continue;
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
      items: section.items.map((item) => processItemAnswers(item, section, si, details)),
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
      const plan = planItemAnswers(item, computeExprAnswer(item.expr), section.scaffolds);
      const unreached = new Set(plan.kind === "fill" ? plan.unreached : []);
      item.responses.forEach((resp, ri) => {
        if (!isAnswerBearingResponse(item, resp) || unreached.has(ri)) return;
        if (isEmptyAnswer(resp.answer)) {
          paths.push(`${itemPathOf(si, item)}.responses[${ri}]`);
        }
      });
    }
  });
  return paths;
}
