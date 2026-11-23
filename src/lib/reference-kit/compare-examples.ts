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
import { normalizeProseText } from "./normalize";

export interface UnnamedTeachingMark {
  kind: "step" | "mark" | "scaffold";
  path: string;
  description: string;
  reader: "a" | "b" | "both";
}

function compareExampleSteps(
  path: string,
  a: Example["steps"],
  b: Example["steps"],
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aList: ExampleStep[] = Array.isArray(a) ? a : [];
  const bList: ExampleStep[] = Array.isArray(b) ? b : [];
  if (aList.length === 0 && bList.length === 0) return;

  const aMap = new Map<number, ExampleStep>();
  const bMap = new Map<number, ExampleStep>();
  const orderedNs: number[] = [];

  for (const step of aList) {
    aMap.set(step.n, step);
    orderedNs.push(step.n);
  }
  for (const step of bList) {
    bMap.set(step.n, step);
    if (!aMap.has(step.n)) orderedNs.push(step.n);
  }

  for (const n of orderedNs) {
    const sPath = `${path}[n=${n}]`;
    const sa = aMap.get(n);
    const sb = bMap.get(n);
    if (!sa || !sb) {
      diffs.push({ path: sPath, a: sa ?? null, b: sb ?? null, kind: "once_read" });
      continue;
    }
    compareField(`${sPath}.shows`, sa.shows, sb.shows, {}, diffs);
    compareField(
      `${sPath}.shows_other`,
      sa.shows_other,
      sb.shows_other,
      { teaching: true, mode: "prose" },
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
  compareField(
    `${path}.description`,
    a.description,
    b.description,
    { teaching: true, mode: "prose" },
    diffs,
  );
}

function compareExampleMarks(
  path: string,
  a: Example["marks"],
  b: Example["marks"],
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aList: ExampleMark[] = Array.isArray(a) ? a : [];
  const bList: ExampleMark[] = Array.isArray(b) ? b : [];
  if (aList.length === 0 && bList.length === 0) return;

  const matchedBForA = new Map<number, number>();
  const usedB = new Set<number>();

  // Pass 1: match by kind + step + normalized description
  aList.forEach((mA, idxA) => {
    const keyA = markFullKey(mA);
    const matchIdx = bList.findIndex((mB, j) => !usedB.has(j) && markFullKey(mB) === keyA);
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 2: match remaining by kind + step
  aList.forEach((mA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const keyA = markStepKey(mA);
    const matchIdx = bList.findIndex((mB, j) => !usedB.has(j) && markStepKey(mB) === keyA);
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 3: match remaining by kind only
  aList.forEach((mA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex((mB, j) => !usedB.has(j) && mB.kind === mA.kind);
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

  bList.forEach((mB, idxB) => {
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

  compareExampleSteps(`${path}.steps`, a.steps, b.steps, diffs);
  compareExampleMarks(`${path}.marks`, a.marks, b.marks, diffs);
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

  // Pass 2: match remaining exact-equal examples before positional fallback
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
