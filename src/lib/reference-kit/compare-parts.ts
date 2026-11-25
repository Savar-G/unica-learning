import {
  NOT_STATED,
  UNCLEAR,
  type Expr,
  type ItemResponse,
  type ReaderSentinel,
  type ScoreBand,
  type ScoreBands,
} from "@/lib/reference-record";
import { decimalPlacePower } from "./answers";
import { normalizeNotationText, normalizeProseText } from "./normalize";

// empty_answer: an answer place of the final record holds no answer and no "unclear" marker.
// wording: the readers chose different words to describe something (not printed text); does not block.
export type DiffKind =
  | "value"
  | "order"
  | "once_read"
  | "both_unclear"
  | "one_unclear"
  | "empty_answer"
  | "wording";

export interface RecordDifference {
  path: string;
  a: unknown;
  b: unknown;
  kind: DiffKind;
  // once_read and one-sided numbered entries: the reader that has the entry.
  // On a fresh final record (= reader A's record):
  // - entries reader A has and once-read scaffolds/examples/steps/marks carry final_path (ending
  //   in "[]" for list end; reader-B steps with insert_before name the element to insert ahead of).
  // - numbered entries (page items or contents topics) that only reader B has omit final_path and
  //   insert_before and carry reader_b_after / reader_b_before from reader B's own list.
  // On a kept record on disk (edited, human_checked, or invalid), final_path and insert_before are
  // omitted. missing_step is set on a reader-b mark whose step has no partner in reader a's record.
  reader?: "a" | "b";
  final_path?: string;
  insert_before?: number;
  reader_b_after?: number | null;
  reader_b_before?: number | null;
  missing_step?: boolean;
}

export type FieldCompareMode = "exact" | "prose" | "notation";

export interface CompareCounts {
  compared: number;
  agreed: number;
}

export function recordMatch(counts?: CompareCounts): void {
  if (!counts) return;
  counts.compared += 1;
  counts.agreed += 1;
}

export function recordDiff(
  diffs: RecordDifference[],
  diff: RecordDifference,
  counts?: CompareCounts,
): void {
  diffs.push(diff);
  if (!counts) return;
  counts.compared += 1;
  if (diff.kind === "wording") counts.agreed += 1;
}

const MATH_TOKEN_RE = /\d+(?:\.\d+)?|<=|>=|[+\-\u2212\u00D7\u00F7/=<>\u2264\u2265\u2260%^\u221A]/g;

function canonicalMathToken(token: string): string {
  if (token === "\u2212") return "-";
  if (token === "<=") return "\u2264";
  if (token === ">=") return "\u2265";
  return token;
}

function sameMathTokens(a: string, b: string): boolean {
  const tokensA = (a.match(MATH_TOKEN_RE) ?? []).map(canonicalMathToken);
  const tokensB = (b.match(MATH_TOKEN_RE) ?? []).map(canonicalMathToken);
  return tokensA.length === tokensB.length && tokensA.every((t, idx) => t === tokensB[idx]);
}

function isEmptyField(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Handles UNCLEAR and NOT_STATED sentinels consistently.
 * Returns true if the comparison was settled (either equal or diff pushed).
 */
export function checkSentinels(
  path: string,
  a: unknown,
  b: unknown,
  diffs: RecordDifference[],
  counts?: CompareCounts,
): boolean {
  if (a === UNCLEAR && b === UNCLEAR) {
    recordDiff(diffs, { path, a, b, kind: "both_unclear" }, counts);
    return true;
  }
  if (a === UNCLEAR || b === UNCLEAR) {
    recordDiff(diffs, { path, a: a ?? null, b: b ?? null, kind: "one_unclear" }, counts);
    return true;
  }
  if (a === NOT_STATED && b === NOT_STATED) {
    recordMatch(counts);
    return true;
  }
  if (a === NOT_STATED || b === NOT_STATED) {
    recordDiff(diffs, { path, a: a ?? null, b: b ?? null, kind: "value" }, counts);
    return true;
  }
  return false;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => deepEqual(item, b[idx]));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

export function compareField(
  path: string,
  a: unknown,
  b: unknown,
  opts: { teaching?: boolean; mode?: FieldCompareMode; wording?: boolean },
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  if (checkSentinels(path, a, b, diffs, counts)) return;
  const aEmpty = isEmptyField(a);
  const bEmpty = isEmptyField(b);
  if (aEmpty && bEmpty) return;
  if (aEmpty !== bEmpty) {
    recordDiff(
      diffs,
      { path, a: a ?? null, b: b ?? null, kind: opts.teaching ? "once_read" : "value" },
      counts,
    );
    return;
  }

  const diffKind: DiffKind = opts.wording ? "wording" : "value";

  if (typeof a === "string" && typeof b === "string") {
    const mode = opts.mode ?? "exact";
    const normA =
      mode === "prose"
        ? normalizeProseText(a)
        : mode === "notation"
          ? normalizeNotationText(a)
          : a.trim();
    const normB =
      mode === "prose"
        ? normalizeProseText(b)
        : mode === "notation"
          ? normalizeNotationText(b)
          : b.trim();
    if (normA !== normB) {
      const kind: DiffKind =
        opts.wording && sameMathTokens(normA, normB) ? "wording" : "value";
      recordDiff(diffs, { path, a, b, kind }, counts);
    } else {
      recordMatch(counts);
    }
    return;
  }

  if (!deepEqual(a, b)) {
    recordDiff(diffs, { path, a, b, kind: diffKind }, counts);
  } else {
    recordMatch(counts);
  }
}

export function compareListField(
  path: string,
  a: unknown,
  b: unknown,
  opts: { teaching?: boolean; mode?: FieldCompareMode; itemWording?: (av: unknown, bv: unknown) => boolean },
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  if (checkSentinels(path, a, b, diffs, counts)) return;
  const aEmpty = isEmptyField(a);
  const bEmpty = isEmptyField(b);
  if (aEmpty && bEmpty) return;
  if (aEmpty !== bEmpty) {
    recordDiff(
      diffs,
      { path, a: a ?? null, b: b ?? null, kind: opts.teaching ? "once_read" : "value" },
      counts,
    );
    return;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    compareField(path, a, b, opts, diffs, counts);
    return;
  }
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i >= a.length || i >= b.length) {
      const av = i < a.length ? a[i] : null;
      const bv = i < b.length ? b[i] : null;
      const kind: DiffKind = av === UNCLEAR || bv === UNCLEAR ? "one_unclear" : "value";
      recordDiff(diffs, { path: `${path}[${i}]`, a: av, b: bv, kind }, counts);
      continue;
    }
    const wording = opts.itemWording ? opts.itemWording(a[i], b[i]) : false;
    compareField(`${path}[${i}]`, a[i], b[i], { mode: opts.mode, wording }, diffs, counts);
  }
}

export function compareExpr(
  path: string,
  a: Expr | ReaderSentinel | null | undefined,
  b: Expr | ReaderSentinel | null | undefined,
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  if (checkSentinels(path, a, b, diffs, counts)) return;
  if (isEmptyField(a) && isEmptyField(b)) return;
  if (
    isEmptyField(a) ||
    isEmptyField(b) ||
    !a ||
    !b ||
    typeof a === "string" ||
    typeof b === "string"
  ) {
    recordDiff(diffs, { path, a: a ?? null, b: b ?? null, kind: "value" }, counts);
    return;
  }

  if (a.kind !== b.kind) {
    recordDiff(diffs, { path: `${path}.kind`, a: a.kind, b: b.kind, kind: "value" }, counts);
    return;
  }

  switch (a.kind) {
    case "arith": {
      const bArith = b as typeof a;
      compareField(`${path}.op`, a.op, bArith.op, {}, diffs, counts);
      compareListField(`${path}.operands`, a.operands, bArith.operands, {}, diffs, counts);
      return;
    }
    case "chain": {
      const bChain = b as typeof a;
      compareListField(`${path}.terms`, a.terms, bChain.terms, {}, diffs, counts);
      compareField(`${path}.step`, a.step, bChain.step, {}, diffs, counts);
      return;
    }
    case "missing": {
      const bMissing = b as typeof a;
      compareField(`${path}.op`, a.op, bMissing.op, {}, diffs, counts);
      compareListField(`${path}.operands`, a.operands, bMissing.operands, {}, diffs, counts);
      compareField(`${path}.result`, a.result, bMissing.result, {}, diffs, counts);
      return;
    }
    case "linked": {
      const bLinked = b as typeof a;
      compareExpr(`${path}.pair[0]`, a.pair[0], bLinked.pair[0], diffs, counts);
      compareExpr(`${path}.pair[1]`, a.pair[1], bLinked.pair[1], diffs, counts);
      compareField(
        `${path}.connector`,
        a.connector,
        bLinked.connector,
        { teaching: true, mode: "prose" },
        diffs,
        counts,
      );
      return;
    }
    case "word": {
      const bWord = b as typeof a;
      compareField(`${path}.text`, a.text, bWord.text, { mode: "prose" }, diffs, counts);
      compareField(`${path}.unit`, a.unit, bWord.unit, { teaching: true, mode: "prose" }, diffs, counts);
      const aInner = a.expr;
      const bInner = bWord.expr;
      if (
        typeof aInner === "object" &&
        aInner !== null &&
        typeof bInner === "object" &&
        bInner !== null
      ) {
        compareExpr(`${path}.expr`, aInner, bInner, diffs, counts);
      } else {
        compareField(`${path}.expr`, aInner, bInner, {}, diffs, counts);
      }
      return;
    }
    case "notation": {
      const bNot = b as typeof a;
      compareField(`${path}.latex`, a.latex, bNot.latex, { mode: "notation" }, diffs, counts);
      compareField(
        `${path}.figure`,
        a.figure,
        bNot.figure,
        { teaching: true, mode: "prose", wording: true },
        diffs,
        counts,
      );
      return;
    }
  }
}

export function compareResponses(
  path: string,
  aList: readonly ItemResponse[],
  bList: readonly ItemResponse[],
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  const maxLen = Math.max(aList.length, bList.length);
  for (let i = 0; i < maxLen; i += 1) {
    const rPath = `${path}[${i}]`;
    const ra = aList[i];
    const rb = bList[i];
    if (!ra || !rb) {
      recordDiff(diffs, { path: rPath, a: ra ?? null, b: rb ?? null, kind: "value" }, counts);
      continue;
    }
    // Two different digit boxes are two answer places: each reader has one that the other has not.
    const powers = [decimalPlacePower(ra.place), decimalPlacePower(rb.place)];
    if (powers[0] !== null && powers[1] !== null && powers[0] !== powers[1]) {
      recordDiff(diffs, { path: rPath, a: ra, b: rb, kind: "value" }, counts);
      continue;
    }
    compareField(`${rPath}.position`, ra.position, rb.position, {}, diffs, counts);
    compareField(`${rPath}.cue`, ra.cue, rb.cue, { teaching: true, mode: "prose" }, diffs, counts);
    compareField(`${rPath}.unit`, ra.unit, rb.unit, { teaching: true, mode: "prose" }, diffs, counts);
    compareField(`${rPath}.place`, ra.place, rb.place, { teaching: true, mode: "prose" }, diffs, counts);
    compareField(`${rPath}.answer`, ra.answer, rb.answer, {}, diffs, counts);
    // "reader" against "unchecked" or "computed" is no difference; an answer that one reader
    // reads as printed on the page and the other does not is one.
    if ((ra.answer_source === "printed") !== (rb.answer_source === "printed")) {
      recordDiff(
        diffs,
        { path: `${rPath}.answer_source`, a: ra.answer_source, b: rb.answer_source, kind: "value" },
        counts,
      );
    } else {
      recordMatch(counts);
    }
  }
}

export function compareScoreBands(
  path: string,
  a: ScoreBands | typeof UNCLEAR | typeof NOT_STATED,
  b: ScoreBands | typeof UNCLEAR | typeof NOT_STATED,
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  if (a === UNCLEAR && b === UNCLEAR) {
    recordDiff(diffs, { path, a, b, kind: "both_unclear" }, counts);
    return;
  }
  if (a === UNCLEAR || b === UNCLEAR) {
    recordDiff(diffs, { path, a, b, kind: "one_unclear" }, counts);
    return;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    compareField(path, a, b, {}, diffs, counts);
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    const bPath = `${path}[${i}]`;
    const ba: ScoreBand = a[i];
    const bb: ScoreBand = b[i];
    if (Array.isArray(ba) && Array.isArray(bb)) {
      compareField(`${bPath}[0]`, ba[0], bb[0], {}, diffs, counts);
      compareField(`${bPath}[1]`, ba[1], bb[1], {}, diffs, counts);
    } else {
      compareField(bPath, ba, bb, {}, diffs, counts);
    }
  }
}
