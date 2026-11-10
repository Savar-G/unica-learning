// The admin's Tests list and test page (D-313, D-315): the summary tiles of the list, the links the tiles make, and the
// answer tally the test page draws as a bar. Pure: no network, database or clock.
import { UNKNOWN_RESPONSE, helpLikely, type Flag } from "@/lib/assessment";
import { filterQuery, type AdminFilters } from "@/lib/admin-view";
import type { AssessmentStatus } from "@/lib/test-api";

/** What the summary needs from one test in the list. `flags`: null while the test is not finished. */
export interface SummaryTest {
  parent_id: string;
  status: AssessmentStatus;
  flags: readonly Flag[] | null;
  reviews: { total: number; low: number };
}

export interface TestsSummary {
  started: number;
  finished: number;
  inProgress: number;
  expired: number;
  /** Finished tests where help is likely (helpLikely of the stored flags). */
  help: number;
  /** Tests with at least one low-confidence AI review. */
  lowAi: number;
}

/**
 * The counts of the summary tiles, over the tests the list shows. `isTest`: a test or team family, never counted (the
 * list shows them, tagged, while "Show test families" is on).
 */
export function testsSummary(tests: readonly SummaryTest[], isTest: (parentId: string) => boolean = () => false): TestsSummary {
  const real = tests.filter((t) => !isTest(t.parent_id));
  return {
    started: real.length,
    finished: real.filter((t) => t.status === "completed").length,
    inProgress: real.filter((t) => t.status === "in_progress").length,
    expired: real.filter((t) => t.status === "expired").length,
    help: real.filter((t) => t.flags !== null && helpLikely(t.flags)).length,
    lowAi: real.filter((t) => t.reviews.low > 0).length,
  };
}

/** The list's address with the current filters changed by `change` (the page goes back to 1). */
export function testsHref(action: string, filters: AdminFilters, change: Partial<AdminFilters>): string {
  return `${action}${filterQuery({ ...filters, ...change })}`;
}

/** What the answer tally needs from one answer line. */
export interface TallyLine {
  correct: boolean;
  response: string;
  /** A very fast wrong answer left out of the score. */
  leftOut: boolean;
}

export interface AnswerTally {
  total: number;
  right: number;
  /** Wrong answers the child typed or picked; `leftOut` of them were left out of the score. */
  wrong: number;
  leftOut: number;
  /** "I don't know yet". */
  unknown: number;
  /** No answer given. */
  skipped: number;
}

/** The answers of a test as right, wrong, "I don't know yet" and skipped. Every answer is in exactly one of the four. */
export function answerTally(lines: readonly TallyLine[]): AnswerTally {
  const t: AnswerTally = { total: lines.length, right: 0, wrong: 0, leftOut: 0, unknown: 0, skipped: 0 };
  for (const a of lines) {
    if (a.correct) t.right++;
    else if (a.response === "") t.skipped++;
    else if (a.response === UNKNOWN_RESPONSE) t.unknown++;
    else {
      t.wrong++;
      if (a.leftOut) t.leftOut++;
    }
  }
  return t;
}
