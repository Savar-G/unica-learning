import {
  NOT_STATED,
  type Example,
  type ExamplePart,
  type ExampleStep,
  type ExampleStepKind,
  type ItemResponse,
  type PageItem,
  type PageRecord,
  type PageSection,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isAnswerBearingResponse } from "./answers";
import { pairedSection } from "./compare-align";
import type { RecordDifference } from "./compare-parts";

export const ANSWER_DISAGREEMENT_REASON = "readers disagree on an answer" as const;
export const EXPRESSION_DISAGREEMENT_REASON = "readers disagree on an expression" as const;
export const READER_ANSWER_CONFLICT_REASON =
  "a reader's answer differs from the computed answer" as const;

const ANSWER_STEP_KINDS: ReadonlySet<ExampleStepKind> = new Set(["answer", "remainder"]);

// Exact paths derived from src/lib/reference-record/types.ts:
// - ItemResponse.answer (including any sub-part inside an answer value)
// - ExamplePart.shown_answer (including any sub-part)
// - ExampleStep.shows / ExampleStep.printed when shows is "answer" or "remainder"
// - PageItem.expr / ExamplePart.expr (including nested linked.pair, word.expr, notation.figure)
// Note: none of the 10 Scaffold variants in types.ts has an answer or expr field;
// printed answers for worked_item scaffolds live in ItemResponse.answer.
const ITEM_RESPONSE_ANSWER_RE =
  /^sections\[(\d+)\]\.items\[(n=)?(\d+)\]\.responses\[(\d+)\]\.answer(?:$|[.\[])/;
const EXAMPLE_SHOWN_ANSWER_RE = /^examples\[\d+\]\.parts\[\d+\]\.shown_answer(?:$|[.\[])/;
const EXAMPLE_STEP_SHOWS_RE = /^(examples\[\d+\]\.steps\[(?:n=)?\d+\])\.shows$/;
const EXAMPLE_STEP_PRINTED_RE = /^(examples\[(\d+)\]\.steps\[(n=)?(\d+)\])\.printed(?:$|[.\[])/;
const ITEM_EXPR_RE = /^sections\[\d+\]\.items\[(?:n=)?\d+\]\.expr(?:$|[.\[])/;
const EXAMPLE_PART_EXPR_RE = /^examples\[\d+\]\.parts\[\d+\]\.expr(?:$|[.\[])/;

// Container paths whose diff payload (d.a or d.b) may contain an answer or an expression.
const SECTIONS_LIST_RE = /^sections$/;
const SECTION_PATH_RE = /^sections\[(?:b:)?\d+\]$/;
const ITEMS_LIST_RE = /^sections\[\d+\]\.items$/;
const ITEM_PATH_RE = /^sections\[\d+\]\.items\[(?:n=)?\d+\]$/;
const RESPONSE_PATH_RE = /^sections\[(\d+)\]\.items\[(n=)?(\d+)\]\.responses\[(\d+)\]$/;
const EXAMPLES_LIST_RE = /^examples$/;
const EXAMPLE_PATH_RE = /^examples\[(?:b:)?\d+\]$/;
const EXAMPLE_PARTS_LIST_RE = /^examples\[\d+\]\.parts$/;
const EXAMPLE_PART_PATH_RE = /^examples\[\d+\]\.parts\[(?:b:)?\d+\]$/;
const EXAMPLE_STEPS_LIST_RE = /^examples\[\d+\]\.steps$/;
const EXAMPLE_STEP_PATH_RE = /^examples\[\d+\]\.steps\[(?:n=|b:)?\d+\]$/;

interface ContainerPredicates {
  item?: (item: PageItem) => boolean;
  response?: (resp: ItemResponse, item?: PageItem) => boolean;
  examplePart?: (part: ExamplePart) => boolean;
  exampleStep?: (step: ExampleStep) => boolean;
}

function isRecordObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAnswerStepKind(value: unknown): boolean {
  return typeof value === "string" && ANSWER_STEP_KINDS.has(value as ExampleStepKind);
}

function hasFieldValue(value: unknown): boolean {
  if (value === null || value === undefined || value === NOT_STATED) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function responseMatches(
  v: unknown,
  pred: ContainerPredicates,
  item?: PageItem,
): boolean {
  return Boolean(pred.response && isRecordObject(v) && pred.response(v as unknown as ItemResponse, item));
}

function itemMatches(v: unknown, pred: ContainerPredicates): boolean {
  if (!isRecordObject(v)) return false;
  const item = v as unknown as PageItem;
  if (pred.item?.(item)) return true;
  if (
    pred.response &&
    Array.isArray(item.responses) &&
    item.responses.some((r) => responseMatches(r, pred, item))
  ) {
    return true;
  }
  return false;
}

function itemsListMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Array.isArray(v) && v.some((it) => itemMatches(it, pred));
}

function sectionMatches(v: unknown, pred: ContainerPredicates): boolean {
  return isRecordObject(v) && itemsListMatches((v as Partial<PageSection>).items, pred);
}

function sectionsListMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Array.isArray(v) && v.some((sec) => sectionMatches(sec, pred));
}

function examplePartMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Boolean(
    pred.examplePart && isRecordObject(v) && pred.examplePart(v as unknown as ExamplePart),
  );
}

function examplePartsListMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Boolean(
    pred.examplePart && Array.isArray(v) && v.some((p) => examplePartMatches(p, pred)),
  );
}

function exampleStepMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Boolean(
    pred.exampleStep && isRecordObject(v) && pred.exampleStep(v as unknown as ExampleStep),
  );
}

function exampleStepsListMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Boolean(
    pred.exampleStep && Array.isArray(v) && v.some((s) => exampleStepMatches(s, pred)),
  );
}

function exampleMatches(v: unknown, pred: ContainerPredicates): boolean {
  if (!isRecordObject(v)) return false;
  const ex = v as Partial<Example>;
  if (examplePartsListMatches(ex.parts, pred)) return true;
  return exampleStepsListMatches(ex.steps, pred);
}

function examplesListMatches(v: unknown, pred: ContainerPredicates): boolean {
  return Array.isArray(v) && v.some((ex) => exampleMatches(ex, pred));
}

function lookupExampleStep(
  record: ReferenceRecord | null | undefined,
  exampleIdx: number,
  byKeyN: boolean,
  num: number,
): ExampleStep | undefined {
  if (!record || record.kind !== "page") return undefined;
  const page: PageRecord = record;
  if (!Array.isArray(page.examples)) return undefined;
  const ex = page.examples[exampleIdx];
  if (!ex || !Array.isArray(ex.steps)) return undefined;
  return byKeyN ? ex.steps.find((s) => s.n === num) : ex.steps[num];
}

function lookupPageItem(
  record: ReferenceRecord | null | undefined,
  sectionIdx: number,
  byKeyN: boolean,
  num: number,
): PageItem | undefined {
  if (!record || record.kind !== "page") return undefined;
  const section = record.sections[sectionIdx];
  if (!section || !Array.isArray(section.items)) return undefined;
  return byKeyN ? section.items.find((it) => it.n === num) : section.items[num];
}

// The item that a difference path names, in both readings. The path has reader a's section number.
function lookupItemPair(
  match: RegExpExecArray,
  records?: { a?: ReferenceRecord | null; b?: ReferenceRecord | null },
): { itemA: PageItem | undefined; itemB: PageItem | undefined } {
  const sectionA = Number(match[1]);
  const byKeyN = match[2] !== undefined;
  const itemNum = Number(match[3]);
  const { a, b } = records ?? {};
  const sectionB = a?.kind === "page" && b?.kind === "page" ? pairedSection(a, b, sectionA) : sectionA;
  return {
    itemA: lookupPageItem(a, sectionA, byKeyN, itemNum),
    itemB: sectionB === null ? undefined : lookupPageItem(b, sectionB, byKeyN, itemNum),
  };
}

function isAnswerBearingSlotDiff(
  match: RegExpExecArray,
  records?: { a?: ReferenceRecord | null; b?: ReferenceRecord | null },
): boolean {
  const respIdx = Number(match[4]);
  const { itemA, itemB } = lookupItemPair(match, records);
  const respA = itemA?.responses[respIdx];
  const respB = itemB?.responses[respIdx];
  if (!respA && !respB) return true;
  return Boolean(
    (itemA && respA && isAnswerBearingResponse(itemA, respA)) ||
      (itemB && respB && isAnswerBearingResponse(itemB, respB)),
  );
}

function containerDiffMatches(
  d: RecordDifference,
  pred: ContainerPredicates,
  records?: { a?: ReferenceRecord | null; b?: ReferenceRecord | null },
): boolean {
  if (SECTIONS_LIST_RE.test(d.path)) {
    return sectionsListMatches(d.a, pred) || sectionsListMatches(d.b, pred);
  }
  if (SECTION_PATH_RE.test(d.path)) {
    return sectionMatches(d.a, pred) || sectionMatches(d.b, pred);
  }
  if (ITEMS_LIST_RE.test(d.path)) {
    return itemsListMatches(d.a, pred) || itemsListMatches(d.b, pred);
  }
  if (ITEM_PATH_RE.test(d.path)) {
    return itemMatches(d.a, pred) || itemMatches(d.b, pred);
  }
  const responseMatch = pred.response ? RESPONSE_PATH_RE.exec(d.path) : null;
  if (responseMatch) {
    const { itemA, itemB } = lookupItemPair(responseMatch, records);
    return responseMatches(d.a, pred, itemA) || responseMatches(d.b, pred, itemB);
  }
  if (EXAMPLES_LIST_RE.test(d.path)) {
    return examplesListMatches(d.a, pred) || examplesListMatches(d.b, pred);
  }
  if (EXAMPLE_PATH_RE.test(d.path)) {
    return exampleMatches(d.a, pred) || exampleMatches(d.b, pred);
  }
  if (EXAMPLE_PARTS_LIST_RE.test(d.path)) {
    return examplePartsListMatches(d.a, pred) || examplePartsListMatches(d.b, pred);
  }
  if (EXAMPLE_PART_PATH_RE.test(d.path)) {
    return examplePartMatches(d.a, pred) || examplePartMatches(d.b, pred);
  }
  if (EXAMPLE_STEPS_LIST_RE.test(d.path)) {
    return exampleStepsListMatches(d.a, pred) || exampleStepsListMatches(d.b, pred);
  }
  if (EXAMPLE_STEP_PATH_RE.test(d.path)) {
    return exampleStepMatches(d.a, pred) || exampleStepMatches(d.b, pred);
  }
  return false;
}

const ANSWER_CONTAINER_PREDICATES: ContainerPredicates = {
  response: (resp, item) => (!item || isAnswerBearingResponse(item, resp)) && hasFieldValue(resp.answer),
  examplePart: (part) => hasFieldValue(part.shown_answer),
  exampleStep: (step) => isAnswerStepKind(step.shows),
};

const EXPRESSION_CONTAINER_PREDICATES: ContainerPredicates = {
  item: (item) => hasFieldValue(item.expr),
  examplePart: (part) => hasFieldValue(part.expr),
};

/**
 * Returns the deduplicated diff paths where the two readers disagree on an answer.
 *
 * Covers every answer location in `src/lib/reference-record/types.ts`:
 * - Item response `answer` (including digit boxes, remainders, printed answers, or nested sub-parts)
 * - Worked-example part `shown_answer`
 * - Worked-example step `shows` / `printed` for `"answer"` and `"remainder"` steps
 * - Whole one-sided or unmatched entries (`sections`, `sections[i]`, `items`, `items[n=k]`,
 *   `responses[i]`, `examples`, `examples[i]`, `parts`, `parts[i]`, `steps`, `steps[n=k]`)
 *   that contain an answer
 */
export function findAnswerDisagreements(
  diffs: readonly RecordDifference[],
  records?: { a?: ReferenceRecord | null; b?: ReferenceRecord | null },
): string[] {
  const answerStepPrefixes = new Set<string>();
  for (const d of diffs) {
    if (d.kind === "empty_answer" || d.kind === "order") continue;
    const m = EXAMPLE_STEP_SHOWS_RE.exec(d.path);
    if (m && (isAnswerStepKind(d.a) || isAnswerStepKind(d.b))) {
      answerStepPrefixes.add(m[1]);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  };

  for (const d of diffs) {
    if (d.kind === "empty_answer" || d.kind === "order") continue;

    // Direct answer fields count for every diff kind (including wording on an answer field),
    // except non-answer slots (checkbox and secondary work_area per answers.ts).
    const itemAnswerMatch = ITEM_RESPONSE_ANSWER_RE.exec(d.path);
    if (itemAnswerMatch) {
      if (isAnswerBearingSlotDiff(itemAnswerMatch, records)) {
        add(d.path);
      }
      continue;
    }
    if (EXAMPLE_SHOWN_ANSWER_RE.test(d.path)) {
      add(d.path);
      continue;
    }

    const showsMatch = EXAMPLE_STEP_SHOWS_RE.exec(d.path);
    if (showsMatch && (isAnswerStepKind(d.a) || isAnswerStepKind(d.b))) {
      add(d.path);
      continue;
    }

    const printedMatch = EXAMPLE_STEP_PRINTED_RE.exec(d.path);
    if (printedMatch) {
      const [, prefix, exIdxStr, keyN, numStr] = printedMatch;
      if (answerStepPrefixes.has(prefix)) {
        add(d.path);
        continue;
      }
      const exIdx = Number(exIdxStr);
      const num = Number(numStr);
      const byKeyN = keyN !== undefined;
      const stepA = lookupExampleStep(records?.a, exIdx, byKeyN, num);
      const step = stepA ?? lookupExampleStep(records?.b, exIdx, byKeyN, num);
      if (step && isAnswerStepKind(step.shows)) {
        add(d.path);
      }
      continue;
    }

    if (d.kind === "wording") continue;

    if (containerDiffMatches(d, ANSWER_CONTAINER_PREDICATES, records)) {
      add(d.path);
    }
  }

  return out;
}

/**
 * Returns the deduplicated diff paths where the two readers disagree on an expression.
 *
 * Covers every expression location in `src/lib/reference-record/types.ts`:
 * - `PageItem.expr` and `ExamplePart.expr` (including nested `linked.pair`, `word.expr`, `notation.figure`)
 *   for every difference kind except `empty_answer` and `wording` (`wording` on `notation.figure` means
 *   that both readers describe the same figure with the same numbers and math symbols: it is agreement)
 * - Whole one-sided or unmatched entries (`sections`, `sections[i]`, `items`, `items[n=k]`,
 *   `examples`, `examples[i]`, `parts`, `parts[i]`) that contain a non-null expression
 */
export function findExpressionDisagreements(diffs: readonly RecordDifference[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  };

  for (const d of diffs) {
    if (d.kind === "empty_answer" || d.kind === "wording") continue;

    if (ITEM_EXPR_RE.test(d.path) || EXAMPLE_PART_EXPR_RE.test(d.path)) {
      add(d.path);
      continue;
    }

    if (d.kind === "order") continue;

    if (containerDiffMatches(d, EXPRESSION_CONTAINER_PREDICATES)) {
      add(d.path);
    }
  }

  return out;
}
