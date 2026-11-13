import { describe, expect, it } from "vitest";
import type { PrintedQuestion } from "@/lib/workbook-solve-check";
import { gateMark, gateNeedsRewrite, openQuestionGateRun, type QuestionGateChecker, type StoredQuestionGate } from "@/lib/workbook-run-gates";

const printed: PrintedQuestion = { id: "question", text: "How many?", picture: null, shown: null, boxes: [] };

function checker(outcome: StoredQuestionGate["outcome"]): QuestionGateChecker & { calls: number } {
  const gate = {
    model: "script",
    calls: 0,
    async check(): Promise<Omit<StoredQuestionGate, "callKey">> {
      gate.calls += 1;
      return { questionId: "question", model: "script", thresholdVersion: 2, outcome, flags: outcome === "flag" ? ["one_right_answer"] : [], probabilities: {}, reason: outcome === "pass" ? null : "because" };
    },
  };
  return gate;
}

describe("question gate run", () => {
  it("rewrites a flag on the first call and keeps one after that, and an error never rewrites", () => {
    const flag = { callKey: "3:0:1.1", questionId: "question", model: "script", thresholdVersion: 2, outcome: "flag" as const, flags: ["one_right_answer" as const], probabilities: {}, reason: "because" };
    expect(gateNeedsRewrite("workbook_page", flag)).toBe(true);
    expect(gateNeedsRewrite("workbook_page_redo", flag)).toBe(false);
    expect(gateNeedsRewrite("workbook_page_shorter", flag)).toBe(false);
    expect(gateNeedsRewrite("workbook_page", { ...flag, outcome: "unknown" })).toBe(false);
    expect(gateMark(flag)?.outcome).toBe("flag");
    expect(gateMark({ ...flag, outcome: "pass" })).toBeNull();
  });

  it("does not ask a stored key again", async () => {
    const stored: StoredQuestionGate = { callKey: "3:0:1.1", questionId: "question", model: "script", thresholdVersion: 2, outcome: "flag", flags: ["one_right_answer"], probabilities: {}, reason: "because" };
    const live = checker("pass");
    const run = openQuestionGateRun(live, [stored], async () => { throw new Error("stored again"); });
    await expect(run.ask("3:0:1.1", { question: printed, grade: 4, interest: null }, new AbortController().signal)).resolves.toEqual(stored);
    expect(live.calls).toBe(0);
  });

  it("stops asking after 10 requests when more than 20 percent errored", async () => {
    const live = checker("unknown");
    const saved: string[] = [];
    const run = openQuestionGateRun(live, [], async (row) => { saved.push(row.callKey); });
    const rows = [];
    for (let n = 0; n < 14; n++) rows.push(await run.ask(`3:0:1.${n + 1}`, { question: printed, grade: 4, interest: null }, new AbortController().signal));
    expect(rows.filter((row) => row === null).length).toBeGreaterThan(0);
    expect(saved.length).toBeGreaterThanOrEqual(10);
    expect(live.calls).toBe(saved.length);
    expect(run.unavailable).toBe(true);
    const again = await run.ask("3:1:1.1", { question: printed, grade: 4, interest: null }, new AbortController().signal);
    expect(again).toBeNull();
    expect(live.calls).toBe(saved.length);
  });
});
