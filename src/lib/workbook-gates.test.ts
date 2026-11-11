import { describe, expect, it } from "vitest";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { calibrateGate, gateFlags, gateRequest, GATE_THRESHOLDS, questionGateProbabilities } from "@/lib/workbook-gates";
import type { PrintedQuestion } from "@/lib/workbook-solve-check";
import results from "../../docs/workbook-gate-set-results.json";
import set from "../../docs/workbook-gate-set.json";

const question: PrintedQuestion = { id: "question", text: "How many cats?", picture: "Three cats.", shown: null, boxes: [{ id: "answer", asks: "a box for the answer" }] };

describe("question gates", () => {
  it("asks only applicable gates and sends the printed question", () => {
    const request = gateRequest({ question, grade: 4, interest: "cats" });
    expect(Object.keys(request.questions)).toEqual(["reading_level", "one_right_answer", "picture_matches", "uses_interest"]);
    expect(JSON.parse(request.input[0].text)).toEqual(question);
    expect(request.questions.reading_level).toMatchObject({ type: "score", levels: ["too easy to read for grade 4", "right for grade 4", "one grade too hard", "two or more grades too hard"] });
    const noOptions = gateRequest({ question: { ...question, picture: null }, grade: 4, interest: null });
    expect(Object.keys(noOptions.questions)).toEqual(["reading_level", "one_right_answer"]);
  });

  it("returns failure probabilities and does not turn an error into a pass", async () => {
    const client = fakeDecisionClient({ answer: () => ({ reading_level: { type: "score", score: 1, probabilities: [0.1, 0.5, 0.3, 0.1], confidence: 0.5 }, one_right_answer: noul(0.8), picture_matches: noul(0.9), uses_interest: noul(0.2) }) });
    const result = await questionGateProbabilities(client, { question, grade: 4, interest: "cats" }, new AbortController().signal);
    expect(result.probabilities.reading_level).toBeCloseTo(0.4);
    expect(result.probabilities.one_right_answer).toBeCloseTo(0.2);
    expect(result.probabilities.picture_matches).toBeCloseTo(0.1);
    expect(result.probabilities.uses_interest).toBeCloseTo(0.8);
    const failed = fakeDecisionClient({ answer: () => { throw new Error("unavailable"); } });
    await expect(questionGateProbabilities(failed, { question, grade: 4, interest: "cats" }, new AbortController().signal)).rejects.toThrow("unavailable");
  });

  it("uses the stated threshold boundaries and leaves the unmeasured gates off", () => {
    expect(gateFlags("google/gemini-decision-1", { reading_level: 0.05, one_right_answer: 0.93, picture_matches: 1, uses_interest: 1 })).toEqual(["reading_level", "one_right_answer"]);
    expect(gateFlags("google/gemini-decision-1", { reading_level: 0.049, one_right_answer: 0 })).toEqual([]);
    expect(gateFlags("typesafe/jev-1.14", { one_right_answer: 0 })).toEqual([]);
    expect(() => gateFlags("google/gemini-decision-1", { reading_level: 0 })).toThrow(/one_right_answer/);
  });

  it("selects a threshold under the false-flag bar and requires 90 percent caught", () => {
    const unchanged = [...Array(19).fill(0.1), 0.9];
    const passed = calibrateGate("reading_level", unchanged, [...Array(27).fill(0.8), ...Array(3).fill(0)]);
    expect(passed).toMatchObject({ caught: 27, falseFlags: 1, enabled: true });
    const failed = calibrateGate("reading_level", unchanged, [...Array(26).fill(0.8), ...Array(4).fill(0)]);
    expect(failed?.enabled).toBe(false);
    expect(() => calibrateGate("reading_level", [], [0.9])).toThrow();
    expect(calibrateGate("reading_level", [1], [1])).toBeNull();
  });

  it("keeps the changed cases linked to their unchanged printed questions", () => {
    const originalById = new Map(set.originals.map((q) => [q.id, q]));
    expect(set.changed.filter((q) => q.gate === "reading_level")).toHaveLength(30);
    expect(set.changed.filter((q) => q.gate === "one_right_answer")).toHaveLength(30);
    for (const changed of set.changed) {
      const original = originalById.get(changed.originalId);
      expect(original).toBeDefined();
      expect(changed.source).toBe(original?.source);
      expect(changed.question.text).not.toBe(original?.question.text);
      expect({ ...changed.question, text: "" }).toEqual({ ...original?.question, text: "" });
    }
  });

  it("reproduces the stored per-model thresholds from the labelled results", () => {
    expect(set.originals).toHaveLength(108);
    expect(results.failures).toEqual([]);
    for (const model of ["typesafe/jev-1.14", "google/gemini-decision-1"] as const) {
      for (const gate of ["reading_level", "one_right_answer"] as const) {
        const rows = results.rows.filter((r) => r.model === model && r.gate === gate);
        const unchanged = rows.filter((r) => !r.changed).map((r) => r.probability);
        const changed = rows.filter((r) => r.changed).map((r) => r.probability);
        expect(unchanged).toHaveLength(108);
        expect(changed).toHaveLength(30);
        const measured = calibrateGate(gate, unchanged, changed);
        expect(measured?.threshold).toBeCloseTo(GATE_THRESHOLDS[model][gate].threshold, 10);
        expect(measured?.enabled).toBe(GATE_THRESHOLDS[model][gate].enabled);
      }
    }
  });

});
