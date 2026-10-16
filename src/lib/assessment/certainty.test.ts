import { describe, expect, it } from "vitest";
import { levelCertainty, strandCertainty } from "@/lib/assessment";
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

describe("a finished test labels each area and the working level", () => {
  it("a child with every question right is clear in every area and at the working level", () => {
    const { placement } = takeTest({ grade: 4, province: "BC" }, 1, allRight);
    expect(placement.strands.every((s) => s.certainty === "clear")).toBe(true);
    expect(placement.levelCertainty).toBe("clear");
  });

  it("an area with one wrong answer among its few questions is Secure, but an early sign", () => {
    // Grade 4, routed up: each area has 4-5 questions at or below grade 4. With one wrong, 4 of 5 is Secure (80%),
    // and 4 of 6 (67%) would be Developing.
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i !== 0);
    expect(placement.route).toBe("up");
    const missed = placement.strands.find((s) => s.correct === s.total - 1)!;
    expect(missed.total).toBe(5);
    expect(missed.status).toBe("secure");
    expect(missed.certainty).toBe("early-sign");
    expect(asked).toHaveLength(36);
  });
});
