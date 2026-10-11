import { describe, expect, it } from "vitest";
import { GRADE_1_2_BANK, fillTemplate, spokenChoices, toPublicQuestion } from "@/lib/assessment";

const template = GRADE_1_2_BANK.find((t) => t.id === "3-bar-graph-more")!;

describe("figures the screen draws (#79)", () => {
  it("the bar graph question sends its bars to the screen, and its text asks the child to read them", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const q = toPublicQuestion(fillTemplate(template, seed));
      expect(q.figure?.kind).toBe("bars");
      const bars = q.figure!.bars;
      expect(bars).toHaveLength(2);
      for (const bar of bars) {
        expect(q.prompt.toLowerCase()).toContain(bar.label.toLowerCase());
        expect(bar.value).toBeGreaterThan(0);
        // The prompt no longer says how far each bar goes: reading the graph is the skill (3.12).
        expect(q.prompt).not.toMatch(new RegExp(`\\b${bar.value}\\b`));
      }
    }
  });

  it("other questions carry no figure", () => {
    const other = GRADE_1_2_BANK.find((t) => t.id === "k-who-has-more")!;
    expect(toPublicQuestion(fillTemplate(other, 1)).figure).toBeUndefined();
  });

  it("names each choice the way the voice says it, so a row's label and the voice agree", () => {
    expect(spokenChoices({}, ["▬▬▬▬", "They are the same length", "▬▬"])).toEqual(["the first line", "They are the same length", "the second line"]);
    expect(spokenChoices({}, ["▲", "■ square"])).toEqual(["triangle", "square"]);
  });
});
