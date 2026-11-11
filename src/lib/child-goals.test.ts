import { describe, expect, it } from "vitest";
import { cleanGoals, goalFacts, goalsNext, goalsPath, GOAL_QUESTIONS, needsGoals } from "@/lib/child-goals";

const row = (r: Partial<{ learning_goal: string | null; math_feeling: string | null; math_help: string | null }> = {}) =>
  ({ learning_goal: null, math_feeling: null, math_help: null, ...r });

describe("the goal questions (D-325)", () => {
  it("asks three select-one questions with Savar's options, and no keep_up at signup", () => {
    expect(GOAL_QUESTIONS.map((q) => q.question.replace("{name}", "Ava"))).toEqual([
      "What is your main goal for Ava in math?",
      "How does Ava feel about math right now?",
      "What math help does Ava get now, other than school?",
    ]);
    expect(GOAL_QUESTIONS[0].options.map((o) => o.label)).toEqual([
      "Catch up to grade level", "Feel confident at grade level", "Get ready for the next grade", "Get ahead with more challenge", "Not sure yet",
    ]);
    expect(GOAL_QUESTIONS[1].options.map((o) => o.label)).toEqual(["Enjoys it", "It's okay", "Finds it hard", "Gets upset or avoids it"]);
    expect(GOAL_QUESTIONS[2].options.map((o) => o.label)).toEqual(["Only school", "A parent or family member", "A tutor or learning centre", "A math app or website"]);
  });
});

describe("cleanGoals", () => {
  it("takes three offered answers", () => {
    expect(cleanGoals({ goal: "next_grade", feeling: "finds_hard", help: "tutor" })).toEqual({ goal: "next_grade", feeling: "finds_hard", help: "tutor" });
  });

  it("refuses a missing answer, an unknown answer, keep_up and a body that is not an object", () => {
    expect(cleanGoals({ goal: "catch_up", feeling: "okay" })).toBeNull();
    expect(cleanGoals({ goal: "catch_up", feeling: "okay", help: "school" })).toBeNull();
    expect(cleanGoals({ goal: "keep_up", feeling: "okay", help: "app" })).toBeNull();
    expect(cleanGoals(["catch_up"])).toBeNull();
    expect(cleanGoals(null)).toBeNull();
  });
});

describe("needsGoals", () => {
  it("asks a child with no test until all three answers are stored", () => {
    expect(needsGoals(row(), false)).toBe(true);
    expect(needsGoals(row({ learning_goal: "catch_up", math_feeling: "okay" }), false)).toBe(true);
    expect(needsGoals(row({ learning_goal: "catch_up", math_feeling: "okay", math_help: "parent" }), false)).toBe(false);
  });

  it("never asks a child who has a test, so an older family or a test in progress is not stopped", () => {
    expect(needsGoals(row(), true)).toBe(false);
  });

  it("asks again when a stored value is one this code does not know", () => {
    expect(needsGoals(row({ learning_goal: "catch_up", math_feeling: "okay", math_help: "robot" }), false)).toBe(true);
  });
});

describe("goalFacts (the admin pages)", () => {
  it("gives the three answers in words, and No answer for an older child", () => {
    expect(goalFacts(row({ learning_goal: "confident", math_feeling: "avoids", math_help: "school_only" }))).toEqual([
      ["Main goal", "Feel confident at grade level"],
      ["Feeling about math", "Gets upset or avoids it"],
      ["Math help now", "Only school"],
    ]);
    expect(goalFacts(row({ learning_goal: "keep_up" }))[0]).toEqual(["Main goal", "Keep up"]);
    expect(goalFacts(row()).map(([, v]) => v)).toEqual(["No answer", "No answer", "No answer"]);
  });
});

describe("goalsNext and goalsPath", () => {
  it("goes on only to a path on this site", () => {
    expect(goalsNext("/account?sent=1")).toBe("/account?sent=1");
    expect(goalsNext("//evil.example")).toBe("/account");
    expect(goalsNext("/\\evil.example")).toBe("/account");
    expect(goalsNext("https://evil.example")).toBe("/account");
    expect(goalsNext(undefined)).toBe("/account");
  });

  it("builds the goals address with the child and the next page", () => {
    expect(goalsPath("/account?sent=1")).toBe("/account/goals?next=%2Faccount%3Fsent%3D1");
    expect(goalsPath("/account/test/c1", "c1")).toBe("/account/goals?child=c1&next=%2Faccount%2Ftest%2Fc1");
  });
});
