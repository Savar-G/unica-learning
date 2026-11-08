import { describe, expect, it } from "vitest";
import { allLineTexts, createSession, heldReason, lineOffers, step, type Session } from "@/lib/maya";
import { askedClaim, claimActs, claimReveals, claimView, readClaimWord } from "@/lib/maya/claim";
import { packageLines } from "@/lib/maya/lines";
import { CLAIM_TRUE_FALSE } from "@/lib/maya-gate/claim-fixtures";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

const TF = ["true", "false"] as const;
const YN = ["yes", "no"] as const;

describe("reading the circled word (A4): an allow-list over the whole turn", () => {
  it.each([
    // Bare words, after Maya's claim question only.
    ["True.", TF, true, { word: "true", committed: false }],
    ["false!", TF, true, { word: "false", committed: false }],
    ["Yeah.", YN, true, { word: "yes", committed: false }],
    ["Nope.", YN, true, { word: "no", committed: false }],
    ["No, 1440 is less than 1450.", YN, true, { word: "no", committed: false }],
    ["Yes, because 1440 is more.", YN, true, { word: "yes", committed: false }],
    ["True.", TF, false, null],
    ["No.", YN, false, null],
    // Committed forms, after any turn of Maya's.
    ["It's true.", TF, false, { word: "true", committed: true }],
    ["I circle no.", YN, false, { word: "no", committed: true }],
    ["The answer is yes.", YN, false, { word: "yes", committed: true }],
    ["It's false, because 3.45 plus 2.38 is 5.83.", TF, false, { word: "false", committed: true }],
    ["6 times 8 is 48, so it's true.", TF, false, { word: "true", committed: true }],
    ["Um, it is no.", YN, false, { word: "no", committed: true }],
    // Unsure, or both words: Maya asks which word.
    ["Maybe true?", TF, true, { unclear: true }],
    ["true?", TF, true, { unclear: true }],
    ["Maybe yes.", YN, true, { unclear: true }],
    ["I think it's true.", TF, true, { unclear: true }],
    ["It's not true.", TF, true, { unclear: true }],
    ["true and false", TF, true, { unclear: true }],
    ["True or false.", TF, true, { unclear: true }],
    ["Yes, it's true.", TF, true, { unclear: true }],
    // No answer at all, or a word that is not one of the two.
    ["No idea.", YN, true, null],
    ["I don't know.", YN, true, null],
    ["Yes.", TF, true, null],
    ["It's right.", YN, true, null],
    ["Yes, it is not greater.", YN, true, null],
    ["No, I want to stop.", YN, true, null],
    ["48.", TF, true, null],
  ] as const)("%j (%j, asked %s)", (text, choices, asked, want) => {
    expect(readClaimWord(text, choices, asked)).toEqual(want);
  });

  it("knows Maya's claim question by its end: the two printed words", () => {
    expect(askedClaim("Now we can check it. Is 6 × 8 = 48 true or false?", TF)).toBe(true);
    expect(askedClaim("Is 360 × 4 greater than 1436? Circle yes or no.", YN)).toBe(true);
    expect(askedClaim("Which word do you circle: yes or no?", YN)).toBe(true);
    expect(askedClaim("Did you say 1440?", YN)).toBe(false);
    expect(askedClaim("Yes! 6 × 8 = 48. What do you get for 6 × 8?", YN)).toBe(false);
    expect(askedClaim(undefined, YN)).toBe(false);
  });
});

describe("a claim question's session (A4)", () => {
  const tf = FIXTURES.CLAIM_TF as OperationPackage;

  it("teaches the operation's steps, then the compare step, with the word as the answer", () => {
    const s = createSession({ callId: "claim-1", package: tf });
    expect(s.contentProblem).toBeNull();
    expect(s.package!.answer.value).toEqual({ type: "choice", value: "true" });
    expect(s.package!.steps.map((st) => st.id)).toEqual(["r1-ones", "r1-tens", "claim", "result"]);
    expect(s.package!.steps.find((st) => st.id === "claim")).toEqual({ id: "claim", kind: "claim-compare", relation: "equal", value: 48, shown: 48, holds: true });
    expect(s.package!.easierExample.steps.map((st) => st.kind)).toEqual(["multiply-digit", "claim-compare", "result"]);
  });

  it("holds a stored claim with no operation, and a teaching package whose operation is not the printed one", () => {
    expect(heldReason(CLAIM_TRUE_FALSE)).toBe("Maya cannot teach items with no operation yet");
    // 8 × 6 checks as a package, but the page prints 6 × 8: code's operation must be the printed one.
    const swapped: Operation = { kind: "multiply", operands: [8, 6] };
    expect(heldReason({ ...tf, operation: swapped, steps: workedSteps(swapped) })).toBe("Maya cannot teach this circle question yet");
  });

  it("never gives the word: give_answer leaves the acts, and guide or close takes its place where it was the only way on", () => {
    const pkg = claimView(tf);
    expect(claimActs(pkg, ["accept_answer", "guide", "give_answer"])).toEqual(["accept_answer", "guide"]);
    expect(claimActs(pkg, ["give_answer", "confirm"])).toEqual(["guide", "confirm", "close"]);
    expect(claimActs(FIXTURES.A as OperationPackage, ["give_answer"])).toEqual(["give_answer"]);
  });

  it("knows when Maya's words give the word away before it is released", () => {
    const pkg = claimView(tf);
    expect(claimReveals(pkg, "guide", ["Good thinking. It's true!"])).toBe(true);
    expect(claimReveals(pkg, "guide", ["Now circle true on your page."])).toBe(true);
    expect(claimReveals(pkg, "confirm", ["Do you circle true or false?"])).toBe(false);
    expect(claimReveals(pkg, "guide", ["Is 6 × 8 = 48 true or false?"])).toBe(false);
    expect(claimReveals(pkg, "example_step", ["So we circle true."])).toBe(false);
    expect(claimReveals(pkg, "guide", ["It's false."])).toBe(false);
  });

  it("asks the child to circle the word, never to write a number", () => {
    const l = packageLines(claimView(tf));
    expect(l.answerGive()).toEqual([]);
    expect(l.answerParts()).toEqual([]);
    for (const o of [...l.writeAnswer(), ...l.writeYours()]) for (const t of o.texts) expect(t).toMatch(/\bcircle\b/i);
    expect(l.writeAnswer()[0].texts.every((t) => /\btrue\b/.test(t) && !/\d/.test(t))).toBe(true);
    const texts = allLineTexts(tf);
    expect(texts).toContain("Please circle true on your page.");
    // No line asks for the answer on paper: the only number written is a column's digit ("Write the carried 4 at the front."),
    // and the other way to answer is the board ("You can write your answer on the board instead.").
    expect(texts.filter((t) => /\bwrite (?:48|true|false|your answer)\b(?! on the board)/i.test(t))).toEqual([]);
  });

  it("says the product printed the other way round is the same number", () => {
    const l = packageLines(claimView(FIXTURES.CLAIM_GT as OperationPackage));
    expect(l.question()[0].texts[0]).toBe("4 × 360 is the same as 360 × 4. Let's work out 360 × 4 first.");
    expect(l.help("result")[0].texts[0]).toBe("Is 360 × 4 greater than 1436? Circle yes or no.");
  });

  /** A call opened with the hello and the question's first line. */
  function opened(pkg: unknown): Session {
    let s = createSession({ callId: "claim-flow", package: pkg });
    s = step(s, { type: "start", at: 0 }).session;
    return step(s, { type: "proposal", at: 1, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "assess.ask" }] } }).session;
  }

  it("accepts a committed right word, refuses a wrong one, and asks which word for an unsure one", () => {
    const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] };
    const right = step(step(opened(tf), { type: "child_turn", at: 2, text: "It's true." }).session, { type: "proposal", at: 3, proposal: accept });
    expect(right.refusal).toBeNull();
    expect(right.session.solved).toBe("child");
    expect(right.effects.find((e) => e.kind === "say")).toMatchObject({ text: expect.stringMatching(/6 × 8 = 48.*true/) });

    const wrong = step(step(opened(FIXTURES.CLAIM_GT), { type: "child_turn", at: 2, text: "It's no." }).session, { type: "proposal", at: 3, proposal: accept });
    expect(wrong.refusal?.code).toBe("accepts_wrong_answer");

    const unsure = step(opened(tf), { type: "child_turn", at: 2, text: "Maybe true?" }).session;
    expect(lineOffers(unsure).confirm?.map((o) => o.line)).toEqual(["confirm.claim"]);
    expect(lineOffers(unsure).confirm?.[0].texts[0]).toBe("Which word do you circle: true or false?");
  });

  it("does not take a bare word as the answer before Maya asks the claim", () => {
    const s = step(opened(tf), { type: "child_turn", at: 2, text: "True." }).session;
    const r = step(s, { type: "proposal", at: 3, proposal: { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] } });
    expect(r.refusal?.code).toBe("accepts_wrong_answer");
  });
});
