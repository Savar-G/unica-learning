// Split questions without reading labels or model answers. Identical printed questions stay together.
import { calibrateGate } from "@/lib/workbook-gates";

type Gate = "reading_level" | "one_right_answer";
export type GateCase = { id: string; grade: number; interest: string | null; question: unknown; originalId?: string; gate?: string };
export type GateRow = { model: string; id: string; gate: Gate; changed: boolean; probability: number };

/** Assign groups in input order, then move the last singleton if needed to equalise the halves. */
export function splitGateQuestions(originals: readonly GateCase[]): Map<string, 0 | 1> {
  const groups = new Map<string, GateCase[]>();
  const ids = new Set<string>();
  for (const q of originals) {
    if (ids.has(q.id)) throw new Error("duplicate original id");
    ids.add(q.id);
    const key = JSON.stringify([q.grade, q.interest, q.question]);
    const group = groups.get(key) ?? [];
    group.push(q);
    groups.set(key, group);
  }
  const halves: GateCase[][] = [[], []];
  const grouped = [...groups.values()];
  grouped.forEach((g, i) => halves[i % 2].push(...g));
  while (Math.abs(halves[0].length - halves[1].length) > 1) {
    const large = halves[0].length > halves[1].length ? 0 : 1;
    const singleton = [...grouped].reverse().find((g) => g.length === 1 && halves[large].includes(g[0]));
    if (!singleton) throw new Error("cannot balance the question groups");
    halves[large].splice(halves[large].indexOf(singleton[0]), 1);
    halves[1 - large].push(singleton[0]);
  }
  return new Map(halves.flatMap((items, side) => items.map((q) => [q.id, side as 0 | 1] as const)));
}

/** Fit on one half and measure only on the other, then swap. */
export function evaluateGateFolds(originals: readonly GateCase[], changed: readonly GateCase[], rows: readonly GateRow[], model: string, gate: Gate) {
  const split = splitGateQuestions(originals);
  const caseMap = new Map<string, { side: 0 | 1; changed: boolean }>();
  for (const q of originals) caseMap.set(q.id, { side: split.get(q.id)!, changed: false });
  for (const q of changed.filter((q) => q.gate === gate)) {
    const side = q.originalId === undefined ? undefined : split.get(q.originalId);
    if (side === undefined || caseMap.has(q.id)) throw new Error("invalid changed question reference");
    caseMap.set(q.id, { side, changed: true });
  }
  const data: { unchanged: number[]; changed: number[] }[] = [{ unchanged: [], changed: [] }, { unchanged: [], changed: [] }];
  const seen = new Set<string>();
  for (const row of rows.filter((r) => r.model === model && r.gate === gate)) {
    const item = caseMap.get(row.id);
    if (!item || item.changed !== row.changed || seen.has(row.id)) throw new Error("invalid or duplicate decision result");
    seen.add(row.id);
    data[item.side][item.changed ? "changed" : "unchanged"].push(row.probability);
  }
  if (seen.size !== caseMap.size) throw new Error("missing decision result");
  return ([0, 1] as const).map((testSide) => {
    const train = data[1 - testSide];
    const test = data[testSide];
    const selected = calibrateGate(gate, train.unchanged, train.changed);
    if (!selected || !test.unchanged.length || !test.changed.length) throw new Error("a fold has no threshold or no test questions");
    const flags = (p: number) => gate === "reading_level" ? p >= selected.threshold : 1 - p < selected.threshold;
    const caught = test.changed.filter(flags).length;
    const falseFlags = test.unchanged.filter(flags).length;
    return { testSide, threshold: selected.threshold, caught, changed: test.changed.length, falseFlags, unchanged: test.unchanged.length, passed: caught / test.changed.length >= 0.9 && falseFlags / test.unchanged.length <= 0.05 };
  });
}
