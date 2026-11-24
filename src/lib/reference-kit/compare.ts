import {
  NOT_STATED,
  type ContentsRecord,
  type Expr,
  type PageItem,
  type PageRecord,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { applyComputedAnswers, findEmptyAnswers } from "./answers";
import {
  collectUnnamedTeachingMarks,
  compareExamples,
  type UnnamedTeachingMark,
} from "./compare-examples";
import {
  compareExpr,
  compareField,
  compareResponses,
  compareScoreBands,
  deepEqual,
  recordDiff,
  type CompareCounts,
  type DiffKind,
  type RecordDifference,
} from "./compare-parts";
import { compareScaffolds } from "./compare-scaffolds";
import { normalizeNotationText, normalizeProseText } from "./normalize";

export type { CompareCounts, DiffKind, RecordDifference, UnnamedTeachingMark };
export { collectUnnamedTeachingMarks, normalizeNotationText, normalizeProseText };

export type PageStatus = "machine_read" | "agreement_accepted" | "double_read" | "human_checked";

export interface PageComparisonSummary {
  differences: RecordDifference[];
  wording: RecordDifference[];
  once_read: RecordDifference[];
  both_unclear: RecordDifference[];
  one_unclear: RecordDifference[];
  empty_answer: RecordDifference[];
  needs_person_read: boolean;
  counts: CompareCounts;
}

export function meetsAgreementThreshold(agreed: number, compared: number): boolean {
  return compared > 0 && agreed * 10 >= compared * 9;
}

export function agreementPercentage(agreed: number, compared: number): number | null {
  if (compared <= 0) return null;
  // Floor to 1 decimal place so < 90% never rounds up to 90% and < 100% never rounds up to 100%.
  return Math.floor((agreed * 1000) / compared) / 10;
}

function comparePageItems(
  path: string,
  aItems: readonly PageItem[],
  bItems: readonly PageItem[],
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  const aMap = new Map<number, PageItem>();
  const bMap = new Map<number, PageItem>();
  const orderedNs: number[] = [];

  for (const item of aItems) {
    aMap.set(item.n, item);
    orderedNs.push(item.n);
  }
  for (const item of bItems) {
    bMap.set(item.n, item);
    if (!aMap.has(item.n)) orderedNs.push(item.n);
  }

  const aCommonOrder = aItems.filter((item) => bMap.has(item.n)).map((item) => item.n);
  const bCommonOrder = bItems.filter((item) => aMap.has(item.n)).map((item) => item.n);
  if (aCommonOrder.some((n, idx) => n !== bCommonOrder[idx])) {
    recordDiff(
      diffs,
      {
        path,
        a: aItems.map((item) => item.n),
        b: bItems.map((item) => item.n),
        kind: "order",
      },
      counts,
    );
  }

  for (const n of orderedNs) {
    const iPath = `${path}[n=${n}]`;
    const ia = aMap.get(n);
    const ib = bMap.get(n);
    if (!ia || !ib) {
      recordDiff(diffs, { path: iPath, a: ia ?? null, b: ib ?? null, kind: "value" }, counts);
      continue;
    }

    compareField(
      `${iPath}.printed`,
      ia.printed,
      ib.printed,
      { mode: ia.expr === null && ib.expr === null ? "prose" : "notation" },
      diffs,
      counts,
    );

    compareField(`${iPath}.form`, ia.form, ib.form, {}, diffs, counts);
    compareExpr(`${iPath}.expr`, ia.expr, ib.expr, diffs, counts);
    compareResponses(`${iPath}.responses`, ia.responses, ib.responses, diffs, counts);
  }
}

function comparePageRecords(
  a: PageRecord,
  b: PageRecord,
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  compareField("topic.title", a.topic.title, b.topic.title, { mode: "prose" }, diffs, counts);
  compareField("topic.number", a.topic.number, b.topic.number, {}, diffs, counts);
  compareScoreBands("score_bands", a.score_bands, b.score_bands, diffs, counts);
  compareExamples("examples", a.examples, b.examples, diffs, counts);

  const maxSections = Math.max(a.sections.length, b.sections.length);
  for (let si = 0; si < maxSections; si += 1) {
    const sPath = `sections[${si}]`;
    const sa = a.sections[si];
    const sb = b.sections[si];
    if (!sa || !sb) {
      recordDiff(diffs, { path: sPath, a: sa ?? null, b: sb ?? null, kind: "value" }, counts);
      continue;
    }
    compareField(
      `${sPath}.instruction`,
      sa.instruction,
      sb.instruction,
      { teaching: true, mode: "prose" },
      diffs,
      counts,
    );
    compareScaffolds(
      `${sPath}.scaffolds`,
      sa.scaffolds,
      sb.scaffolds,
      diffs,
      { a: sa.items.map((item) => item.n), b: sb.items.map((item) => item.n) },
      counts,
    );
    comparePageItems(`${sPath}.items`, sa.items, sb.items, diffs, counts);
  }
}

function compareContentsRecords(
  a: ContentsRecord,
  b: ContentsRecord,
  diffs: RecordDifference[],
  counts?: CompareCounts,
): void {
  const aMap = new Map(a.topics.map((t) => [t.n, t]));
  const bMap = new Map(b.topics.map((t) => [t.n, t]));
  const orderedNs = [...a.topics.map((t) => t.n)];
  for (const t of b.topics) {
    if (!aMap.has(t.n)) orderedNs.push(t.n);
  }

  for (const n of orderedNs) {
    const tPath = `topics[n=${n}]`;
    const ta = aMap.get(n);
    const tb = bMap.get(n);
    if (!ta || !tb) {
      recordDiff(diffs, { path: tPath, a: ta ?? null, b: tb ?? null, kind: "value" }, counts);
      continue;
    }
    compareField(`${tPath}.title`, ta.title, tb.title, { mode: "prose" }, diffs, counts);
    compareField(`${tPath}.sheets`, ta.sheets, tb.sheets, {}, diffs, counts);
    compareField(`${tPath}.std_time_min`, ta.std_time_min, tb.std_time_min, {}, diffs, counts);
  }
}

export function compareRecordsWithCounts(
  a: ReferenceRecord,
  b: ReferenceRecord,
): { diffs: RecordDifference[]; counts: CompareCounts } {
  const diffs: RecordDifference[] = [];
  const counts: CompareCounts = { compared: 0, agreed: 0 };
  compareField("source_ref", a.source_ref, b.source_ref, {}, diffs, counts);
  if (a.kind !== b.kind) {
    recordDiff(diffs, { path: "kind", a: a.kind, b: b.kind, kind: "value" }, counts);
    return { diffs, counts };
  }
  if (a.kind === "page" && b.kind === "page") {
    comparePageRecords(a, b, diffs, counts);
  } else if (a.kind === "contents" && b.kind === "contents") {
    compareContentsRecords(a, b, diffs, counts);
  }
  return { diffs, counts };
}

export function compareRecords(a: ReferenceRecord, b: ReferenceRecord): RecordDifference[] {
  return compareRecordsWithCounts(a, b).diffs;
}

function exprHasWordOrFigure(expr: Expr | null | undefined): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case "word":
      return true;
    case "notation":
      return (
        typeof expr.figure === "string" &&
        expr.figure.trim().length > 0 &&
        expr.figure !== NOT_STATED
      );
    case "linked":
      return exprHasWordOrFigure(expr.pair[0]) || exprHasWordOrFigure(expr.pair[1]);
    default:
      return false;
  }
}

export function needsPersonRead(record: ReferenceRecord | null | undefined): boolean {
  if (!record || record.kind !== "page") return false;
  if (Array.isArray(record.examples) && record.examples.length > 0) return true;

  for (const section of record.sections) {
    if (Array.isArray(section.scaffolds)) {
      for (const sc of section.scaffolds) {
        if (sc.kind === "caption") return true;
      }
    }
    for (const item of section.items) {
      if (exprHasWordOrFigure(item.expr)) return true;
    }
  }
  return false;
}

const PATH_TOKEN_RE = /([A-Za-z_]+)|\[(\d+)\]|\[n=(\d+)\]|\[b:(\d+)\]/g;

// Follows a comparison path (with "[n=3]" item and step keys and "[b:1]" reader-b-only entries)
// through a record. Returns the JSON path of the place in that record and the value there.
function resolveDiffPath(
  record: unknown,
  path: string,
  insertBefore?: number,
): { jsonPath: string; value: unknown } {
  let node: unknown = record;
  let out = "";
  for (const m of path.matchAll(PATH_TOKEN_RE)) {
    const [, name, index, keyN, bIndex] = m;
    if (name !== undefined) {
      out += out ? `.${name}` : name;
      node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[name] : undefined;
    } else if (index !== undefined) {
      out += `[${index}]`;
      node = Array.isArray(node) ? node[Number(index)] : undefined;
    } else if (keyN !== undefined) {
      const n = Number(keyN);
      const found = Array.isArray(node)
        ? node.findIndex((e) => typeof e === "object" && e !== null && (e as { n?: unknown }).n === n)
        : -1;
      // Steps are numbered from 1 without gaps, so a missing step n belongs at index n - 1.
      out += `[${found === -1 ? n - 1 : found}]`;
      node = found === -1 ? undefined : (node as unknown[])[found];
    } else if (bIndex !== undefined) {
      out += insertBefore !== undefined ? `[${insertBefore}]` : "[]";
      node = undefined;
    }
  }
  return { jsonPath: out, value: node };
}

// The final record holds reader a's content. A once-read entry says which reader has it and where
// it belongs in the final record, so that a person can copy it after a look at the photo.
function locateOnceRead(d: RecordDifference, finalRecord: ReferenceRecord): RecordDifference {
  const reader: "a" | "b" = d.a !== null && d.a !== undefined ? "a" : "b";
  return {
    ...d,
    reader,
    final_path: resolveDiffPath(finalRecord, d.path, d.insert_before).jsonPath,
  };
}

function findEqualNode(node: unknown, target: unknown, path: string): string | null {
  if (path && deepEqual(node, target)) return path;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findEqualNode(node[i], target, `${path}[${i}]`);
      if (found !== null) return found;
    }
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      const found = findEqualNode(value, target, path ? `${path}.${key}` : key);
      if (found !== null) return found;
    }
  }
  return null;
}

// The part of a record that a once-read path belongs to: the same section or example index (or
// the whole list, for a whole section or example). Null when the path names no such part.
function onceReadParent(record: ReferenceRecord, path: string): { path: string; node: unknown } | null {
  const m = /^(sections|examples)(?:\[(\d+)\](?=[.[]))?/.exec(path);
  if (!m) return null;
  const list = (record as unknown as Record<string, unknown>)[m[1]];
  if (!Array.isArray(list)) return null;
  if (m[2] === undefined) return { path: m[1], node: list };
  const index = Number(m[2]);
  return index < list.length ? { path: `${m[1]}[${index}]`, node: list[index] } : null;
}

// The final record on disk is one that a person edited or checked, so reader a's indexes may not
// fit it. A once-read entry keeps a final_path only when the entry is in that record with equal
// content, inside the same section or example; otherwise the person finds the place.
export function locateOnceReadInKeptRecord(
  onceRead: readonly RecordDifference[],
  kept: ReferenceRecord | null,
): RecordDifference[] {
  return onceRead.map((d) => {
    const next: RecordDifference = { path: d.path, a: d.a, b: d.b, kind: d.kind };
    if (d.reader) next.reader = d.reader;
    if (!kept || !d.reader) {
      if (d.missing_step) next.missing_step = true;
      return next;
    }
    const entry = d.reader === "a" ? d.a : d.b;
    const parent = onceReadParent(kept, d.path);
    if (!parent) {
      if (d.missing_step) next.missing_step = true;
      return next;
    }
    const at = resolveDiffPath(kept, d.path);
    if (at.value !== undefined && deepEqual(at.value, entry)) {
      next.final_path = at.jsonPath;
    } else if (typeof entry === "object" && entry !== null) {
      const found = findEqualNode(parent.node, entry, parent.path);
      if (found !== null) next.final_path = found;
    }
    if (d.missing_step && next.final_path === undefined) next.missing_step = true;
    return next;
  });
}

export function emptyAnswerDiffs(
  finalRecord: ReferenceRecord | null,
  a: ReferenceRecord | null,
  b: ReferenceRecord | null,
): RecordDifference[] {
  // The same rule as reference:check: answer places are judged after computed answers are applied.
  const computed = finalRecord ? applyComputedAnswers(finalRecord).record : null;
  return findEmptyAnswers(computed).map((path) => ({
    path,
    a: a ? (resolveDiffPath(a, `${path}.answer`).value ?? null) : null,
    b: b ? (resolveDiffPath(b, `${path}.answer`).value ?? null) : null,
    kind: "empty_answer",
  }));
}

export function resolveSingleReadPaths(
  finalRecord: ReferenceRecord,
  diffs: readonly RecordDifference[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of diffs) {
    if (d.kind === "wording" || d.kind === "empty_answer") continue;
    const { jsonPath } = resolveDiffPath(finalRecord, d.path, d.insert_before);
    if (jsonPath && !seen.has(jsonPath)) {
      seen.add(jsonPath);
      out.push(jsonPath);
    }
  }
  return out;
}

export function classifyComparison(
  a: ReferenceRecord | null,
  b: ReferenceRecord | null,
): PageComparisonSummary {
  const { diffs: allDiffs, counts } =
    a && b ? compareRecordsWithCounts(a, b) : { diffs: [], counts: { compared: 0, agreed: 0 } };
  const oneUnclear = allDiffs.filter((d) => d.kind === "one_unclear");
  const differences = allDiffs.filter(
    (d) => d.kind === "value" || d.kind === "order" || d.kind === "one_unclear",
  );
  const wording = allDiffs.filter((d) => d.kind === "wording");
  const onceRead = allDiffs
    .filter((d) => d.kind === "once_read")
    .map((d) => (a ? locateOnceRead(d, a) : d));
  const bothUnclear = allDiffs.filter((d) => d.kind === "both_unclear");

  return {
    differences,
    wording,
    once_read: onceRead,
    both_unclear: bothUnclear,
    one_unclear: oneUnclear,
    empty_answer: emptyAnswerDiffs(a ?? b, a, b),
    needs_person_read: needsPersonRead(a) || needsPersonRead(b),
    counts,
  };
}

export interface DecideStatusInput {
  hasA: boolean;
  hasB: boolean;
  familyA: string | null;
  familyB: string | null;
  diffs: readonly RecordDifference[];
  sameDigest?: boolean;
  counts?: CompareCounts;
  hasAnswerConflict?: boolean;
  needsPersonRead?: boolean;
  editedByPerson?: boolean;
}

export interface PageDecision {
  status: PageStatus;
  stopReasons: string[];
}

export function decidePageOutcome(input: DecideStatusInput): PageDecision {
  const stopReasons: string[] = [];
  if (input.editedByPerson) stopReasons.push("edited by a person (not checked yet)");
  if (!input.hasA || !input.hasB) {
    stopReasons.push("missing reader");
  } else {
    if (input.sameDigest === false) stopReasons.push("different photo digest");
    if (!input.familyA || !input.familyB || input.familyA === input.familyB) {
      stopReasons.push("same or unknown model family");
    }
  }
  if (input.hasAnswerConflict) {
    stopReasons.push("stored answer conflicts with computed answer");
  }
  if (input.diffs.some((d) => d.kind === "empty_answer")) {
    stopReasons.push("empty answer place");
  }
  if (stopReasons.length > 0) {
    return { status: "machine_read", stopReasons };
  }

  if (input.counts && input.counts.compared <= 0) {
    return { status: "machine_read", stopReasons: ["no compared fields"] };
  }

  const hasCompareBlocking = input.diffs.some(
    (d) =>
      d.kind === "value" ||
      d.kind === "order" ||
      d.kind === "one_unclear" ||
      d.kind === "both_unclear" ||
      d.kind === "once_read",
  );
  if (!hasCompareBlocking) {
    return { status: "double_read", stopReasons: [] };
  }

  if (input.needsPersonRead) {
    return { status: "machine_read", stopReasons: ["prose must be read by a person"] };
  }
  if (input.counts && meetsAgreementThreshold(input.counts.agreed, input.counts.compared)) {
    return { status: "agreement_accepted", stopReasons: [] };
  }
  return { status: "machine_read", stopReasons: [] };
}

export function decideStatus(input: DecideStatusInput): PageStatus {
  return decidePageOutcome(input).status;
}
