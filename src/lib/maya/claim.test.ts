import { describe, expect, it } from "vitest";
import { allLineTexts, createSession, heldReason, lineOffers, step, type Session } from "@/lib/maya";
import { claimActs, claimReveals, claimView, readClaimWord } from "@/lib/maya/claim";
import { packageLines } from "@/lib/maya/lines";
import * as CLAIMS from "@/lib/maya-gate/claim-fixtures";
import { CLAIM_TRUE_FALSE } from "@/lib/maya-gate/claim-fixtures";
import { claimTeaching } from "@/lib/maya-teaching/claim";
import { scopeReason } from "@/lib/maya/scope";
import { speechWords } from "@/lib/maya/speech";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

const TF = ["true", "false"] as const;
const YN = ["yes", "no"] as const;

describe("reading the circled word (A4): an allow-list over the whole turn", () => {
  it.each([
    // Bare words: never the claim's answer (controller rule 4). Maya says the word back before it counts.
    ["True.", TF, { word: "true", committed: false }],
    ["false!", TF, { word: "false", committed: false }],
    ["Yeah.", YN, { word: "yes", committed: false }],
    ["Nope.", YN, { word: "no", committed: false }],
    ["No, 1440 is less than 1450.", YN, { word: "no", committed: false }],
    ["Yes, because 1440 is more.", YN, { word: "yes", committed: false }],
    // Committed forms.
    ["It's true.", TF, { word: "true", committed: true }],
    ["I circle no.", YN, { word: "no", committed: true }],
    ["The answer is yes.", YN, { word: "yes", committed: true }],
    ["It's false, because 3.45 plus 2.38 is 5.83.", TF, { word: "false", committed: true }],
    ["6 times 8 is 48, so it's true.", TF, { word: "true", committed: true }],
    ["Um, it is no.", YN, { word: "no", committed: true }],
    // Unsure, or both words: Maya asks which word.
    ["Maybe true?", TF, { unclear: true }],
    ["true?", TF, { unclear: true }],
    ["Maybe yes.", YN, { unclear: true }],
    ["I think it's true.", TF, { unclear: true }],
    ["It's not true.", TF, { unclear: true }],
    ["true and false", TF, { unclear: true }],
    ["True or false.", TF, { unclear: true }],
    ["Yes, it's true.", TF, { unclear: true }],
    // No answer at all, or a word that is not one of the two.
    ["No idea.", YN, null],
    ["I don't know.", YN, null],
    ["Yes.", TF, null],
    ["It's right.", YN, null],
    ["Yes, it is not greater.", YN, null],
    ["No, I want to stop.", YN, null],
    ["48.", TF, null],
  ] as const)("%j (%j)", (text, choices, want) => {
    expect(readClaimWord(text, choices)).toEqual(want);
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
    expect(l.question()[0].texts[0]).toBe("4 × 360 is the same as 360 × 4.");
    expect(l.help("result")[0].texts[0]).toBe("Is 360 × 4 greater than 1436? Circle yes or no.");
    // "Yes!" about a step could sound like the answer of a yes/no claim.
    for (const id of l.stepIds) for (const t of l.rightStep(id)[0].texts) expect(t).not.toMatch(/^yes\b/i);
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

  it("never takes a bare word as the answer: Maya says it back, and a plain yes to that commits it", () => {
    const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] };
    const bare = step(opened(tf), { type: "child_turn", at: 2, text: "True." }).session;
    expect(step(bare, { type: "proposal", at: 3, proposal: accept }).refusal?.code).toBe("accepts_wrong_answer");
    expect(lineOffers(bare).confirm?.map((o) => [o.line, o.slots.heard])).toEqual([["confirm.word", "true"]]);
    expect(lineOffers(bare).confirm?.[0].texts[0]).toBe("You said true. Is true the word you circle?");
    const asked = step(bare, { type: "proposal", at: 3, proposal: { version: 2, act: "confirm", parts: [{ line: "confirm.word", slots: { heard: "true" } }] } });
    expect(asked.refusal).toBeNull();
    expect(asked.session.wordAsked).toBe("true");
    const yes = step(asked.session, { type: "child_turn", at: 4, text: "Yes." }).session;
    const r = step(yes, { type: "proposal", at: 5, proposal: accept });
    expect(r.refusal).toBeNull();
    expect(r.session.solved).toBe("child");
    expect(r.session.wordAsked).toBeUndefined();
  });

  it("does not take a plain yes to 'Did you say ...?', or a yes after another act, as the claim's word", () => {
    const gt = FIXTURES.CLAIM_GT as OperationPackage;
    const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] };
    // No confirm before it: "Yes." is a bare word, not an answer.
    const yes = step(opened(gt), { type: "child_turn", at: 2, text: "Yes." }).session;
    expect(step(yes, { type: "proposal", at: 3, proposal: accept }).refusal?.code).toBe("accepts_wrong_answer");
  });
});

describe("claim lines fit the word limits and the scope check (A4, lessons from review)", () => {
  const views = Object.values(CLAIMS).map((raw) => claimView(claimTeaching(raw)! as OperationPackage));

  it("every claim line fits 25 spoken words at grade 3, and the opening has a hello and a framing that fit together", () => {
    for (const pkg of views) {
      const l = packageLines(pkg);
      const said = pkg.answer.value.type === "choice" ? pkg.answer.value.value : "";
      const lines = [
        ...l.question(), ...l.exampleIntro(), ...l.help("claim"), ...l.help("result"), ...l.answerRight(), ...l.writeAnswer(), ...l.writeYours(),
        ...l.which(), ...l.said(said), ...l.rightStep("claim"), ...pkg.easierExample.steps.flatMap((st) => l.exampleStep(st.id)),
      ].filter((o) => o.line !== "question.read" && o.line !== "step.show");
      for (const o of lines) for (const t of o.texts) expect(speechWords(t), `${pkg.id}: ${t}`).toBeLessThanOrEqual(25);
      // H3 of the compare step: at least one wording fits.
      expect(l.help("claim").filter((o) => o.line === "step.show").every((o) => o.texts.some((t) => speechWords(t) <= 25)), pkg.id).toBe(true);
      const shortest = (texts: string[]) => Math.min(...texts.map(speechWords));
      expect(shortest(l.hello()[0].texts) + shortest(l.question()[0].texts), pkg.id).toBeLessThanOrEqual(25);
    }
  });

  it.each([
    ["claim-gate-tf", "6 times 8 is 48, so it's true."],
    ["claim-gate-gt", "4 times 360 is 1440."],
    ["claim-gate-gt", "1440 minus 1436 is 4, so it's yes."],
    ["claim-gate-dec", "3.45 plus 2.38 is 5.83, so it's false."],
    ["claim-gate-dec", "5.93 minus 5.83 is 0.1."],
    ["claim-gate-div", "56 divided by 8 is 7, so it's no."],
    ["claim-gate-div", "6 times 8 is 48."],
    ["claim-gate-right", "32 minus 28 is 4."],
  ])("%s: the child's own work in a full sentence is this question's math: %j", (id, text) => {
    expect(scopeReason(views.find((p) => p.id === id)!, text, false)).toBeNull();
  });

  it("other math is still another problem", () => {
    expect(scopeReason(views.find((p) => p.id === "claim-gate-gt")!, "4 times 36 is 144.", false)).toBe("changed_problem");
    expect(scopeReason(views.find((p) => p.id === "claim-gate-tf")!, "7 times 8 is 56.", false)).toBe("changed_problem");
  });
});

