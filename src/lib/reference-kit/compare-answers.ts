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
import type { RecordDifference } from "./compare-parts";

export const ANSWER_DISAGREEMENT_REASON = "readers disagree on an answer" as const;

const ANSWER_STEP_KINDS: ReadonlySet<ExampleStepKind> = new Set(["answer", "remainder"]);

// Exact paths derived from src/lib/reference-record/types.ts:
// - ItemResponse.answer (including any sub-part inside an answer value)
// - ExamplePart.shown_answer (including any sub-part)
// - ExampleStep.shows / ExampleStep.printed when shows is "answer" or "remainder"
// Note: none of the 10 Scaffold variants in types.ts has an answer field;
// printed answers for worked_item scaffolds live in ItemResponse.answer.
const ITEM_RESPONSE_ANSWER_RE =
  /^sections\[\d+\]\.items\[(?:n=)?\d+\]\.responses\[\d+\]\.answer(?:$|[.\[])/;
const EXAMPLE_SHOWN_ANSWER_RE = /^examples\[\d+\]\.parts\[\d+\]\.shown_answer(?:$|[.\[])/;
const EXAMPLE_STEP_SHOWS_RE = /^(examples\[\d+\]\.steps\[(?:n=)?\d+\])\.shows$/;
const EXAMPLE_STEP_PRINTED_RE = /^(examples\[(\d+)\]\.steps\[(n=)?(\d+)\])\.printed(?:$|[.\[])/;

// Container paths whose diff payload (d.a or d.b) may contain an answer.
const SECTION_PATH_RE = /^sections\[\d+\]$/;
const ITEM_PATH_RE = /^sections\[\d+\]\.items\[(?:n=)?\d+\]$/;
const RESPONSE_PATH_RE = /^sections\[\d+\]\.items\[(?:n=)?\d+\]\.responses\[\d+\]$/;
const EXAMPLES_LIST_RE = /^examples$/;
const EXAMPLE_PATH_RE = /^examples\[(?:b:)?\d+\]$/;
const EXAMPLE_PART_PATH_RE = /^examples\[\d+\]\.parts\[\d+\]$/;
const EXAMPLE_STEPS_LIST_RE = /^examples\[\d+\]\.steps$/;
const EXAMPLE_STEP_PATH_RE = /^examples\[\d+\]\.steps\[(?:n=|b:)?\d+\]$/;

function isRecordObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAnswerStepKind(value: unknown): boolean {
  return typeof value === "string" && ANSWER_STEP_KINDS.has(value as ExampleStepKind);
}

function hasAnswerValue(value: unknown): boolean {
  if (value === null || value === undefined || value === NOT_STATED) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function responseContainsAnswer(v: unknown): boolean {
  return isRecordObject(v) && hasAnswerValue((v as Partial<ItemResponse>).answer);
}

function itemContainsAnswer(v: unknown): boolean {
  if (!isRecordObject(v)) return false;
  const responses = (v as Partial<PageItem>).responses;
  return Array.isArray(responses) && responses.some(responseContainsAnswer);
}

function sectionContainsAnswer(v: unknown): boolean {
  if (!isRecordObject(v)) return false;
  const items = (v as Partial<PageSection>).items;
  return Array.isArray(items) && items.some(itemContainsAnswer);
}

function examplePartContainsAnswer(v: unknown): boolean {
  return isRecordObject(v) && hasAnswerValue((v as Partial<ExamplePart>).shown_answer);
}

function stepContainsAnswer(v: unknown): boolean {
  return isRecordObject(v) && isAnswerStepKind((v as Partial<ExampleStep>).shows);
}

function stepsListContainsAnswer(v: unknown): boolean {
  return Array.isArray(v) && v.some(stepContainsAnswer);
}

function exampleContainsAnswer(v: unknown): boolean {
  if (!isRecordObject(v)) return false;
  const ex = v as Partial<Example>;
  if (Array.isArray(ex.parts) && ex.parts.some(examplePartContainsAnswer)) return true;
  return stepsListContainsAnswer(ex.steps);
}

function examplesListContainsAnswer(v: unknown): boolean {
  return Array.isArray(v) && v.some(exampleContainsAnswer);
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

function containerDiffContainsAnswer(d: RecordDifference): boolean {
  if (SECTION_PATH_RE.test(d.path)) {
    return sectionContainsAnswer(d.a) || sectionContainsAnswer(d.b);
  }
  if (ITEM_PATH_RE.test(d.path)) {
    return itemContainsAnswer(d.a) || itemContainsAnswer(d.b);
  }
  if (RESPONSE_PATH_RE.test(d.path)) {
    return responseContainsAnswer(d.a) || responseContainsAnswer(d.b);
  }
  if (EXAMPLES_LIST_RE.test(d.path)) {
    return examplesListContainsAnswer(d.a) || examplesListContainsAnswer(d.b);
  }
  if (EXAMPLE_PATH_RE.test(d.path)) {
    return exampleContainsAnswer(d.a) || exampleContainsAnswer(d.b);
  }
  if (EXAMPLE_PART_PATH_RE.test(d.path)) {
    return examplePartContainsAnswer(d.a) || examplePartContainsAnswer(d.b);
  }
  if (EXAMPLE_STEPS_LIST_RE.test(d.path)) {
    return stepsListContainsAnswer(d.a) || stepsListContainsAnswer(d.b);
  }
  if (EXAMPLE_STEP_PATH_RE.test(d.path)) {
    return stepContainsAnswer(d.a) || stepContainsAnswer(d.b);
  }
  return false;
}

/**
 * Returns the deduplicated diff paths where the two readers disagree on an answer.
 *
 * Covers every answer location in `src/lib/reference-record/types.ts`:
 * - Item response `answer` (including digit boxes, remainders, printed answers, or nested sub-parts)
 * - Worked-example part `shown_answer`
 * - Worked-example step `shows` / `printed` for `"answer"` and `"remainder"` steps
 * - Whole one-sided or unmatched entries (`sections[i]`, `items[n=k]`, `responses[i]`,
 *   `examples`, `examples[i]`, `parts[i]`, `steps`, `steps[n=k]`) that contain an answer
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

    // Direct answer fields count for every diff kind (including wording on an answer field).
    if (ITEM_RESPONSE_ANSWER_RE.test(d.path) || EXAMPLE_SHOWN_ANSWER_RE.test(d.path)) {
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

    if (containerDiffContainsAnswer(d)) {
      add(d.path);
    }
  }

  return out;
}
