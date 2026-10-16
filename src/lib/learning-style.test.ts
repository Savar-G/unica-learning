import { describe, expect, it } from "vitest";
import {
  bookMix,
  DEFAULT_MIX,
  fromRow,
  INTERESTS,
  LEARNING_STYLES,
  NOTE_MAX,
  parseLearning,
  toRow,
  type LearningAnswers,
  type LearningRow,
  answerFacts,
} from "@/lib/learning-style";

const answers = (a: Partial<LearningAnswers> = {}): LearningAnswers => ({ styles: [], interests: [], note: "", feeling: null, goal: null, weeklyTime: null, ...a });
const NO_ANSWER: LearningRow = { learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null };
const sum = (shares: Record<string, number>) => Object.values(shares).reduce((s, n) => s + n, 0);

describe("parseLearning", () => {
  it("accepts one or two learning styles, interests and a note", () => {
    expect(parseLearning({ styles: ["stories", "pictures"], interests: ["space", "animals"], note: "  Likes to count on fingers.  " }))
      .toEqual(answers({ styles: ["stories", "pictures"], interests: ["space", "animals"], note: "Likes to count on fingers." }));
  });

  it("accepts one answer each for how the child feels about math, the parent's main goal and the time each week", () => {
    expect(parseLearning({ feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" }))
      .toEqual(answers({ feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" }));
  });

  it("treats missing fields as no answer, so a parent can answer only some questions or clear them", () => {
    expect(parseLearning({ interests: ["sports"] })).toEqual(answers({ interests: ["sports"] }));
    expect(parseLearning({})).toEqual(answers());
  });

  it("rejects more than two styles, unknown values and repeats", () => {
    expect(parseLearning({ styles: ["stories", "pictures", "worked"] })).toBeNull();
    expect(parseLearning({ styles: ["videos"] })).toBeNull();
    expect(parseLearning({ styles: ["stories", "stories"] })).toBeNull();
    expect(parseLearning({ interests: ["dinosaurs"] })).toBeNull();
    expect(parseLearning({ interests: ["space", "space"] })).toBeNull();
  });

  it("rejects a feeling, goal or weekly time that is not offered, a list in place of one answer, and other types", () => {
    expect(parseLearning({ feeling: "hates" })).toBeNull();
    expect(parseLearning({ goal: "win" })).toBeNull();
    expect(parseLearning({ weeklyTime: "5h" })).toBeNull();
    expect(parseLearning({ goal: ["catch_up", "get_ahead"] })).toBeNull();
    expect(parseLearning({ feeling: 1 })).toBeNull();
    expect(parseLearning({ weeklyTime: true })).toBeNull();
    expect(parseLearning({ feeling: null, goal: null, weeklyTime: null })).toEqual(answers());
  });

  it("rejects a note over the limit and values of the wrong type", () => {
    expect(parseLearning({ note: "x".repeat(NOTE_MAX + 1) })).toBeNull();
    expect(parseLearning({ note: "x".repeat(NOTE_MAX) })?.note).toHaveLength(NOTE_MAX);
    expect(parseLearning({ styles: "stories" })).toBeNull();
    expect(parseLearning({ note: 5 })).toBeNull();
    expect(parseLearning(null)).toBeNull();
    expect(parseLearning("stories")).toBeNull();
  });

  it("offers the four styles and the interest chips the parent sees", () => {
    expect(LEARNING_STYLES.map((s) => s.label)).toEqual([
      "Pictures and diagrams",
      "Stories and real-life problems",
      "Step-by-step worked examples",
      "Hands-on: drawing, counting objects",
    ]);
    expect(INTERESTS.map((i) => i.id)).toEqual(expect.arrayContaining(["animals", "sports", "space", "cooking", "games"]));
  });
});

describe("toRow and fromRow", () => {
  it("round-trips the answers through the children row", () => {
    const a = answers({ styles: ["hands_on"], interests: ["cooking"], note: "Word problems.", feeling: "okay", goal: "keep_up", weeklyTime: "2_to_3h" });
    expect(fromRow(toRow(a))).toEqual(a);
    expect(toRow(a)).toMatchObject({ math_feeling: "okay", learning_goal: "keep_up", weekly_time: "2_to_3h" });
  });

  it("stores no answer as nulls, and reads nulls as no answer", () => {
    expect(toRow(answers())).toEqual(NO_ANSWER);
    expect(fromRow(NO_ANSWER)).toBeNull();
    expect(fromRow({ ...NO_ANSWER, learning_styles: [], interests: [], learning_note: "" })).toBeNull();
  });

  it("reads a parent who answered only one of the new questions as answered", () => {
    expect(fromRow({ ...NO_ANSWER, learning_goal: "get_ahead" })).toEqual(answers({ goal: "get_ahead" }));
    expect(fromRow({ ...NO_ANSWER, math_feeling: "enjoys" })).toEqual(answers({ feeling: "enjoys" }));
    expect(fromRow({ ...NO_ANSWER, weekly_time: "under_1h" })).toEqual(answers({ weeklyTime: "under_1h" }));
  });

  it("drops values that are no longer offered", () => {
    expect(fromRow({ ...NO_ANSWER, learning_styles: ["stories", "old"], interests: ["gone"] })).toEqual(answers({ styles: ["stories"] }));
    expect(fromRow({ ...NO_ANSWER, learning_goal: "keep_up", math_feeling: "old", weekly_time: "gone" })).toEqual(answers({ goal: "keep_up" }));
    expect(fromRow({ ...NO_ANSWER, math_feeling: "old" })).toBeNull();
  });
});

describe("bookMix", () => {
  it("gives a child with no answer the default mix", () => {
    expect(bookMix(null)).toEqual(DEFAULT_MIX);
    expect(bookMix(answers({ interests: ["space"] })).shares).toEqual(DEFAULT_MIX.shares);
    expect(DEFAULT_MIX.isDefault).toBe(true);
    expect(new Set(Object.values(DEFAULT_MIX.shares)).size).toBe(1);
  });

  it("leans the book toward one chosen style", () => {
    const mix = bookMix(answers({ styles: ["stories"] }));
    expect(mix.isDefault).toBe(false);
    expect(mix.shares).toEqual({ pictures: 15, stories: 55, worked: 15, hands_on: 15 });
  });

  it("splits the lean between two chosen styles", () => {
    expect(bookMix(answers({ styles: ["pictures", "worked"] })).shares).toEqual({ pictures: 40, stories: 10, worked: 40, hands_on: 10 });
  });

  it("keeps the mix driven by the learning styles alone: feeling, goal and weekly time do not change it", () => {
    const extra = { feeling: "avoids", goal: "catch_up", weeklyTime: "under_1h" } as const;
    expect(bookMix(answers({ styles: ["stories"], ...extra }))).toEqual(bookMix(answers({ styles: ["stories"] })));
    expect(bookMix(answers(extra))).toEqual(DEFAULT_MIX);
  });

  it("always shares out the whole book", () => {
    for (const a of [null, answers({ styles: ["worked"] }), answers({ styles: ["hands_on", "stories"] })]) expect(sum(bookMix(a).shares)).toBe(100);
  });

  it("sets story problems in the child's interests, or in a mix of settings without them", () => {
    expect(bookMix(answers({ interests: ["animals", "sports"] })).settings).toEqual(["animals", "sports"]);
    expect(bookMix(null).settings).toEqual([]);
  });
});

describe("answerFacts (the admin child page)", () => {
  it("shows the feeling about math, the main goal and the time each week beside the other answers", () => {
    const facts = new Map(answerFacts(answers({ styles: ["worked"], note: "Carrying.", feeling: "avoids", goal: "catch_up", weeklyTime: "under_1h" })));
    expect(facts.get("Feeling about math")).toBe("Avoids it");
    expect(facts.get("Main goal")).toBe("Catch up");
    expect(facts.get("Time each week")).toBe("Under 1 hour");
    expect(facts.get("Finds hard in math")).toBe("Carrying.");
    expect(facts.get("Learns best from")).toBe("Step-by-step worked examples");
  });

  it("says no answer for each question the parent skipped", () => {
    const facts = new Map(answerFacts(answers({ goal: "get_ahead" })));
    expect(facts.get("Main goal")).toBe("Get ahead");
    expect(facts.get("Feeling about math")).toBe("No answer");
    expect(facts.get("Time each week")).toBe("No answer");
    expect(new Map(answerFacts(null)).get("Main goal")).toBe("No answer");
  });
});
