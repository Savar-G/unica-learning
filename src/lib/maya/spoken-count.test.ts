import { describe, expect, it } from "vitest";
import { createSession, speechKey, speechWords, step, type Proposal } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

const CONJUNCTION_TURN = "You're working hard on this. Look at the ones column. It has 7 and 9. Add the ones: 7 + 9. What do you get?";
const SPOKEN = "You are working hard on this Look at the ones column It has seven and nine Add the ones seven plus nine What do you get";

describe("R443-1: spoken word counts keep every word", () => {
  it("counts the independently written 26-word turn without changing speech equivalence", () => {
    expect(SPOKEN.split(" ")).toHaveLength(26);
    expect(speechWords(CONJUNCTION_TURN)).toBe(26);
    expect(speechWords(SPOKEN)).toBe(26);
    expect(speechKey("one hundred and five")).toBe(speechKey("105"));
    expect(speechWords("one hundred and five")).toBe(4);
  });

  it.each([
    ["1 3/8", 4], ["one and three eighths", 4], ["7 and 9", 3], ["1,234,567", 11], ["28cm²", 4], ["7 + 9 = 16", 5],
    ["I'm at 127 + 28 cm².", 12], ["-28", 3], ["0.85", 4], [".85", 4],
  ])("counts %s as %s spoken words", (text, count) => expect(speechWords(text)).toBe(count));

  it.each([
    [1, [10], 25, true], [1, [1], 26, false],
    [4, [1, 2, 1, 6], 45, true], [4, [1, 2, 1, 8], 46, false],
  ] as const)("grade %s accepts only its boundary (%s, %s words)", (grade, picks, count, accepted) => {
    let s = createSession({ callId: "boundary", package: FIXTURES.A, grade, random: 9 });
    s = step(s, { type: "start", at: 1000 }).session;
    s = step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).session;
    s = step(s, { type: "child_turn", at: 1001, text: "I tried it." }).session;
    const result = step(s, { type: "proposal", at: 1001, proposal: { version: 2, act: "guide", step: "ones", level: 2,
      parts: [...picks.map((pick) => ({ warm: "encourage", pick })), { line: "step.point", slots: { step: "ones" } }, { line: "step.operation", slots: { step: "ones" } }],
      reading: { start: "has_work" } } });
    if (accepted) {
      expect(result.refusal).toBeNull();
      // Independent written speech, with no production number normaliser in this assertion.
      const text = result.effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");
      const words = text.replace(/You're|you're/g, "you are").replace(/7/g, "seven").replace(/9/g, "nine").replace(/\+/g, "plus").match(/[a-z]+/gi);
      expect(words).toHaveLength(count);
    } else {
      expect(result.refusal).toMatchObject({ code: "turn_too_long", reason: `This turn has ${count} spoken words. The limit is ${grade <= 3 ? 25 : 45}.` });
      expect(result.effects).toEqual([]);
    }
  });

  it("refuses the reported grade 1 proposal at seed 9", () => {
    let s = createSession({ callId: "R443-1", package: FIXTURES.A, grade: 1, random: 9 });
    s = step(s, { type: "start", at: 1000 }).session;
    s = step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).session;
    s = step(s, { type: "child_turn", at: 1001, text: "I tried it." }).session;
    const proposal: Proposal = { version: 2, act: "guide", step: "ones", level: 2,
      parts: [{ warm: "encourage", pick: 1 }, { line: "step.point", slots: { step: "ones" } }, { line: "step.operation", slots: { step: "ones" } }],
      reading: { start: "has_work" } };
    const result = step(s, { type: "proposal", at: 1001, proposal });
    expect(result.refusal).toMatchObject({ code: "turn_too_long", reason: "This turn has 26 spoken words. The limit is 25." });
    expect(result.effects).toEqual([]);
  });
});
