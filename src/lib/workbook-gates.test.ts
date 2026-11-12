import { describe, expect, it } from "vitest";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { calibrateGate, gateFlags, gateRequest, GATE_THRESHOLDS, questionGateProbabilities } from "@/lib/workbook-gates";
import type { PrintedQuestion } from "@/lib/workbook-solve-check";
import { evaluateGateFolds, splitGateQuestions, type GateRow } from "@/lib/workbook-gate-evaluation";
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

  it("uses the enabled threshold and leaves unmeasured and failed gates off", () => {
    expect(gateFlags("typesafe/jev-1.14", { one_right_answer: 0.98, reading_level: 1, picture_matches: 1, uses_interest: 1 })).toEqual(["one_right_answer"]);
    expect(gateFlags("typesafe/jev-1.14", { one_right_answer: 0 })).toEqual([]);
    expect(() => gateFlags("typesafe/jev-1.14", {})).toThrow(/one_right_answer/);
    expect(gateFlags("google/gemini-decision-1", {})).toEqual([]);
  });

  it("selects a threshold under the false-flag bar and requires 90 percent caught", () => {
    const unchanged = [...Array(19).fill(0.1), 0.9];
    const passed = calibrateGate("reading_level", unchanged, [...Array(27).fill(0.8), ...Array(3).fill(0)]);
    expect(passed).toMatchObject({ caught: 27, falseFlags: 1, enabled: true });
    const failed = calibrateGate("reading_level", unchanged, [...Array(26).fill(0.8), ...Array(4).fill(0)]);
    expect(failed?.enabled).toBe(false);
    expect(() => calibrateGate("reading_level", [], [0.9])).toThrow();
    expect(calibrateGate("reading_level", [1], [1])).toBeNull();
    const edge = calibrateGate("one_right_answer", [0.97], [0.98])!;
    expect(edge.caught).toBe([0.98].filter((p) => 1 - p < edge.threshold).length);
    expect(edge.falseFlags).toBe([0.97].filter((p) => 1 - p < edge.threshold).length);
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

  it("holds each source question and identical printed question in the same half", () => {
    const split = splitGateQuestions(set.originals);
    expect([...split.values()].filter((side) => side === 0)).toHaveLength(54);
    expect([...split.values()].filter((side) => side === 1)).toHaveLength(54);
    for (const a of set.originals) for (const b of set.originals) {
      if (JSON.stringify([a.grade, a.interest, a.question]) === JSON.stringify([b.grade, b.interest, b.question])) expect(split.get(a.id)).toBe(split.get(b.id));
    }
    for (const gate of ["reading_level", "one_right_answer"]) {
      const copies = set.changed.filter((q) => q.gate === gate);
      expect(copies.filter((q) => split.get(q.originalId) === 0)).toHaveLength(15);
      expect(copies.filter((q) => split.get(q.originalId) === 1)).toHaveLength(15);
    }
  });

  it("reproduces the held-out results and disables a gate when either fold fails", () => {
    const expected = {
      "typesafe/jev-1.14": { reading_level: [8, 13], one_right_answer: [15, 15] },
      "google/gemini-decision-1": { reading_level: [14, 13], one_right_answer: [15, 13] },
    };
    for (const model of ["typesafe/jev-1.14", "google/gemini-decision-1"] as const) {
      for (const gate of ["reading_level", "one_right_answer"] as const) {
        const folds = evaluateGateFolds(set.originals, set.changed, results.rows as GateRow[], model, gate);
        expect(folds.map((f) => f.caught)).toEqual(expected[model][gate]);
        expect(folds.every((f) => f.passed)).toBe(GATE_THRESHOLDS[model][gate].enabled);
        expect(folds.map((f) => f.changed)).toEqual([15, 15]);
        expect(folds.map((f) => f.unchanged)).toEqual([54, 54]);
      }
    }
    expect(() => evaluateGateFolds(set.originals, set.changed, results.rows.slice(1) as GateRow[], results.rows[0].model, results.rows[0].gate as "reading_level" | "one_right_answer")).toThrow(/missing/);
  });

  it("selects a fold threshold without reading its held-out answers", () => {
    const rows = results.rows as GateRow[];
    const before = evaluateGateFolds(set.originals, set.changed, rows, "google/gemini-decision-1", "reading_level");
    const split = splitGateQuestions(set.originals);
    const heldOutIds = new Set(set.originals.filter((q) => split.get(q.id) === 0).map((q) => q.id));
    const altered = rows.map((row) => heldOutIds.has(row.id) && row.model === "google/gemini-decision-1" && row.gate === "reading_level" ? { ...row, probability: 0.9 } : row);
    const after = evaluateGateFolds(set.originals, set.changed, altered, "google/gemini-decision-1", "reading_level");
    expect(after[0].threshold).toBe(before[0].threshold);
    expect(after[0].falseFlags).toBe(54);
    expect(after[0].passed).toBe(false);
  });

});
