import { describe, expect, it } from "vitest";
import { allLineTexts, createSession, fallbacks, heldReason, learningEvent, lineOffers, nextActs, step, type Session } from "@/lib/maya";
import { claimActs, claimQuestionAsked, claimReveals, claimStepConfirmable, claimStepHeard, claimView, readClaimWord } from "@/lib/maya/claim";
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
/** The child's own work each claim checks a reason against (claim.ts, ownWork). */
const GT = { value: 1440, shown: 1450, operation: { kind: "multiply", operands: [360, 4] } as Operation };
const TFW = { value: 48, shown: 48, operation: { kind: "multiply", operands: [6, 8] } as Operation };
const GT2 = { value: 1440, shown: 1436, operation: { kind: "multiply", operands: [360, 4] } as Operation };
const DEC = { value: 5.83, shown: 5.93, operation: { kind: "decimal-add", operands: [3.45, 2.38] } as Operation };

describe("reading the circled word (A4): an allow-list over the whole turn", () => {
  it.each([
    // Bare words: never the claim's answer (controller rule 4). Maya says the word back before it counts.
    ["True.", TF, { word: "true", committed: false }],
    ["false!", TF, { word: "false", committed: false }],
    ["Yeah.", YN, { word: "yes", committed: false }],
    ["Nope.", YN, { word: "no", committed: false }],
    ["No, 1440 is less than 1450.", YN, { word: "no", committed: false }, GT],
    ["Yes, because 1440 is more.", YN, { word: "yes", committed: false }, GT2],
    // Committed forms.
    ["It's true.", TF, { word: "true", committed: true }],
    ["I circle no.", YN, { word: "no", committed: true }],
    ["The answer is yes.", YN, { word: "yes", committed: true }],
    ["It's false, because 3.45 plus 2.38 is 5.83.", TF, { word: "false", committed: true }, DEC],
    ["It's false, because 5.83 is not 5.93.", TF, { word: "false", committed: true }, DEC],
    ["6 times 8 is 48, so it's true.", TF, { word: "true", committed: true }, TFW],
    ["48, so it's true.", TF, { word: "true", committed: true }, TFW],
    ["1450 minus 1440 is 10, so it's no.", YN, { word: "no", committed: true }, GT],
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
    // Another person's work or a copy is never the child's answer (#737 and #743 reviews): an allow-list for what comes
    // before ", so" and after "because".
    ["My mom said 48, so it's true.", TF, null, TFW],
    ["I copied 48, so it's true.", TF, null, TFW],
    ["My teacher said it's 48, so it's true.", TF, null, TFW],
    ["Mom told me, so it's true.", TF, null, TFW],
    ["I copied it, so it's true.", TF, null, TFW],
    ["My mom said 1440, so it's yes.", YN, null, GT],
    ["It's true, because my mom said so.", TF, null, TFW],
    ["It's yes, because I copied 1440.", YN, null, GT],
    ["Yes, because my friend said 1440.", YN, null, GT],
    ["6 times 9 is 54, so it's true.", TF, null, TFW],
    // The child's own work is checked against the true numbers (#737 review, round 2): the order, equal or not, the result.
    ["1440 is more than 1436, so it's yes.", YN, { word: "yes", committed: true }, GT2],
    ["1436 is less than 1440, so it's yes.", YN, { word: "yes", committed: true }, GT2],
    ["1440 is more, so it's yes.", YN, { word: "yes", committed: true }, GT2],
    ["1440, so it's yes.", YN, { word: "yes", committed: true }, GT2],
    ["48 is 48, so it's true.", TF, { word: "true", committed: true }, TFW],
    ["48 is the same as 48, so it's true.", TF, { word: "true", committed: true }, TFW],
    ["5.83 is not 5.93, so it's false.", TF, { word: "false", committed: true }, DEC],
    ["1440 is less than 1436, so it's yes.", YN, null, GT2],
    ["1436 is more than 1440, so it's yes.", YN, null, GT2],
    ["1440 is 1436, so it's yes.", YN, null, GT2],
    ["1436 is more, so it's yes.", YN, null, GT2],
    ["7, so it's yes.", YN, null, GT2],
    ["It's yes, 7.", YN, null, GT2],
    ["It's yes, because 1440 is less than 1436.", YN, null, GT2],
    ["48 is not 48, so it's true.", TF, null, TFW],
    ["5.83 is 5.93, so it's false.", TF, null, DEC],
    ["1436 minus 1440 is 4, so it's yes.", YN, null, GT2],
    ["1440 minus 1436 is 5, so it's yes.", YN, null, GT2],
    // No work to check against: only a word with nothing beside it counts.
    ["6 times 8 is 48, so it's true.", TF, null],
  ] as const)("%j (%j)", (text, choices, want, work?: { value: number; shown: number; operation: Operation }) => {
    expect(readClaimWord(text, choices, work ?? null)).toEqual(want);
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

  it("never gives the word: give_answer leaves the acts, and the honest close takes its place where it was the only way on", () => {
    const pkg = claimView(tf);
    expect(claimActs(pkg, ["accept_answer", "guide", "give_answer"])).toEqual(["accept_answer", "guide"]);
    // The way out is the honest close, never another top hint (lesson 7).
    expect(claimActs(pkg, ["give_answer", "confirm"])).toEqual(["confirm", "close"]);
    expect(claimActs(pkg, ["accept_answer", "guide"], true)).toEqual(["close"]);
    expect(claimActs(FIXTURES.A as OperationPackage, ["give_answer"])).toEqual(["give_answer"]);
  });

  it("puts the easier example before the honest close while it is not worked and the child did nothing (lesson 10, #737 P2)", () => {
    const pkg = claimView(tf);
    expect(claimActs(pkg, ["give_answer", "confirm"], false, true)).toEqual(["example_step", "confirm"]);
    expect(claimActs(pkg, ["accept_answer", "guide"], true, true)).toEqual(["example_step"]);
    expect(claimActs(pkg, ["accept_answer", "guide"], false, true)).toEqual(["accept_answer", "guide", "example_step"]);
    expect(claimActs(pkg, ["accept_answer", "guide"], false, false)).toEqual(["accept_answer", "guide"]);
    expect(claimActs(FIXTURES.A as OperationPackage, ["guide"], false, true)).toEqual(["guide"]);
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

  /** A call where the child gave 6 × 8 = 48 and Maya then asked the claim itself (the final step's invite). */
  function afterClaimQuestion(): Session {
    const s = step(opened(tf), { type: "child_turn", at: 2, text: "6 times 8 is 48." }).session;
    const r = step(s, { type: "proposal", at: 3, proposal: { version: 2, act: "guide", step: "result", level: 0,
      reading: { answers: [{ value: { type: "number", value: 48 }, step: "claim", verdict: "right" }] },
      parts: [{ line: "check.right_step", slots: { step: "claim" } }, { line: "step.invite", slots: { step: "result" } }] } });
    expect(r.refusal).toBeNull();
    expect(r.session.claimAsked).toBe(true);
    return r.session;
  }

  it("accepts a committed right word, refuses a wrong one, and asks which word for an unsure one", () => {
    const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] };
    const right = step(step(opened(tf), { type: "child_turn", at: 2, text: "It's true." }).session, { type: "proposal", at: 3, proposal: accept });
    expect(right.refusal).toBeNull();
    expect(right.session.solved).toBe("child");
    expect(right.effects.find((e) => e.kind === "say")).toMatchObject({ text: expect.stringMatching(/6 × 8 = 48.*true/) });

    const wrong = step(step(opened(FIXTURES.CLAIM_GT), { type: "child_turn", at: 2, text: "It's no." }).session, { type: "proposal", at: 3, proposal: accept });
    expect(wrong.refusal?.code).toBe("accepts_wrong_answer");

    // Before Maya asks the claim, "Maybe true?" is no claim turn; after, it gets the which-word question.
    expect(lineOffers(step(opened(tf), { type: "child_turn", at: 2, text: "Maybe true?" }).session).confirm?.map((o) => o.line) ?? []).not.toContain("confirm.claim");
    const unsure = step(afterClaimQuestion(), { type: "child_turn", at: 4, text: "Maybe true?" }).session;
    expect(lineOffers(unsure).confirm?.map((o) => o.line)).toEqual(["confirm.claim"]);
    expect(lineOffers(unsure).confirm?.[0].texts[0]).toBe("Which word do you circle: true or false?");
  });

  it("never takes a bare word as the answer: Maya says it back, and a plain yes to that commits it", () => {
    const accept = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }] };
    // Before Maya asks the claim, "True." is no claim turn at all: no say-back.
    const early = step(opened(tf), { type: "child_turn", at: 2, text: "True." }).session;
    expect(lineOffers(early).confirm ?? []).toEqual([]);
    const bare = step(afterClaimQuestion(), { type: "child_turn", at: 4, text: "True." }).session;
    expect(step(bare, { type: "proposal", at: 5, proposal: accept }).refusal?.code).toBe("accepts_wrong_answer");
    expect(lineOffers(bare).confirm?.map((o) => [o.line, o.slots.heard])).toEqual([["confirm.word", "true"]]);
    expect(lineOffers(bare).confirm?.[0].texts[0]).toBe("You said true. Is true the word you circle?");
    const asked = step(bare, { type: "proposal", at: 5, proposal: { version: 2, act: "confirm", parts: [{ line: "confirm.word", slots: { heard: "true" } }] } });
    expect(asked.refusal).toBeNull();
    expect(asked.session.wordAsked).toBe("true");
    const yes = step(asked.session, { type: "child_turn", at: 6, text: "Yes." }).session;
    const r = step(yes, { type: "proposal", at: 7, proposal: accept });
    expect(r.refusal).toBeNull();
    expect(r.session.solved).toBe("child");
    expect(r.session.wordAsked).toBeUndefined();
  });

  it("a child who only asks for help at the top of the final step gets the honest close, and the stuck step is a learning event", () => {
    let s = afterClaimQuestion();
    let at = 10;
    for (const level of [1, 2] as const) {
      s = step(s, { type: "child_turn", at: at++, text: "I'm stuck." }).session;
      const line = level === 1 ? "step.point" : "step.operation";
      const r = step(s, { type: "proposal", at: at++, proposal: { version: 2, act: "guide", step: "result", level, reading: { help: "more" }, parts: [{ line, slots: { step: "result" } }] } });
      expect(r.refusal).toBeNull();
      s = r.session;
    }
    s = step(s, { type: "child_turn", at: at++, text: "I'm stuck." }).session;
    // No endless top hint and no answer: the only way on is the close.
    expect(nextActs(s).acts.filter((a) => a !== "confirm")).toEqual(["close"]);
    const offers = lineOffers(s).close ?? [];
    expect(offers.map((o) => o.line)).toEqual(["close.honest"]);
    for (const t of offers[0].texts) {
      expect(t).not.toMatch(/\d|\b(?:true|false|yes|no)\b/i);
      expect(t).toMatch(/\b(?:stop|stopping)\b/i);
      expect(t).toMatch(/\b(?:easier one|smaller one|grown-up)\b/i);
    }
    // A warm-only close is refused; the honest close ends the call.
    expect(step(s, { type: "proposal", at: at, proposal: { version: 2, act: "close", parts: [{ warm: "closing" }] } }).refusal?.code).toBe("line_not_offered");
    const r = step(s, { type: "proposal", at: at++, proposal: { version: 2, act: "close", parts: [{ line: "close.honest" }] } });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped", assistance: "hint" });
    expect(learningEvent(r.session, { parentId: "p", childId: "c" })).toMatchObject({ source: "call", result: "blank", stuckStep: "result", hints: 2 });
  });

  it.each([["CLAIM_GT", "It's no."], ["CLAIM_TF", "It's false."], ["CLAIM_DEC", "It's true."], ["CLAIM_DIV", "It's yes."]] as const)(
    "%s with the model down: 'I'm stuck.' to the top help, then a wrong word twice, always has a line and writes the stuck step (#737 review)",
    (fixture, wrong) => {
      let s = createSession({ callId: `claim-down-${fixture}`, package: FIXTURES[fixture] });
      let at = 0;
      s = step(s, { type: "start", at: at++ }).session;
      const maya = () => {
        while (s.expect === "maya" && !s.outcome) {
          const next = fallbacks(s).map((p) => step(s, { type: "proposal", at, proposal: p })).find((r) => r.refusal === null);
          expect(next, `no fallback line after ${JSON.stringify(s.turns.at(-1)?.text)}`).toBeDefined();
          s = next!.session;
          at++;
        }
      };
      maya();
      for (const text of ["I'm stuck.", "I'm stuck.", "I'm stuck.", "I'm stuck.", "I'm stuck.", wrong, wrong, "I'm stuck.", "I'm stuck.", "I'm stuck.", "I'm stuck."]) {
        if (s.outcome) break;
        s = step(s, { type: "child_turn", at: at++, text }).session;
        maya();
      }
      expect(s.outcome).toMatchObject({ reason: "child_stopped" });
      expect(s.exampleShown).toBe(s.package!.easierExample.steps.length);
      expect(s.turns.at(-1)?.text).toMatch(/\b(?:stop|stopping)\b/i);
      expect(learningEvent(s, { parentId: "p", childId: "c" })?.stuckStep).toBeTruthy();
    },
  );

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

describe("the compare step's credit (A4, review of #737): a whole-turn allow-list", () => {
  const mul = { kind: "multiply", operands: [360, 4] } as Operation;
  const yes1440 = { type: "number", value: 1440 } as const;
  const heard = (text: string, o: Partial<{ resultAsked: typeof yes1440 | null; shown: boolean; operation: Operation; value: number }> = {}) =>
    claimStepHeard({ text, uncertain: false, operation: o.operation ?? mul, value: o.value ?? 1440, resultAsked: o.resultAsked ?? null, shown: o.shown ?? false });

  it.each([
    "1440", "1440.", "It's 1440.", "I got 1440.", "360 times 4 is 1440.", "4 times 360 is 1440.", "So 4 × 360 = 1440.", "I wrote 1440.", "1440 is on my paper.",
  ])("credits %j", (text) => expect(heard(text)).toBe(true));

  it.each([
    "I guess 1440?", "Maybe 1440.", "Is it 1440?", "1440, I think.", "My mom said 1440.", "I copied 1440 from my friend.", "1440. My dad helped.",
    "4 times 36 is 1440.", "360 plus 4 is 1440.", "1441.", "Yes.", "It's 1440, I think.",
  ])("gives no credit for %j", (text) => expect(heard(text)).toBe(false));

  it("a plain yes credits only Maya's own 'Did you say 1440?', and after H3 only the claim about the child's own paper counts", () => {
    expect(heard("Yes.", { resultAsked: yes1440 })).toBe(true);
    expect(heard("Yes, 1440.", { resultAsked: yes1440 })).toBe(true);
    expect(heard("Yes.", { resultAsked: { type: "number", value: 1436 } as never })).toBe(false);
    expect(heard("1440.", { shown: true })).toBe(false);
    expect(heard("360 times 4 is 1440.", { shown: true })).toBe(false);
    expect(heard("Yes.", { resultAsked: yes1440, shown: true })).toBe(false);
    expect(heard("I wrote 1440.", { shown: true })).toBe(true);
    expect(heard("5.83.", { operation: { kind: "decimal-add", operands: [3.45, 2.38] }, value: 5.83 })).toBe(true);
    expect(heard("56 divided by 8 is 7.", { operation: { kind: "divide", operands: [56, 8] }, value: 7 })).toBe(true);
    expect(heard("8 divided by 56 is 7.", { operation: { kind: "divide", operands: [56, 8] }, value: 7 })).toBe(false);
  });

  it("offers the confirm only for one number, the result, with the step confirm's short list of words", () => {
    for (const t of ["Maybe 1440.", "Is it 1440?", "I got 1440, I think.", "I guess 1440?"]) expect(claimStepConfirmable(t, 1440), t).toBe(true);
    for (const t of ["My mom said 1440.", "I copied 1440 from my friend.", "The answer is 1440.", "Maybe 1436.", "1440 or 1436?"]) expect(claimStepConfirmable(t, 1440), t).toBe(false);
  });

  it("knows the lines that ask the claim itself", () => {
    expect(claimQuestionAsked([{ line: "step.invite", slots: { step: "result" } }])).toBe(true);
    expect(claimQuestionAsked([{ line: "confirm.claim", slots: {} }])).toBe(true);
    expect(claimQuestionAsked([{ line: "confirm.heard", slots: { heard: "1440" } }])).toBe(false);
    expect(claimQuestionAsked([{ line: "assess.ask", slots: {} }, { line: "step.invite", slots: { step: "claim" } }])).toBe(false);
  });
});

