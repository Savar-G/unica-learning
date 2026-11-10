import { describe, expect, it } from "vitest";
import { UNKNOWN_RESPONSE, type Flag } from "@/lib/assessment";
import { NO_FILTERS } from "@/lib/admin-view";
import { answerTally, testsHref, testsSummary, type SummaryTest } from "@/lib/admin-tests";

const helped: Flag = { kind: "helped", answer: "yes" };
const test = (o: Partial<SummaryTest> = {}): SummaryTest => ({ parent_id: "p", status: "completed", flags: [], reviews: { total: 0, low: 0 }, ...o });

describe("testsSummary", () => {
  it("counts each status, help likely and low AI confidence", () => {
    const s = testsSummary([
      test(),
      test({ flags: [helped] }),
      test({ status: "in_progress", flags: null }),
      test({ status: "expired", flags: null, reviews: { total: 2, low: 1 } }),
      test({ reviews: { total: 3, low: 0 } }),
    ]);
    expect(s).toEqual({ started: 5, finished: 3, inProgress: 1, expired: 1, help: 1, lowAi: 1 });
  });

  it("never counts a test family's test", () => {
    const s = testsSummary([test({ parent_id: "real" }), test({ parent_id: "team", flags: [helped], reviews: { total: 1, low: 1 } })], (id) => id === "team");
    expect(s).toEqual({ started: 1, finished: 1, inProgress: 0, expired: 0, help: 0, lowAi: 0 });
  });

  it("does not call fast wrong answers help", () => {
    const fast: Flag = { kind: "too-fast", questionIds: ["a", "b"], right: 0 };
    expect(testsSummary([test({ flags: [fast] })]).help).toBe(0);
  });
});

describe("testsHref", () => {
  it("keeps the other filters and changes one", () => {
    expect(testsHref("/admin/tests", { ...NO_FILTERS, grade: 3 }, { status: "completed" })).toBe("/admin/tests?status=completed&grade=3");
    expect(testsHref("/admin/tests", { ...NO_FILTERS, status: "completed" }, { status: null })).toBe("/admin/tests");
    expect(testsHref("/admin/tests", { ...NO_FILTERS, flagged: true }, { help: true, flagged: false })).toBe("/admin/tests?flag=help");
  });
});

describe("answerTally", () => {
  it("puts every answer in one group", () => {
    const t = answerTally([
      { correct: true, response: "4", leftOut: false },
      { correct: false, response: "5", leftOut: false },
      { correct: false, response: "7", leftOut: true },
      { correct: false, response: UNKNOWN_RESPONSE, leftOut: false },
      { correct: false, response: "", leftOut: false },
    ]);
    expect(t).toEqual({ total: 5, right: 1, wrong: 2, leftOut: 1, unknown: 1, skipped: 1 });
    expect(t.right + t.wrong + t.unknown + t.skipped).toBe(t.total);
  });

  it("is empty with no answers", () => {
    expect(answerTally([])).toEqual({ total: 0, right: 0, wrong: 0, leftOut: 0, unknown: 0, skipped: 0 });
  });
});
