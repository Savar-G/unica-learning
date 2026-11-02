import { describe, expect, it } from "vitest";
import { solveReason } from "@/lib/workbook-solve-check";
import { plainModel, questionSolveState, QUESTION_SOLVE_TEXT, solveCostLine, solveSummary, solveTableText } from "@/lib/workbook-solve-summary";

const disagreed = { status: "failed" as const, reason: solveReason({ status: "disagreed", reason: 'box answer: a reader of the printed text answers "5", the key says "4"' }) };
const lateCheck = { status: "failed" as const, reason: solveReason({ status: "failed", reason: "the solve check was late" }) };
const errorCheck = { status: "failed" as const, reason: solveReason({ status: "failed", reason: "the solve check failed: 500" }) };

describe("questionSolveState (R379-1)", () => {
  it("never shows a timed-out or errored check as a disagreement", () => {
    expect(questionSolveState(lateCheck, "failed")).toBe("errored");
    expect(questionSolveState(errorCheck, undefined)).toBe("errored");
    expect(QUESTION_SOLVE_TEXT[questionSolveState(lateCheck, "failed")]).toBe("Checking AI couldn't check it");
  });

  it("reads a disagreement from the question's failed check", () => {
    expect(questionSolveState(disagreed, "disagreed")).toBe("disagreed");
    expect(QUESTION_SOLVE_TEXT.disagreed).toBe("Checking AI disagreed");
  });

  it("uses the current check's verdict, and says not checked when none matches the printed question", () => {
    expect(questionSolveState({ status: "checked" }, "agreed")).toBe("agreed");
    expect(questionSolveState({ status: "checked" }, undefined)).toBe("not-checked");
    expect(questionSolveState({ status: "checked" }, "disagreed")).toBe("disagreed");
    expect(questionSolveState({ status: "checked" }, "failed")).toBe("errored");
    expect(questionSolveState({ status: "failed", reason: "the easier example is not smaller than the question" }, "agreed")).toBe("agreed");
  });
});

describe("solveSummary (R379-1)", () => {
  it("says the checking AI didn't run when there are no checks, never that every question agreed", () => {
    const s = solveSummary([], false);
    expect(s).toMatchObject({ state: "not-checked", line: "Checking AI didn't run", tone: "muted" });
    expect(s.line).not.toMatch(/agree/);
  });

  it("says all questions agree only when every check agreed", () => {
    expect(solveSummary(["agreed", "agreed"], true)).toMatchObject({ state: "agreed", line: "All questions agree", tone: "ok" });
  });

  it("does not use historical checks to confirm an empty current list", () => {
    expect(solveSummary([], true)).toMatchObject({ state: "not-checked", line: "Checking AI didn't check any current questions", tone: "muted" });
  });

  it("does not claim agreement when a printed question has no check", () => {
    expect(solveSummary(["agreed", "not-checked"], true)).toMatchObject({ state: "not-checked", line: "Checking AI didn't check 1 question", tone: "warn" });
  });

  it("counts the questions that still disagree", () => {
    expect(solveSummary(Array(10).fill("disagreed").concat(["agreed"]), true)).toMatchObject({ state: "disagreed", disagreed: 10, line: "10 questions still disagree", tone: "bad" });
    expect(solveSummary(["disagreed"], true).line).toBe("1 question still disagrees");
  });

  it("reports timed-out checks as not checked, never as a disagreement", () => {
    const s = solveSummary(["errored", "errored", "errored", "agreed"], true);
    expect(s).toMatchObject({ state: "errored", disagreed: 0, errored: 3, line: "Checking AI couldn't check 3 questions", tone: "warn" });
    expect(s.line).not.toMatch(/disagree/);
  });

  it("names both when some disagree and some could not be checked", () => {
    expect(solveSummary(["disagreed", "errored", "errored"], true).line).toBe("1 question still disagrees · Checking AI couldn't check 2 questions");
  });

  it("gives the table a heading that matches its rows", () => {
    expect(solveTableText({ disagreed: 0, errored: 0 })).toBeNull();
    expect(solveTableText({ disagreed: 2, errored: 0 })!.heading).toBe("The checking AI got a different answer");
    const late = solveTableText({ disagreed: 0, errored: 3 })!;
    expect(late.heading).toBe("The checking AI couldn't check these questions");
    expect(`${late.heading} ${late.note}`).not.toMatch(/different|disagree/);
    expect(solveTableText({ disagreed: 1, errored: 1 })!.heading).toBe("Questions the checking AI did not confirm");
  });
});

describe("solveCostLine (R379-2)", () => {
  it("shows a total only when every cost is known", () => {
    expect(solveCostLine([0.05, 0.07])).toBe("API cost USD 0.12");
  });

  it("shows an incomplete cost as a lower bound, never as the total", () => {
    expect(solveCostLine([0.12, null])).toBe("API cost: at least USD 0.12 (some unknown)");
    expect(solveCostLine([null, null])).toBe("API cost unknown");
    expect(solveCostLine([0.129, null])).toBe("API cost: at least USD 0.12 (some unknown)");
    expect(solveCostLine([0.0004, null])).toBe("API cost: at least USD 0.00 (some unknown)");
  });

  it("shows nothing with no checks, and a tiny cost as less than a cent", () => {
    expect(solveCostLine([])).toBeNull();
    expect(solveCostLine([0.0004])).toBe("API cost less than USD 0.01");
  });
});

describe("plainModel", () => {
  it("names the scripted fake and a model id in plain words", () => {
    expect(plainModel("fake", "Scripted checker")).toBe("Scripted checker");
    expect(plainModel("anthropic/claude-haiku-5.5")).toBe("Claude Haiku 5.5");
    expect(plainModel("openai/gpt-5-mini")).toBe("GPT-5 Mini");
  });
});
