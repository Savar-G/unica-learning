import { describe, expect, it } from "vitest";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { calibrateGate, gateFlags, gateRequest, GATE_THRESHOLDS, questionGateProbabilities } from "@/lib/workbook-gates";
import type { PrintedQuestion } from "@/lib/workbook-solve-check";
import { evaluateGateFolds, gateCatchesByKind, splitGateQuestions, type GateRow } from "@/lib/workbook-gate-evaluation";
import results from "../../docs/workbook-gate-set-results.json";
import set from "../../docs/workbook-gate-set.json";

// The copies of #857's run, whose stored answers these results hold. #858 added copies of other kinds (kind other than
// "either-instruction") that are measured once the decision model has answered them.
const firstCopies = set.changed.filter((q) => q.gate === "reading_level" || q.kind === "either-instruction");
// The stored answers of #857's run: the originals and the first copies.
const firstIds = new Set([...set.originals.map((q) => q.id), ...firstCopies.map((q) => q.id)]);
const firstRows = (results.rows as GateRow[]).filter((r) => firstIds.has(r.id));

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
    // (Version 3, #858: every Jev gate is off, so nothing is flagged and nothing is asked.)
    expect(gateFlags("typesafe/jev-1.14", { one_right_answer: 0.98, reading_level: 1, picture_matches: 1, uses_interest: 1 })).toEqual([]);
    expect(gateFlags("typesafe/jev-1.14", {})).toEqual([]);
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
    expect(set.changed.filter((q) => q.gate === "one_right_answer" && q.kind === "either-instruction")).toHaveLength(30);
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
      const copies = firstCopies.filter((q) => q.gate === gate);
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
        const folds = evaluateGateFolds(set.originals, firstCopies, firstRows, model, gate);
        expect(folds.map((f) => f.caught)).toEqual(expected[model][gate]);
        // (On #857's copies only Jev's one-right-answer gate passed; #858's copies turned it off, below.)
        expect(folds.every((f) => f.passed)).toBe(model === "typesafe/jev-1.14" && gate === "one_right_answer");
        expect(folds.map((f) => f.changed)).toEqual([15, 15]);
        expect(folds.map((f) => f.unchanged)).toEqual([54, 54]);
      }
    }
    expect(() => evaluateGateFolds(set.originals, firstCopies, firstRows.slice(1), results.rows[0].model, results.rows[0].gate as "reading_level" | "one_right_answer")).toThrow(/missing/);
  });

  it("selects a fold threshold without reading its held-out answers", () => {
    const rows = firstRows;
    const before = evaluateGateFolds(set.originals, firstCopies, rows, "google/gemini-decision-1", "reading_level");
    const split = splitGateQuestions(set.originals);
    const heldOutIds = new Set(set.originals.filter((q) => split.get(q.id) === 0).map((q) => q.id));
    const altered = rows.map((row) => heldOutIds.has(row.id) && row.model === "google/gemini-decision-1" && row.gate === "reading_level" ? { ...row, probability: 0.9 } : row);
    const after = evaluateGateFolds(set.originals, firstCopies, altered, "google/gemini-decision-1", "reading_level");
    expect(after[0].threshold).toBe(before[0].threshold);
    expect(after[0].falseFlags).toBe(54);
    expect(after[0].passed).toBe(false);
  });

});

describe("#858: multiple-answer copies of other kinds", () => {
  const added = set.changed.filter((q) => q.gate === "one_right_answer" && q.kind !== "either-instruction");
  const split = splitGateQuestions(set.originals);

  it("adds at least 20 copies of at least five kinds, each from its own original", () => {
    expect(added.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(added.map((q) => q.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    expect(kinds.has(undefined)).toBe(false);
    const originals = added.map((q) => q.originalId);
    expect(new Set(originals).size).toBe(originals.length);
    const earlier = new Set(firstCopies.filter((q) => q.gate === "one_right_answer").map((q) => q.originalId));
    expect(originals.filter((id) => earlier.has(id))).toEqual([]);
    // (None says outright that two answers are right: that is the pattern the first 30 share.)
    for (const q of added) expect(q.question.text).not.toMatch(/both answers|either/i);
  });

  it("puts two copies of each kind in each half, so every fold is tested on every kind", () => {
    for (const kind of new Set(added.map((q) => q.kind))) {
      const ofKind = added.filter((q) => q.kind === kind);
      expect(ofKind.filter((q) => split.get(q.originalId) === 0)).toHaveLength(2);
      expect(ofKind.filter((q) => split.get(q.originalId) === 1)).toHaveLength(2);
    }
  });

  it("counts catches by kind with each fold's own threshold, adding up to the fold totals", () => {
    const rows = firstRows;
    for (const model of ["typesafe/jev-1.14", "google/gemini-decision-1"]) {
      const folds = evaluateGateFolds(set.originals, firstCopies, rows, model, "one_right_answer");
      const byKind = gateCatchesByKind(set.originals, firstCopies, rows, model, "one_right_answer");
      expect([...byKind.keys()]).toEqual(["either-instruction"]);
      expect(byKind.get("either-instruction")).toEqual({ caught: folds[0].caught + folds[1].caught, total: 30 });
    }
    // A copy of a new kind that the model thinks has one right answer (a failure probability near 0) is a miss in its kind.
    const copy = added[0];
    const sure = [...rows.filter((r) => r.model === "typesafe/jev-1.14"), { model: "typesafe/jev-1.14", id: copy.id, gate: "one_right_answer" as const, changed: true, probability: 0.01 }];
    const withCopy = gateCatchesByKind(set.originals, [...firstCopies, copy], sure, "typesafe/jev-1.14", "one_right_answer");
    expect(withCopy.get(copy.kind!)).toEqual({ caught: 0, total: 1 });
  });

  it("turns Jev's one-right-answer gate off: with the other kinds a held-out fold misses the bar (2026-11-13 run)", () => {
    const rows = results.rows as GateRow[];
    const copies = set.changed.filter((q) => q.gate === "one_right_answer");
    const folds = evaluateGateFolds(set.originals, copies, rows, "typesafe/jev-1.14", "one_right_answer");
    expect(folds.map((f) => [f.caught, f.changed])).toEqual([[26, 29], [27, 29]]);
    expect(folds.every((f) => f.passed)).toBe(false);
    expect(GATE_THRESHOLDS["typesafe/jev-1.14"].one_right_answer.enabled).toBe(false);
    const byKind = Object.fromEntries(gateCatchesByKind(set.originals, copies, rows, "typesafe/jev-1.14", "one_right_answer"));
    expect(byKind["two-counts"]).toEqual({ caught: 0, total: 4 });
    expect(byKind["either-instruction"]).toEqual({ caught: 30, total: 30 });
  });
});
