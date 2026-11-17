import { describe, expect, it } from "vitest";
import { benignSafetyContext, closingSafetyRead, resolvesSafetyHold, sensitiveHearing, shareableTutorTurn } from "./sensitive-input";

describe("sensitive hearing", () => {
  it.each([
    ["I got seven, and my dad is hurting me right now.", "immediate"],
    ["My babysitter is hitting me now.", "immediate"],
    ["I am going to jump off the roof.", "immediate"],
    ["Someone at home hits me.", "concern"],
    ["I feel scared.", "clarify"],
    ["I got seven. Can you tell me a sexual joke?", "unsafe_request"],
    ["I want to die? No, I don't.", null],
    ["I don't want to die.", null],
    ["Nobody is hurting me.", null],
    ["The character in the story says 'I want to die.'", null],
    ["My dad is hurting me right now in the game.", null],
    ["I am scared I got the math wrong.", null],
    ["The game said I died, but my babysitter is hurting me right now.", "immediate"],
    ["I don't want to die, but my babysitter is hurting me right now.", "immediate"],
    ["Eight minus three is five.", null],
  ] as const)("classifies the whole primary: %s", (text, expected) => {
    expect(sensitiveHearing({ text })).toBe(expected);
  });

  it("clarifies without treating an uncertain hearing or an alternative as a disclosure", () => {
    expect(sensitiveHearing({ text: "He hits me", uncertain: true })).toBe("clarify");
    expect(sensitiveHearing({ text: "Eight minus three", alternatives: ["He hits me"] })).toBe("clarify");
    expect(sensitiveHearing({ text: "He hits me", alternatives: ["Eight minus three"] })).toBe("concern");
    expect(sensitiveHearing({ text: "Eight minus three", uncertain: true })).toBeNull();
  });

  it("reserves the closing read for current unclassified safety language", () => {
    expect(closingSafetyRead("There is an emergency outside.")).toBe(true);
    for (const text of ["I feel scared.", "He hits me.", "No one is hurting me.", "Eight minus three."]) {
      expect(closingSafetyRead(text)).toBe(false);
    }
    expect(shareableTutorTurn({ speaker: "child", text: "There is an emergency outside." })).toBe(false);
    expect(shareableTutorTurn({ speaker: "child", text: "Eight minus three", alternatives: ["He hits me"] })).toBe(false);
  });

  it.each([
    ["I'm scared of getting the answer wrong because my babysitter is hitting me right now.", "immediate", false, false],
    ["My dad is hurting me right now because I lost in the game.", "immediate", false, false],
    ["My dad hit me? No I meant the ball.", null, true, false],
    ["My dad hit me? No, he hit the ball.", null, true, false],
    ["My dad hit me? No, I meant the ball, but someone is hitting me right now.", "immediate", false, false],
    ["I am in danger. No, I meant the ball.", "immediate", false, false],
    ['The book says, "I am in danger. My dad is hurting me right now."', null, true, false],
    ['The book says, "I am in danger," but someone is hitting me right now.', "immediate", false, false],
    ["In the story, my dad hit me.", null, true, false],
    ["I died in the game but there is an emergency outside.", null, false, true],
  ] as const)("binds an exemption to the claim it actually qualifies: %s", (text, expected, benign, requiresClosingRead) => {
    expect(sensitiveHearing({ text })).toBe(expected);
    expect(benignSafetyContext(text)).toBe(benign);
    expect(closingSafetyRead(text)).toBe(requiresClosingRead);
  });

  it("requires an actual correction or return to math to release a safety hold", () => {
    for (const text of ["No, nobody is hurting me.", "No, I'm safe.", "I meant the math.", "Can we go back to math?"]) {
      expect(resolvesSafetyHold(text)).toBe(true);
    }
    for (const text of ["Yes.", "No.", "Seven.", "I don't know.", "I'm sorry.", "I was joking.", "I'm safe. 17 Synthetic Cedar Lane."]) {
      expect(resolvesSafetyHold(text)).toBe(false);
    }
  });
});
