import { describe, expect, it } from "vitest";
import { levelCertainty, storedLevelCertainty, strandCertainty } from "@/lib/assessment";
import { allRight, takeTest } from "./scripted-child";

// #189 (spec #181): a result is "clear" when one more right answer or one more wrong answer would not change it.
// Secure from 80%, Developing from 50% (D-084).
describe("strand certainty: one answer more right or wrong would not change the status", () => {
  it.each([
    [6, 6, "clear"], // Secure; 7 of 7 and 6 of 7 (86%) stay Secure
    [5, 6, "early-sign"], // Secure (83%); 5 of 7 (71%) is Developing
    [3, 6, "early-sign"], // Developing (50%); 3 of 7 (43%) is Needs attention
    [4, 6, "clear"], // Developing (67%); 5 of 7 (71%) and 4 of 7 (57%) stay Developing
    [0, 6, "clear"], // Needs attention; 1 of 7 (14%) stays
    [2, 6, "clear"], // Needs attention (33%); 3 of 7 (43%) and 2 of 7 (29%) stay
    [8, 10, "early-sign"], // Secure (80%); 8 of 11 (73%) is Developing
    [9, 10, "clear"], // Secure (90%); 9 of 11 (82%) stays Secure
    [1, 1, "early-sign"], // Secure; 1 of 2 (50%) is Developing
  ] as const)("%i of %i is %s", (correct, total, certainty) => {
    expect(strandCertainty(correct, total)).toBe(certainty);
  });
});

describe("working level certainty: one answer more right or wrong at any level would not change it", () => {
  it("is clear when every level is far from the 70% bar", () => {
    // Grade 4: 18 of 18; grade 5: 2 of 18. One more answer cannot move either across 70%.
    expect(levelCertainty([{ level: 4, correct: 18, total: 18 }, { level: 5, correct: 2, total: 18 }])).toBe("clear");
  });

  it("is an early sign when one more wrong answer drops the working level", () => {
    // Grade 5: 7 of 10 (70%) clears; 7 of 11 (64%) does not, so the level would fall to 4.
    expect(levelCertainty([{ level: 4, correct: 10, total: 10 }, { level: 5, correct: 7, total: 10 }])).toBe("early-sign");
  });

  it("is an early sign when one more right answer lifts the working level", () => {
    // Grade 5: 6 of 9 (67%) does not clear; 7 of 10 (70%) does.
    expect(levelCertainty([{ level: 4, correct: 10, total: 10 }, { level: 5, correct: 6, total: 9 }])).toBe("early-sign");
  });
});

describe("an estimated working level is never clear (#242)", () => {
  it("is an early sign when no level reaches the 70% bar, however far below it each level is", () => {
    // Grade 4: 2 of 18; grade 5: 1 of 18. The working level is one under the lowest level asked: no question measured it.
    expect(levelCertainty([{ level: 4, correct: 2, total: 18 }, { level: 5, correct: 1, total: 18 }])).toBe("early-sign");
  });

  it("a stored estimate that was labelled clear reads as an early sign; other stored labels read as they are", () => {
    expect(storedLevelCertainty({ confidence: "low", certainty: "clear" })).toBe("early-sign");
    expect(storedLevelCertainty({ confidence: "normal", certainty: "clear" })).toBe("clear");
    expect(storedLevelCertainty({ confidence: "normal", certainty: "early-sign" })).toBe("early-sign");
    // Stored before #189: no label, and none is made up.
    expect(storedLevelCertainty({ confidence: "low" })).toBeUndefined();
  });

  it("a child with every answer wrong gets an estimate, labelled an early sign", () => {
    const { placement } = takeTest({ grade: 5, province: "BC" }, 1, () => false);
    expect(placement.confidence).toBe("low");
    expect(placement.levelCertainty).toBe("early-sign");
  });
});

describe("a finished test labels each area and the working level", () => {
  it("a child with every question right is clear in every area and at the working level", () => {
    const { placement } = takeTest({ grade: 4, province: "BC" }, 1, allRight);
    expect(placement.strands.every((s) => s.certainty === "clear")).toBe(true);
    expect(placement.levelCertainty).toBe("clear");
  });

  it("an area with one wrong answer among its few questions is Secure, but an early sign", () => {
    // Grade 4, routed up: each area has six questions at or below grade 4. With one wrong, 5 of 6 is Secure,
    // and 5 of 7 (71%) would be Developing.
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i !== 0);
    expect(placement.route).toBe("up");
    const missed = placement.strands.find((s) => s.correct === s.total - 1)!;
    expect(missed.total).toBe(6);
    expect(missed.status).toBe("secure");
    expect(missed.certainty).toBe("early-sign");
    expect(asked).toHaveLength(42);
  });
});
