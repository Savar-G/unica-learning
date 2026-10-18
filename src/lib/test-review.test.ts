import { describe, expect, it } from "vitest";
import { leaveDestination, questionButtons, type QuestionPlace } from "@/lib/test-review";

// Back, Next, the step row and "Check your answers" (#249, #253, #254), and review (D-132): once a section's grid is
// reached, every question of that section has "Back to my answers", which goes back to the grid at once.

/** Stage 1 of a grade 1 test (12 questions), on the newest question 6: questions 1 to 5 are answered. */
const before: QuestionPlace = { reviewing: false, answered: [1, 2, 3, 4, 5], viewing: null, newest: 6, failed: null };
/** The stage 1 grid was reached: all 12 answered, the child opened tile 5. */
const review: QuestionPlace = { reviewing: true, answered: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], viewing: 5, newest: 0, failed: null };
/** The extra round (questions 25 to 32 of the test, shown as 1 to 8), its grid reached, tile 5 (question 29) open. */
const roundReview: QuestionPlace = { reviewing: true, answered: [25, 26, 27, 28, 29, 30, 31, 32], viewing: 29, newest: 0, failed: null };

describe("the main button", () => {
  it("is Next before the grid, on the newest question and on a question the child went back to", () => {
    expect(questionButtons({ reviewing: false, viewing: null, extraRound: false }).main).toBe("Next");
    expect(questionButtons({ reviewing: false, viewing: 3, extraRound: false }).main).toBe("Next");
  });

  it("is Back to my answers on every question of a section whose grid was reached, the extra round too", () => {
    expect(questionButtons({ reviewing: true, viewing: 5, extraRound: false }).main).toBe("Back to my answers");
    expect(questionButtons({ reviewing: true, viewing: 29, extraRound: true }).main).toBe("Back to my answers");
  });
});

describe("Stop here (D-131, unchanged)", () => {
  it("shows only on the extra round's newest question", () => {
    expect(questionButtons({ reviewing: false, viewing: null, extraRound: true }).stopHere).toBe(true);
    expect(questionButtons({ reviewing: false, viewing: 26, extraRound: true }).stopHere).toBe(false);
    expect(questionButtons({ reviewing: true, viewing: 29, extraRound: true }).stopHere).toBe(false);
    expect(questionButtons({ reviewing: false, viewing: null, extraRound: false }).stopHere).toBe(false);
  });
});

describe("before the grid", () => {
  it("Next on a question the child went back to opens the following answered question, then the newest", () => {
    expect(leaveDestination({ ...before, viewing: 3 }, "next")).toEqual({ to: "question", number: 4 });
    expect(leaveDestination({ ...before, viewing: 5 }, "next")).toEqual({ to: "newest" });
  });

  it("Next on the newest question goes on to the next question (the answer request decides it)", () => {
    expect(leaveDestination(before, "next")).toEqual({ to: "newest" });
  });

  it("Back opens the answered question before; on the first question of the section it stays", () => {
    expect(leaveDestination(before, "back")).toEqual({ to: "question", number: 5 });
    expect(leaveDestination({ ...before, viewing: 3 }, "back")).toEqual({ to: "question", number: 2 });
    expect(leaveDestination({ ...before, viewing: 1 }, "back")).toEqual({ to: "stay" });
  });

  it("a step tap opens that question; the newest question's step opens it, except from itself", () => {
    expect(leaveDestination(before, { go: 2 })).toEqual({ to: "question", number: 2 });
    expect(leaveDestination({ ...before, viewing: 2 }, { go: null })).toEqual({ to: "newest" });
    expect(leaveDestination(before, { go: null })).toEqual({ to: "stay" });
  });

  it("the extra round during the test works the same way", () => {
    const round: QuestionPlace = { reviewing: false, answered: [25, 26, 27], viewing: 26, newest: 28, failed: null };
    expect(leaveDestination(round, "next")).toEqual({ to: "question", number: 27 });
    expect(leaveDestination(round, "back")).toEqual({ to: "question", number: 25 });
  });
});

describe("in review (D-132)", () => {
  it("Back to my answers goes to the grid at once, from any question of the section", () => {
    expect(leaveDestination(review, "next")).toEqual({ to: "grid" });
    expect(leaveDestination({ ...review, viewing: 1 }, "next")).toEqual({ to: "grid" });
    expect(leaveDestination({ ...review, viewing: 12 }, "next")).toEqual({ to: "grid" });
  });

  it("Back opens the previous question; on the section's first question it stays", () => {
    expect(leaveDestination(review, "back")).toEqual({ to: "question", number: 4 });
    expect(leaveDestination({ ...review, viewing: 1 }, "back")).toEqual({ to: "stay" });
  });

  it("a step tap opens that question", () => {
    expect(leaveDestination(review, { go: 12 })).toEqual({ to: "question", number: 12 });
  });

  it("the extra round's grid, during the test or from the report, works the same way", () => {
    expect(leaveDestination(roundReview, "next")).toEqual({ to: "grid" });
    expect(leaveDestination(roundReview, "back")).toEqual({ to: "question", number: 28 });
    expect(leaveDestination(roundReview, { go: 32 })).toEqual({ to: "question", number: 32 });
  });
});

describe("a failed save", () => {
  it("opens the question whose save failed, before the grid and in review", () => {
    expect(leaveDestination(before, { reopen: 3 })).toEqual({ to: "question", number: 3 });
    expect(leaveDestination(review, { reopen: 9 })).toEqual({ to: "question", number: 9 });
  });

  it("comes first: any way of leaving goes to the question whose save failed, not to the grid", () => {
    expect(leaveDestination({ ...review, failed: 9 }, "next")).toEqual({ to: "question", number: 9 });
    expect(leaveDestination({ ...review, failed: 9 }, "back")).toEqual({ to: "question", number: 9 });
    expect(leaveDestination({ ...before, failed: 2 }, { go: 4 })).toEqual({ to: "question", number: 2 });
  });
});
