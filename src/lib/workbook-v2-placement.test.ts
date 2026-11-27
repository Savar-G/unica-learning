import { describe, expect, it } from "vitest";
import { placeV2Workbook, type V2WorkbookLevel } from "@/lib/workbook-v2-placement";

const noEvidence = { questions: [], answers: [] };
const SEED = 659;
const upperLevels: V2WorkbookLevel[] = [4, 5, 6, 7, 8, 9, 10, 11, 12];

function prerequisiteQuestions() {
  const result = placeV2Workbook(3, noEvidence, SEED);
  if (result.kind !== "needs_level_3_check") throw new Error("Expected a prerequisite check");
  return result.questions;
}

describe("v2 workbook placement", () => {
  it("waits for a measured assessment and starts results below Level 2 at Level 2", () => {
    expect(placeV2Workbook(null, noEvidence, SEED)).toEqual({ kind: "needs_assessment" });
    for (const level of [0, 1] as const) {
      expect(placeV2Workbook(level, noEvidence, SEED)).toEqual({ kind: "placed", level: 2, topic: 1 });
    }
  });

  it.each(upperLevels)("starts a measured Level %i at its first topic", level => {
    expect(placeV2Workbook(level, noEvidence, SEED)).toEqual({ kind: "placed", level, topic: 1 });
  });

  it("draws two addition and two subtraction questions and waits for all four results", () => {
    const questions = prerequisiteQuestions();
    expect(questions.map(question => question.templateId)).toEqual([
      "2-add-2-digit", "2-story-add-2-digit", "2-subtract-2-digit", "2-story-subtract-2-digit",
    ]);
    expect(placeV2Workbook(2, noEvidence, SEED, questions.slice(0, 3).map(question => ({
      questionId: question.id, correct: true,
    })))).toEqual({ kind: "needs_level_3_check", questions });
  });

  it.each([[2, 2], [3, 3], [4, 3]] as const)(
    "places %i correct at Level %i from existing evidence or the fallback",
    (right, level) => {
      const questions = prerequisiteQuestions();
      const answers = questions.map((question, i) => ({ questionId: question.id, correct: i < right }));
      const expected = { kind: "placed", level, topic: 1 };
      expect(placeV2Workbook(3, { questions, answers }, SEED)).toEqual(expected);
      expect(placeV2Workbook(2, noEvidence, SEED, answers)).toEqual(expected);
    },
  );

  it("does not repeat a question from the original assessment", () => {
    const [alreadyAsked] = prerequisiteQuestions();
    const result = placeV2Workbook(3, {
      questions: [alreadyAsked], answers: [{ questionId: alreadyAsked.id, correct: true }],
    }, SEED);
    if (result.kind !== "needs_level_3_check") throw new Error("Expected a prerequisite check");
    expect(result.questions.map(question => question.prompt)).not.toContain(alreadyAsked.prompt);
  });
});
