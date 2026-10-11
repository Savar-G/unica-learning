import { COMPARISON_BANDS_FROM, COMPARISON_PERCENTILE_FROM } from "./constants";
import { helpLikely } from "./flags";
import type { Placement } from "./types";

/** Optional result fields read the legacy stored models, which had a stage and count but no measured rank. */
export type Comparison =
  | { stage: "scale"; n?: number }
  | { stage: "bands"; n: number; band?: "lower" | "middle" | "upper" }
  | { stage: "percentile"; n: number; percentile?: number };

/** Server input only. Never store these rows in a report or pass them to a parent browser or analytics. */
export interface ComparisonTest {
  id: string;
  childId: string;
  status: string;
  completedAt: string | null;
  email: string;
  placement: Placement | null;
}

export interface ComparisonInput {
  assessmentId: string;
  tests: readonly ComparisonTest[];
  /** Named test accounts, normalized like the domain exclusions. Empty until the owner supplies names. */
  excludedEmails?: readonly string[];
}

function compare(a: Placement, b: Placement): number {
  if (a.workingLevel !== b.workingLevel) return a.workingLevel - b.workingLevel;
  const x = a.levels.find((l) => l.level === a.workingLevel && l.total > 0);
  const y = b.levels.find((l) => l.level === b.workingLevel && l.total > 0);
  // A low-confidence estimated level can have no questions. Sort that below a measured share at the same level;
  // two such estimates tie. Never substitute or display an invented accuracy percentage.
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  return x.correct * y.total - y.correct * x.total;
}

/** #94 option A. Latest completed first, then exclusions. Midrank gives ties the same result. Pure input/output. */
export function comparisonFor({ assessmentId, tests, excludedEmails = [] }: ComparisonInput): Comparison {
  const latest = new Map<string, ComparisonTest>();
  for (const t of tests) {
    if (t.status !== "completed" || !t.completedAt || !t.placement) continue;
    const previous = latest.get(t.childId);
    if (!previous || Date.parse(t.completedAt) > Date.parse(previous.completedAt ?? "") ||
      (Date.parse(t.completedAt) === Date.parse(previous.completedAt ?? "") && t.id > previous.id)) latest.set(t.childId, t);
  }
  const subject = tests.find((t) => t.id === assessmentId)?.placement;
  const excluded = new Set(excludedEmails.map((email) => email.trim().toLowerCase()));
  const cohort = [...latest.values()].filter((t) => {
    const email = t.email.trim().toLowerCase();
    const domain = email.slice(email.lastIndexOf("@") + 1);
    return t.placement?.grade === subject?.grade && !helpLikely(t.placement?.flags) &&
      !/^(?:.*\.)?(?:example\.com|resend\.dev)$/.test(domain) && !excluded.has(email);
  });
  const n = cohort.length;
  if (!subject || !cohort.some((t) => t.id === assessmentId) || n < COMPARISON_BANDS_FROM) return { stage: "scale", n };
  let lower = 0;
  let equal = 0;
  for (const t of cohort) {
    if (!t.placement) continue;
    const order = compare(t.placement, subject);
    if (order < 0) lower++;
    if (order === 0) equal++;
  }
  const percent = 100 * (lower + equal / 2) / n;
  if (n >= COMPARISON_PERCENTILE_FROM) return { stage: "percentile", n, percentile: Math.round(percent) };
  return { stage: "bands", n, band: percent < 25 ? "lower" : percent < 75 ? "middle" : "upper" };
}
