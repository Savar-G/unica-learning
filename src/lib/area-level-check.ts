// The check of the area rule on stored tests (D-243, #549): pure, so scripts/area-level-check.ts only reads and prints.
// It compares each bar with the status the report shows for that area. The report counts answers at or below the school
// grade, and the bar counts every answer, so a difference can be fair; each one is named so that a person can judge it.
import { areaLevels, type AreaAnswer, type AreaBasis, type AreaLabel, type Certainty, type Placement, type ReportedStrand, type StrandStatus } from "@/lib/assessment";

/** Real families, families on the test and admin lists, and the copies without names of deleted families of each kind. */
export type CheckGroup = "real" | "test-family" | "copy-real" | "copy-test-family";

export interface CheckedTest {
  /** An anonymous id, never a database id. */
  id: string;
  group: CheckGroup;
  answers: AreaAnswer[];
  placement: Placement;
}

export type DisagreementKind =
  /** Building up beside a Secure report: the case D-108 forbids. */
  | "invented-weakness"
  /** At grade or Ahead beside Needs attention, or Ahead beside Developing. */
  | "overstated"
  /** The area's answers are all above the school grade, so the report shows no status. */
  | "no-status";

export interface Disagreement {
  id: string;
  group: CheckGroup;
  area: ReportedStrand;
  kind: DisagreementKind;
  label: AreaLabel;
  status: StrandStatus | "none";
  basis: AreaBasis;
  certainty: Certainty;
  /** The bar against the school grade. A difference, so that the output does not name the child's grade. */
  gradesFromSchool: number;
  /** The report on this test says the result may not be reliable (#189). */
  unreliable: boolean;
  /** The report's answers for this area: at or below the school grade. */
  correct: number;
  total: number;
}

export interface GroupCounts {
  tests: number;
  bars: number;
  labels: Record<AreaLabel, number>;
  certainty: Record<Certainty, number>;
  basis: Record<AreaBasis, number>;
  /** Bars that fell back to the overall level on a test the report says may not be reliable (#189). */
  overallOnUnreliable: number;
  /** "label/status": the count of each pair that occurred. */
  crossTab: Record<string, number>;
}

export interface AreaLevelCheck {
  groups: Record<CheckGroup, GroupCounts>;
  disagreements: Disagreement[];
  /** Tests whose answers do not add up to the stored placement: their bars do not rest on what the report counted. */
  inputMismatches: string[];
}

function kindOf(label: AreaLabel, status: StrandStatus | "none"): DisagreementKind | null {
  if (status === "none") return "no-status";
  if (status === "secure") return label === "building-up" ? "invented-weakness" : null;
  if (status === "developing") return label === "ahead" ? "overstated" : null;
  return label === "building-up" ? null : "overstated";
}

const tallyOf = (answers: readonly AreaAnswer[]) => ({ correct: answers.filter((a) => a.correct).length, total: answers.length });

function addsUp({ answers, placement }: CheckedTest): boolean {
  const same = (a: { correct: number; total: number }, b: { correct: number; total: number }) => a.correct === b.correct && a.total === b.total;
  const levels = new Set(answers.map((a) => a.level));
  const stored = new Set(placement.levels.map((l) => l.level));
  const atOrBelow = answers.filter((a) => a.level <= placement.grade);
  const areas = new Set(atOrBelow.map((a) => a.area));
  return [...levels].every((l) => stored.has(l))
    && placement.levels.every((l) => same(tallyOf(answers.filter((a) => a.level === l.level)), l))
    && [...areas].every((area) => placement.strands.some((s) => s.strand === area))
    && placement.strands.every((s) => same(tallyOf(atOrBelow.filter((a) => a.area === s.strand)), s));
}

const emptyCounts = (): GroupCounts => ({
  tests: 0,
  bars: 0,
  labels: { ahead: 0, "at-grade": 0, "building-up": 0 },
  certainty: { clear: 0, "early-sign": 0 },
  basis: { area: 0, estimate: 0, overall: 0 },
  overallOnUnreliable: 0,
  crossTab: {},
});

export function checkAreaLevels(tests: readonly CheckedTest[]): AreaLevelCheck {
  const groups: Record<CheckGroup, GroupCounts> = { real: emptyCounts(), "test-family": emptyCounts(), "copy-real": emptyCounts(), "copy-test-family": emptyCounts() };
  const disagreements: Disagreement[] = [];
  const inputMismatches: string[] = [];
  for (const t of tests) {
    const counts = groups[t.group];
    counts.tests++;
    if (!addsUp(t)) inputMismatches.push(t.id);
    const unreliable = t.placement.pace?.unreliable === true;
    for (const bar of areaLevels({ answers: t.answers, schoolGrade: t.placement.grade, workingLevel: t.placement.workingLevel })) {
      const reported = t.placement.strands.find((s) => s.strand === bar.area);
      const status = reported?.status ?? "none";
      counts.bars++;
      counts.labels[bar.label]++;
      counts.certainty[bar.certainty]++;
      counts.basis[bar.basis]++;
      if (bar.basis === "overall" && unreliable) counts.overallOnUnreliable++;
      counts.crossTab[`${bar.label}/${status}`] = (counts.crossTab[`${bar.label}/${status}`] ?? 0) + 1;
      const kind = kindOf(bar.label, status);
      if (!kind) continue;
      disagreements.push({
        id: t.id, group: t.group, area: bar.area, kind, label: bar.label, status, basis: bar.basis, certainty: bar.certainty,
        gradesFromSchool: bar.level - t.placement.grade, unreliable, correct: reported?.correct ?? 0, total: reported?.total ?? 0,
      });
    }
  }
  return { groups, disagreements, inputMismatches };
}
