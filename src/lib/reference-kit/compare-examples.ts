import {
  NOT_STATED,
  UNCLEAR,
  type Example,
  type ExampleMark,
  type ExampleStep,
  type ReferenceRecord,
} from "@/lib/reference-record";
import {
  checkSentinels,
  compareExpr,
  compareField,
  type RecordDifference,
} from "./compare-parts";
import { normalizeNotationText, normalizeProseText } from "./normalize";

export interface UnnamedTeachingMark {
  kind: "step" | "mark" | "scaffold";
  path: string;
  description: string;
  reader: "a" | "b" | "both";
}

function stepPrintedKey(step: ExampleStep): string | null {
  if (typeof step.printed !== "string" || step.printed === UNCLEAR || step.printed === NOT_STATED) {
    return null;
  }
  const norm = normalizeNotationText(step.printed);
  return norm.length > 0 ? norm : null;
}

function sameConcreteShows(a: ExampleStep, b: ExampleStep): boolean {
  return (
    typeof a.shows === "string" &&
    a.shows !== UNCLEAR &&
    a.shows !== NOT_STATED &&
    a.shows === b.shows
  );
}

type AlignedStep =
  | { kind: "pair"; a: ExampleStep; b: ExampleStep }
  | { kind: "a_only"; a: ExampleStep }
  | { kind: "b_only"; b: ExampleStep; idxB: number; insertBeforeA: number };

// Aligns two step lists by longest common subsequence of equal normalized printed text,
// breaking ties in favour of equal `shows`, pairing remaining steps in order within each gap,
// and marking leftovers as once_read with their insertion index into reader A's list.
function alignExampleSteps(
  aList: readonly ExampleStep[],
  bList: readonly ExampleStep[],
): AlignedStep[] {
  const m = aList.length;
  const n = bList.length;
  const aKeys = aList.map(stepPrintedKey);
  const bKeys = bList.map(stepPrintedKey);
  // Each matched printed step scores `weight`, plus 1 when `shows` also agrees.
  // Because at most min(m, n) < weight steps can match, equal `shows` only breaks ties.
  const weight = Math.min(m, n) + 1;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
      if (aKeys[i] !== null && aKeys[i] === bKeys[j]) {
        const score = sameConcreteShows(aList[i], bList[j]) ? weight + 1 : weight;
        best = Math.max(best, dp[i + 1][j + 1] + score);
      }
      dp[i][j] = best;
    }
  }

  const anchors: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    const score =
      aKeys[i] !== null && aKeys[i] === bKeys[j]
        ? sameConcreteShows(aList[i], bList[j])
          ? weight + 1
          : weight
        : 0;
    if (score > 0 && dp[i][j] === dp[i + 1][j + 1] + score) {
      anchors.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const aligned: AlignedStep[] = [];
  let prevA = 0;
  let prevB = 0;
  for (const [nextA, nextB] of [...anchors, [m, n] as [number, number]]) {
    const gapA = nextA - prevA;
    const gapB = nextB - prevB;
    const pairedInGap = Math.min(gapA, gapB);
    for (let k = 0; k < pairedInGap; k += 1) {
      aligned.push({ kind: "pair", a: aList[prevA + k], b: bList[prevB + k] });
    }
    for (let k = pairedInGap; k < gapA; k += 1) {
      aligned.push({ kind: "a_only", a: aList[prevA + k] });
    }
    for (let k = pairedInGap; k < gapB; k += 1) {
      aligned.push({ kind: "b_only", b: bList[prevB + k], idxB: prevB + k, insertBeforeA: nextA });
    }
    if (nextA < m && nextB < n) {
      aligned.push({ kind: "pair", a: aList[nextA], b: bList[nextB] });
    }
    prevA = nextA + 1;
    prevB = nextB + 1;
  }

  return aligned;
}

interface StepAlignmentMap {
  bStepToAStep: Map<number, number>;
  unmatchedBSteps: Set<number>;
}

function compareExampleSteps(
  path: string,
  a: Example["steps"],
  b: Example["steps"],
  diffs: RecordDifference[],
): StepAlignmentMap {
  const bStepToAStep = new Map<number, number>();
  const unmatchedBSteps = new Set<number>();
  if (checkSentinels(path, a, b, diffs)) return { bStepToAStep, unmatchedBSteps };
  const aList: ExampleStep[] = Array.isArray(a) ? a : [];
  const bList: ExampleStep[] = Array.isArray(b) ? b : [];
  if (aList.length === 0 && bList.length === 0) return { bStepToAStep, unmatchedBSteps };

  const aligned = alignExampleSteps(aList, bList);
  for (const entry of aligned) {
    if (entry.kind === "a_only") {
      diffs.push({ path: `${path}[n=${entry.a.n}]`, a: entry.a, b: null, kind: "once_read" });
      continue;
    }
    if (entry.kind === "b_only") {
      unmatchedBSteps.add(entry.b.n);
      diffs.push({
        path: `${path}[b:${entry.idxB}]`,
        a: null,
        b: entry.b,
        kind: "once_read",
        ...(entry.insertBeforeA < aList.length ? { insert_before: entry.insertBeforeA } : {}),
      });
      continue;
    }
    const { a: sa, b: sb } = entry;
    bStepToAStep.set(sb.n, sa.n);
    const sPath = `${path}[n=${sa.n}]`;
    compareField(`${sPath}.shows`, sa.shows, sb.shows, {}, diffs);
    compareField(
      `${sPath}.shows_other`,
      sa.shows_other,
      sb.shows_other,
      { teaching: true, mode: "prose", wording: true },
      diffs,
    );
    compareField(
      `${sPath}.printed`,
      sa.printed,
      sb.printed,
      { teaching: true, mode: "notation" },
      diffs,
    );
    compareField(
      `${sPath}.note`,
      sa.note,
      sb.note,
      { teaching: true, mode: "prose" },
      diffs,
    );
  }
  return { bStepToAStep, unmatchedBSteps };
}

function markStepKey(m: ExampleMark): string {
  return `${String(m.kind)}:${m.step ?? ""}`;
}

function markFullKey(m: ExampleMark): string {
  const desc =
    typeof m.description === "string" && m.description !== UNCLEAR && m.description !== NOT_STATED
      ? normalizeProseText(m.description)
      : "";
  return `${markStepKey(m)}:${desc}`;
}

function compareSingleMark(
  path: string,
  a: ExampleMark,
  b: ExampleMark,
  diffs: RecordDifference[],
): void {
  compareField(`${path}.kind`, a.kind, b.kind, {}, diffs);
  compareField(`${path}.step`, a.step, b.step, { teaching: true }, diffs);
  const isLabel = a.kind === "label" || b.kind === "label";
  compareField(
    `${path}.description`,
    a.description,
    b.description,
    { teaching: true, mode: "prose", wording: !isLabel },
    diffs,
  );
}

function compareExampleMarks(
  path: string,
  a: Example["marks"],
  b: Example["marks"],
  diffs: RecordDifference[],
  stepAlignment: StepAlignmentMap,
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aList: ExampleMark[] = Array.isArray(a) ? a : [];
  const bOrig: ExampleMark[] = Array.isArray(b) ? b : [];
  if (aList.length === 0 && bOrig.length === 0) return;

  const { bStepToAStep, unmatchedBSteps } = stepAlignment;
  // Marks on an unmatched reader B step must stay unmatched rather than pairing with a reader A
  // mark that happens to share the same step number.
  const unmatchedBMarks = new Set<number>();
  const bList: ExampleMark[] = bOrig.map((m, idx) => {
    if (m.step === undefined) return m;
    if (unmatchedBSteps.has(m.step)) {
      unmatchedBMarks.add(idx);
      return m;
    }
    const mapped = bStepToAStep.get(m.step);
    return mapped !== undefined && mapped !== m.step ? { ...m, step: mapped } : m;
  });

  const matchedBForA = new Map<number, number>();
  const usedB = new Set<number>();

  // Pass 1: match by kind + step + normalized description
  aList.forEach((mA, idxA) => {
    const keyA = markFullKey(mA);
    const matchIdx = bList.findIndex(
      (mB, j) => !usedB.has(j) && !unmatchedBMarks.has(j) && markFullKey(mB) === keyA,
    );
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 2: match remaining by kind + step in order
  aList.forEach((mA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const keyA = markStepKey(mA);
    const matchIdx = bList.findIndex(
      (mB, j) => !usedB.has(j) && !unmatchedBMarks.has(j) && markStepKey(mB) === keyA,
    );
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 3: match remaining by kind only in order
  aList.forEach((mA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex(
      (mB, j) => !usedB.has(j) && !unmatchedBMarks.has(j) && mB.kind === mA.kind,
    );
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  aList.forEach((mA, idxA) => {
    const matchIdx = matchedBForA.get(idxA);
    if (matchIdx === undefined) {
      diffs.push({ path: `${path}[${idxA}]`, a: mA, b: null, kind: "once_read" });
    } else {
      compareSingleMark(`${path}[${idxA}]`, mA, bList[matchIdx], diffs);
    }
  });

  bOrig.forEach((mB, idxB) => {
    if (!usedB.has(idxB)) {
      diffs.push({ path: `${path}[b:${idxB}]`, a: null, b: mB, kind: "once_read" });
    }
  });
}

function compareSingleExample(
  path: string,
  a: Example,
  b: Example,
  diffs: RecordDifference[],
): void {
  compareField(`${path}.position`, a.position, b.position, {}, diffs);
  compareField(`${path}.relation`, a.relation, b.relation, {}, diffs);
  compareField(`${path}.label`, a.label, b.label, { teaching: true, mode: "prose" }, diffs);
  compareField(`${path}.text`, a.text, b.text, { teaching: true, mode: "prose" }, diffs);
  compareField(`${path}.cross_ref`, a.cross_ref, b.cross_ref, { teaching: true, mode: "prose" }, diffs);

  const maxParts = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < maxParts; i += 1) {
    const pPath = `${path}.parts[${i}]`;
    const pa = a.parts[i];
    const pb = b.parts[i];
    if (!pa || !pb) {
      diffs.push({ path: pPath, a: pa ?? null, b: pb ?? null, kind: "value" });
      continue;
    }
    compareField(`${pPath}.caption`, pa.caption, pb.caption, { teaching: true, mode: "prose" }, diffs);
    compareField(`${pPath}.form`, pa.form, pb.form, {}, diffs);
    compareExpr(`${pPath}.expr`, pa.expr, pb.expr, diffs);
    compareField(`${pPath}.shown_answer`, pa.shown_answer, pb.shown_answer, { teaching: true }, diffs);
  }

  const stepAlignment = compareExampleSteps(`${path}.steps`, a.steps, b.steps, diffs);
  compareExampleMarks(`${path}.marks`, a.marks, b.marks, diffs, stepAlignment);
}

function exampleLabelKey(ex: Example): string | null {
  if (typeof ex.label !== "string" || ex.label === UNCLEAR || ex.label === NOT_STATED) {
    return null;
  }
  const norm = normalizeProseText(ex.label);
  return norm.length > 0 ? norm : null;
}

export function compareExamples(
  path: string,
  a: Example[] | typeof UNCLEAR | typeof NOT_STATED,
  b: Example[] | typeof UNCLEAR | typeof NOT_STATED,
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aList = Array.isArray(a) ? a : [];
  const bList = Array.isArray(b) ? b : [];
  if (aList.length === 0 && bList.length === 0) return;

  const matchedBForA = new Map<number, number>();
  const usedB = new Set<number>();

  // Pass 1: match by normalized label first
  aList.forEach((exA, idxA) => {
    const labelA = exampleLabelKey(exA);
    if (!labelA) return;
    const matchIdx = bList.findIndex(
      (exB, j) => !usedB.has(j) && exampleLabelKey(exB) === labelA,
    );
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 2: match remaining exact-equal examples, then examples that differ only in wording
  aList.forEach((exA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex((exB, j) => {
      if (usedB.has(j)) return false;
      const probeDiffs: RecordDifference[] = [];
      compareSingleExample("probe", exA, exB, probeDiffs);
      return probeDiffs.length === 0;
    });
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });
  aList.forEach((exA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex((exB, j) => {
      if (usedB.has(j)) return false;
      const probeDiffs: RecordDifference[] = [];
      compareSingleExample("probe", exA, exB, probeDiffs);
      return probeDiffs.length > 0 && probeDiffs.every((d) => d.kind === "wording");
    });
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 3: match any remaining unmatched examples in positional order
  const remainingB = bList.map((_, j) => j).filter((j) => !usedB.has(j));
  let remCursor = 0;
  aList.forEach((_, idxA) => {
    if (matchedBForA.has(idxA)) return;
    if (remCursor < remainingB.length) {
      const matchIdx = remainingB[remCursor];
      remCursor += 1;
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  aList.forEach((exA, idxA) => {
    const matchIdx = matchedBForA.get(idxA);
    if (matchIdx === undefined) {
      diffs.push({ path: `${path}[${idxA}]`, a: exA, b: null, kind: "once_read" });
    } else {
      compareSingleExample(`${path}[${idxA}]`, exA, bList[matchIdx], diffs);
    }
  });

  bList.forEach((exB, idxB) => {
    if (!usedB.has(idxB)) {
      diffs.push({ path: `${path}[b:${idxB}]`, a: null, b: exB, kind: "once_read" });
    }
  });
}

function collectRecordUnnamedMarks(
  record: ReferenceRecord | null,
): Array<{ kind: "step" | "mark" | "scaffold"; path: string; description: string }> {
  if (!record || record.kind !== "page") return [];
  const items: Array<{ kind: "step" | "mark" | "scaffold"; path: string; description: string }> = [];

  if (Array.isArray(record.examples)) {
    record.examples.forEach((ex, ei) => {
      if (Array.isArray(ex.steps)) {
        for (const step of ex.steps) {
          if (step.shows === "other" && typeof step.shows_other === "string") {
            items.push({
              kind: "step",
              path: `examples[${ei}].steps[n=${step.n}]`,
              description: step.shows_other,
            });
          }
        }
      }
      if (Array.isArray(ex.marks)) {
        ex.marks.forEach((mark, mi) => {
          if (mark.kind === "other" && typeof mark.description === "string") {
            items.push({
              kind: "mark",
              path: `examples[${ei}].marks[${mi}]`,
              description: mark.description,
            });
          }
        });
      }
    });
  }

  record.sections.forEach((sec, si) => {
    if (Array.isArray(sec.scaffolds)) {
      sec.scaffolds.forEach((sc, sci) => {
        if (sc.kind === "other" && typeof sc.description === "string") {
          items.push({
            kind: "scaffold",
            path: `sections[${si}].scaffolds[${sci}]`,
            description: sc.description,
          });
        }
      });
    }
  });

  return items;
}

export function collectUnnamedTeachingMarks(
  a: ReferenceRecord | null,
  b: ReferenceRecord | null,
): UnnamedTeachingMark[] {
  const fromA = collectRecordUnnamedMarks(a);
  const fromB = collectRecordUnnamedMarks(b);
  const out: UnnamedTeachingMark[] = [];
  const seenKeyToIndex = new Map<string, number>();

  for (const item of fromA) {
    const key = `${item.kind}:${item.path}:${normalizeProseText(item.description)}`;
    seenKeyToIndex.set(key, out.length);
    out.push({ ...item, reader: "a" });
  }
  for (const item of fromB) {
    const key = `${item.kind}:${item.path}:${normalizeProseText(item.description)}`;
    const existingIdx = seenKeyToIndex.get(key);
    if (existingIdx !== undefined) {
      out[existingIdx] = { ...out[existingIdx], reader: "both" };
    } else {
      seenKeyToIndex.set(key, out.length);
      out.push({ ...item, reader: "b" });
    }
  }
  return out;
}
