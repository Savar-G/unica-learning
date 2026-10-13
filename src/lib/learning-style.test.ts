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
} from "@/lib/learning-style";

const answers = (a: Partial<LearningAnswers> = {}): LearningAnswers => ({ styles: [], interests: [], note: "", ...a });
const sum = (shares: Record<string, number>) => Object.values(shares).reduce((s, n) => s + n, 0);

describe("parseLearning", () => {
  it("accepts one or two learning styles, interests and a note", () => {
    expect(parseLearning({ styles: ["stories", "pictures"], interests: ["space", "animals"], note: "  Likes to count on fingers.  " }))
      .toEqual({ styles: ["stories", "pictures"], interests: ["space", "animals"], note: "Likes to count on fingers." });
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
    const a = answers({ styles: ["hands_on"], interests: ["cooking"], note: "Shy with new topics." });
    expect(fromRow(toRow(a))).toEqual(a);
  });

  it("stores no answer as nulls, and reads nulls as no answer", () => {
    expect(toRow(answers())).toEqual({ learning_styles: null, interests: null, learning_note: null });
    expect(fromRow({ learning_styles: null, interests: null, learning_note: null })).toBeNull();
    expect(fromRow({ learning_styles: [], interests: [], learning_note: "" })).toBeNull();
  });

  it("drops values that are no longer offered", () => {
    expect(fromRow({ learning_styles: ["stories", "old"], interests: ["gone"], learning_note: null })).toEqual(answers({ styles: ["stories"] }));
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

  it("always shares out the whole book", () => {
    for (const a of [null, answers({ styles: ["worked"] }), answers({ styles: ["hands_on", "stories"] })]) expect(sum(bookMix(a).shares)).toBe(100);
  });

  it("sets story problems in the child's interests, or in a mix of settings without them", () => {
    expect(bookMix(answers({ interests: ["animals", "sports"] })).settings).toEqual(["animals", "sports"]);
    expect(bookMix(null).settings).toEqual([]);
  });
});
