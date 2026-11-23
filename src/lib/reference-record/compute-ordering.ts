import {
  NOT_STATED,
  UNCLEAR,
  type ArithExpr,
  type ChainExpr,
  type Expr,
  type MissingExpr,
  type PageRecord,
  type PageSection,
} from "./types";

export type SectionOrderingKind =
  | "first_fixed_second_stepping"
  | "second_fixed_first_stepping"
  | "first_fixed_second_mixed"
  | "second_fixed_first_mixed"
  | "both_stepping"
  | "grouped_first_fixed_second_stepping"
  | "grouped_first_fixed_second_mixed"
  | "grouped_second_fixed_first_stepping"
  | "grouped_second_fixed_first_mixed"
  | "fixed_and_stepping"
  | "fixed_and_mixed"
  | "all_stepping"
  | "grouped_fixed_and_stepping"
  | "grouped_fixed_and_mixed"
  | "repeated_addend_stepping_count"
  | "chain_stepping_start"
  | "mixed"
  | "not_applicable";

export interface SectionOrderingPattern {
  section_index: number;
  kind: SectionOrderingKind;
  description: string;
}

export interface PageOrderingPattern {
  sections: SectionOrderingPattern[];
  summary: string;
}

function isConcreteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function constantStep(values: number[]): number | null {
  if (values.length < 2) return null;
  const diff = values[1] - values[0];
  if (diff === 0) return null;
  for (let i = 2; i < values.length; i += 1) {
    if (values[i] - values[i - 1] !== diff) return null;
  }
  return diff;
}

function groupByKey<T>(items: T[], keyFn: (x: T) => number): Array<{ key: number; items: T[] }> {
  const runs: Array<{ key: number; items: T[] }> = [];
  for (const item of items) {
    const k = keyFn(item);
    const last = runs[runs.length - 1];
    if (last && last.key === k) last.items.push(item);
    else runs.push({ key: k, items: [item] });
  }
  return runs;
}

export function resolveChainStep(
  expr: ChainExpr,
): { step: number; anchorIdx: number; anchorVal: number } | null {
  const known: Array<{ idx: number; val: number }> = [];
  for (let i = 0; i < expr.terms.length; i += 1) {
    const t = expr.terms[i];
    if (t === null) continue;
    if (!isConcreteNumber(t)) return null;
    known.push({ idx: i, val: t });
  }
  if (known.length === 0) return null;

  let step: number | null = null;
  if (isConcreteNumber(expr.step)) {
    step = expr.step;
  } else if (known.length >= 2) {
    const deltaVal = known[1].val - known[0].val;
    const deltaIdx = known[1].idx - known[0].idx;
    if (deltaVal % deltaIdx !== 0) return null;
    step = deltaVal / deltaIdx;
  }
  if (step === null) return null;

  const anchor = known[0];
  for (const entry of known) {
    if (anchor.val + (entry.idx - anchor.idx) * step !== entry.val) return null;
  }
  return { step, anchorIdx: anchor.idx, anchorVal: anchor.val };
}

function extractOperandSequence(
  expr: Expr | null,
  solveMissingOperands: (expr: MissingExpr) => number[] | null,
): number[] | null {
  if (!expr) return null;
  if (expr.kind === "arith" && expr.operands.length >= 2) {
    return expr.operands.every(isConcreteNumber) ? (expr.operands as number[]) : null;
  }
  if (expr.kind === "missing") {
    const ops = solveMissingOperands(expr);
    if (ops && ops.length >= 2) return ops;
  }
  if (expr.kind === "linked") return extractOperandSequence(expr.pair[0], solveMissingOperands);
  if (expr.kind === "word" && expr.expr && expr.expr !== UNCLEAR && expr.expr !== NOT_STATED) {
    return extractOperandSequence(expr.expr, solveMissingOperands);
  }
  return null;
}

function classifyMultiOperandOrdering(
  concrete: number[][],
  sectionIndex: number,
): SectionOrderingPattern {
  const arity = concrete[0].length;
  const cols = Array.from({ length: arity }, (_, idx) => concrete.map((seq) => seq[idx]));
  const parts: string[] = [];
  let fixedCount = 0;
  let steppingCount = 0;
  let mixedCount = 0;

  for (let p = 0; p < arity; p += 1) {
    const col = cols[p];
    const isFixed = col.every((v) => v === col[0]);
    if (isFixed) {
      fixedCount += 1;
      parts.push(`operand ${p + 1} fixed (${col[0]})`);
      continue;
    }
    const step = constantStep(col);
    if (step !== null) {
      steppingCount += 1;
      parts.push(`operand ${p + 1} steps by ${step} (${col[0]} to ${col[col.length - 1]})`);
      continue;
    }
    mixedCount += 1;
    parts.push(`operand ${p + 1} mixed`);
  }

  if (fixedCount > 0 && steppingCount > 0 && mixedCount === 0) {
    return {
      section_index: sectionIndex,
      kind: "fixed_and_stepping",
      description: parts.join(", "),
    };
  }
  if (fixedCount === 0 && mixedCount === 0 && steppingCount === arity) {
    return {
      section_index: sectionIndex,
      kind: "all_stepping",
      description: parts.join(", "),
    };
  }
  if (fixedCount > 0) {
    return {
      section_index: sectionIndex,
      kind: "fixed_and_mixed",
      description: parts.join(", "),
    };
  }

  // Check if grouping by any (arity - 1) operand positions forms contiguous distinct runs
  for (let varyIdx = arity - 1; varyIdx >= 0; varyIdx -= 1) {
    const runs: Array<{ key: string; items: number[][] }> = [];
    for (const seq of concrete) {
      const key = seq.filter((_, i) => i !== varyIdx).join(",");
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.items.push(seq);
      else runs.push({ key, items: [seq] });
    }
    const distinctKeys = new Set(runs.map((r) => r.key)).size;
    if (
      runs.length >= 2 &&
      runs.length === distinctKeys &&
      runs.filter((r) => r.items.length >= 2).length >= Math.max(1, runs.length - 1) &&
      concrete.length / runs.length >= 2
    ) {
      const multiRuns = runs.filter((r) => r.items.length >= 2);
      const runSteps = multiRuns.map((r) => constantStep(r.items.map((seq) => seq[varyIdx])));
      if (runSteps.every((s) => s !== null && s === runSteps[0])) {
        return {
          section_index: sectionIndex,
          kind: "grouped_fixed_and_stepping",
          description: `grouped by other operands, operand ${varyIdx + 1} steps by ${runSteps[0]}`,
        };
      }
      return {
        section_index: sectionIndex,
        kind: "grouped_fixed_and_mixed",
        description: `grouped by other operands, operand ${varyIdx + 1} mixed`,
      };
    }
  }

  return { section_index: sectionIndex, kind: "mixed", description: "mixed" };
}

function classifySectionOrdering(
  section: PageSection,
  sectionIndex: number,
  solveMissingOperands: (expr: MissingExpr) => number[] | null,
): SectionOrderingPattern {
  const exprs = section.items.map((it) => it.expr).filter((e): e is Expr => e !== null);
  if (exprs.length < 2) {
    return {
      section_index: sectionIndex,
      kind: "not_applicable",
      description: "fewer than 2 items",
    };
  }

  const allRepAdd = exprs.every(
    (e): e is ArithExpr =>
      e.kind === "arith" &&
      e.op === "add" &&
      e.operands.every(isConcreteNumber) &&
      e.operands.every((n) => n === e.operands[0]),
  );
  if (allRepAdd) {
    const addends = exprs.map((e) => e.operands[0] as number);
    const counts = exprs.map((e) => e.operands.length);
    const countStep = constantStep(counts);
    if (addends.every((a) => a === addends[0]) && countStep !== null) {
      return {
        section_index: sectionIndex,
        kind: "repeated_addend_stepping_count",
        description: `repeated addend ${addends[0]}, term count steps by ${countStep} (${counts[0]} to ${counts[counts.length - 1]})`,
      };
    }
  }

  if (exprs.every((e): e is ChainExpr => e.kind === "chain")) {
    const starts = exprs.map((e) => e.terms[0]).filter(isConcreteNumber);
    const steps = exprs.map((e) => resolveChainStep(e)?.step ?? null);
    const startDelta = starts.length === exprs.length ? constantStep(starts) : null;
    if (startDelta !== null && steps[0] !== null && steps.every((s) => s === steps[0])) {
      return {
        section_index: sectionIndex,
        kind: "chain_stepping_start",
        description: `chains with step ${steps[0]}, starting value steps by ${startDelta} (${starts[0]} to ${starts[starts.length - 1]})`,
      };
    }
  }

  const seqs = exprs.map((e) => extractOperandSequence(e, solveMissingOperands));
  if (seqs.some((s) => s === null)) {
    return { section_index: sectionIndex, kind: "mixed", description: "mixed expression shapes" };
  }
  const concreteSeqs = seqs as number[][];
  const arity = concreteSeqs[0].length;
  if (!concreteSeqs.every((s) => s.length === arity)) {
    return { section_index: sectionIndex, kind: "mixed", description: "mixed expression shapes" };
  }
  if (arity > 2) {
    return classifyMultiOperandOrdering(concreteSeqs, sectionIndex);
  }
  const concrete = concreteSeqs as Array<[number, number]>;
  const firsts = concrete.map((p) => p[0]);
  const seconds = concrete.map((p) => p[1]);

  const firstFixed = firsts.every((v) => v === firsts[0]);
  const secondFixed = seconds.every((v) => v === seconds[0]);
  const firstStep = constantStep(firsts);
  const secondStep = constantStep(seconds);

  if (firstFixed && secondStep !== null) {
    return {
      section_index: sectionIndex,
      kind: "first_fixed_second_stepping",
      description: `first operand fixed (${firsts[0]}), second steps by ${secondStep} (${seconds[0]} to ${seconds[seconds.length - 1]})`,
    };
  }
  if (secondFixed && firstStep !== null) {
    return {
      section_index: sectionIndex,
      kind: "second_fixed_first_stepping",
      description: `second operand fixed (${seconds[0]}), first steps by ${firstStep} (${firsts[0]} to ${firsts[firsts.length - 1]})`,
    };
  }
  if (firstFixed) {
    return {
      section_index: sectionIndex,
      kind: "first_fixed_second_mixed",
      description: `first operand fixed (${firsts[0]}), second mixed`,
    };
  }
  if (secondFixed) {
    return {
      section_index: sectionIndex,
      kind: "second_fixed_first_mixed",
      description: `second operand fixed (${seconds[0]}), first mixed`,
    };
  }
  if (firstStep !== null && secondStep !== null) {
    return {
      section_index: sectionIndex,
      kind: "both_stepping",
      description: `first steps by ${firstStep}, second steps by ${secondStep}`,
    };
  }

  const firstRuns = groupByKey(concrete, (p) => p[0]);
  const firstDistinctKeys = new Set(firstRuns.map((r) => r.key)).size;
  if (
    firstRuns.length >= 2 &&
    firstRuns.length === firstDistinctKeys &&
    firstRuns.filter((r) => r.items.length >= 2).length >= Math.max(1, firstRuns.length - 1) &&
    concrete.length / firstRuns.length >= 2
  ) {
    const multiRuns = firstRuns.filter((r) => r.items.length >= 2);
    const runSteps = multiRuns.map((r) => constantStep(r.items.map((p) => p[1])));
    const keysStr = firstRuns.map((r) => r.key).join(", ");
    if (runSteps.every((s) => s !== null && s === runSteps[0])) {
      return {
        section_index: sectionIndex,
        kind: "grouped_first_fixed_second_stepping",
        description: `grouped by first operand (${keysStr}), second steps by ${runSteps[0]}`,
      };
    }
    return {
      section_index: sectionIndex,
      kind: "grouped_first_fixed_second_mixed",
      description: `grouped by first operand (${keysStr}), second mixed`,
    };
  }

  const secondRuns = groupByKey(concrete, (p) => p[1]);
  const secondDistinctKeys = new Set(secondRuns.map((r) => r.key)).size;
  if (
    secondRuns.length >= 2 &&
    secondRuns.length === secondDistinctKeys &&
    secondRuns.filter((r) => r.items.length >= 2).length >= Math.max(1, secondRuns.length - 1) &&
    concrete.length / secondRuns.length >= 2
  ) {
    const multiRuns = secondRuns.filter((r) => r.items.length >= 2);
    const runSteps = multiRuns.map((r) => constantStep(r.items.map((p) => p[0])));
    const keysStr = secondRuns.map((r) => r.key).join(", ");
    if (runSteps.every((s) => s !== null && s === runSteps[0])) {
      return {
        section_index: sectionIndex,
        kind: "grouped_second_fixed_first_stepping",
        description: `grouped by second operand (${keysStr}), first steps by ${runSteps[0]}`,
      };
    }
    return {
      section_index: sectionIndex,
      kind: "grouped_second_fixed_first_mixed",
      description: `grouped by second operand (${keysStr}), first mixed`,
    };
  }

  return { section_index: sectionIndex, kind: "mixed", description: "mixed" };
}

export function buildPageOrderingPattern(
  page: PageRecord,
  solveMissingOperands: (expr: MissingExpr) => number[] | null,
): PageOrderingPattern {
  const sections = page.sections.map((sec, idx) =>
    classifySectionOrdering(sec, idx, solveMissingOperands),
  );
  const meaningful = sections.filter((s) => s.kind !== "not_applicable");
  const summary =
    meaningful.length === 0
      ? "not applicable"
      : meaningful.length === 1
        ? meaningful[0].description
        : meaningful.map((s) => `Section ${s.section_index + 1}: ${s.description}`).join("; ");
  return { sections, summary };
}
