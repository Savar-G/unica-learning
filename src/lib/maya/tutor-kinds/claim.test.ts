import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import type { OperationPackage } from "@/lib/question-package";
import { createSession } from "../session";
import { checkTutorSay } from "../tutor";
import { claimKind } from "./claim";
import { describeTutorKind } from "./contract";
import { tutorKindOf } from "./index";

// The claim kind (F4) on synthetic gate fixtures (never a child's book), as the session holds them: a claim's or a spot
// question's session package (claim.ts, spot-error.ts) and the closed comparisons.

const FIX = FIXTURES as Record<string, unknown>;
/** The package a tutor session teaches from. */
const held = (id: string) => createSession({ callId: `claim-${id}`, package: FIX[id], conversational: true, tutor: true }).package as OperationPackage;

const FITS_CIRCLE = ["CLAIM_TF", "CLAIM_GT", "CLAIM_DIV", "CLAIM_WIDE", "SCALE", "MARBLES", "AREA_TF", "COMPARE_FRACTIONS", "COMPARE_AREAS", "COMPARE_DIE"];
/** Spot the error: the child ticks yes or no, and writes the fix. */
const TICK = ["SPOT_MUL", "SPOT_MISS", "SPOT_PVV", "SPOT_PVD", "SPOT_RIGHT"];
const FITS = [...FITS_CIRCLE, ...TICK];

describeTutorKind(claimKind, FITS.map(held));

describe("the claim kind: fit", () => {
  it("fails closed on a decimal claim: the core cannot read a decimal equation yet", () => {
    for (const id of ["CLAIM_DEC", "MONEY"]) expect(claimKind.fits(held(id)), id).toBe(false);
  });
  it("does not take a column question", () => {
    expect(tutorKindOf(createSession({ callId: "c", package: FIX.CLAIM_TF, conversational: true, tutor: true }).package as OperationPackage)?.id).toBe("claim");
  });
  it("gives the compare step with its reason and the word", () => {
    const gt = claimKind.steps(held("CLAIM_GT")).at(-1)!;
    expect(gt.work).toBe("360 × 4 = 1440; 1440 is greater than 1436, so the claim is true: the answer is yes");
    expect(claimKind.steps(held("CLAIM_DIV")).at(-1)!.work).toContain("so Mia is not right: the answer is no");
    expect(claimKind.steps(held("SPOT_MUL")).at(-1)!.work).toContain("the answer is no, and the fix is 4480");
    expect(claimKind.steps(held("COMPARE_FRACTIONS")).at(-1)!.work).toContain("5/6 is greater than 3/6");
  });
  it("asks each step's question in a closed plain form", () => {
    expect(claimKind.stepQuestion(held("CLAIM_GT"), ["r1-ones"])).toBe("What is 6 × 4?");
    expect(claimKind.stepQuestion(held("CLAIM_GT"), ["r1-ones", "r1-tens", "r1-hundreds", "r1-thousands"])).toBe("Is 1440 greater than 1436?");
    expect(claimKind.stepQuestion(held("CLAIM_DIV"), ["tens", "ones"])).toBe("Is 7 the same as 6?");
    expect(claimKind.stepQuestion(held("COMPARE_AREAS"), ["left-area", "right-area"])).toBe("Which is bigger, 42 or 30?");
  });
  it("gives the missing number's frame as a note, not a step", () => {
    const pkg = held("SPOT_MISS");
    expect(claimKind.steps(pkg).map((s) => s.id)).not.toContain("frame");
    expect(claimKind.notes!(pkg)[0]).toBe("To find the missing number, work out 680 ÷ 4.");
  });
  it("reads the claim's number as what the child checks against, and a lost zero as a mistake", () => {
    const pkg = held("CLAIM_GT");
    expect(claimKind.numberMeaning(pkg, 1440)).toMatch(/^right/);
    expect(claimKind.numberMeaning(pkg, 1436)).toMatch(/printed in the claim/);
    expect(claimKind.numberMeaning(pkg, 144)).toMatch(/likely mistake: a zero/);
    expect(claimKind.numberMeaning(held("COMPARE_AREAS"), 13)).toMatch(/added the two sides/);
  });
});

describe("the claim kind: Maya's claims must be true", () => {
  const ctx = (id: string) => { const pkg = held(id); return { stance: "none" as const, claims: (x: string) => claimKind.claimProblems(pkg, x) }; };
  const ok = (id: string, x: string) => expect(checkTutorSay(x, ctx(id)), x).toMatchObject({ ok: true });
  const no = (id: string, x: string) => expect(checkTutorSay(x, ctx(id)), x).toMatchObject({ ok: false });
  it("comparisons of numbers, both directions", () => {
    for (const x of ["1440 is greater than 1436.", "1436 is less than 1440.", "1440 is not less than 1436.", "4 × 360 is more than 1436.", "1440 > 1436.", "1436 < 1440."]) ok("CLAIM_GT", x);
    for (const x of ["1440 is less than 1436.", "1436 is greater than 1440.", "1440 is not greater than 1436.", "4 × 360 is less than 1436.", "1440 < 1436.", "1436 > 1440."]) no("CLAIM_GT", x);
  });
  it("fractions and areas", () => {
    ok("COMPARE_FRACTIONS", "5/6 is greater than 3/6.");
    no("COMPARE_FRACTIONS", "5/6 is less than 3/6.");
    no("COMPARE_FRACTIONS", "3/6 > 5/6.");
    ok("COMPARE_AREAS", "7 by 6 is bigger than 5 by 6.");
    ok("COMPARE_AREAS", "42 squares is more than 30 squares.");
    no("COMPARE_AREAS", "5 by 6 is bigger than 7 by 6.");
    no("COMPARE_AREAS", "30 squares is more than 42 squares.");
  });
  it("the answer word, both ways", () => {
    for (const x of ["So the answer is yes.", "You circle yes.", "It's yes.", "The answer is not no."]) ok("CLAIM_GT", x);
    for (const x of ["So the answer is no.", "You circle no.", "It's no.", "The answer is not yes."]) no("CLAIM_GT", x);
    ok("CLAIM_GT", "Circle yes or no.");
    ok("CLAIM_GT", "Do you circle no?");
    ok("CLAIM_TF", "The answer is true.");
    no("CLAIM_TF", "The answer is false.");
  });
  it("who is right, the claim, the answer given", () => {
    ok("CLAIM_DIV", "Mia is not right.");
    no("CLAIM_DIV", "Mia is right.");
    ok("SPOT_MUL", "The answer given is not right.");
    no("SPOT_MUL", "The answer given is right.");
    ok("SPOT_RIGHT", "The answer given is right.");
    no("SPOT_RIGHT", "The answer given is wrong.");
    ok("CLAIM_GT", "The claim is true.");
    no("CLAIM_GT", "The claim is false.");
  });
  it("which is more likely", () => {
    ok("COMPARE_DIE", "Even is more likely.");
    no("COMPARE_DIE", "Less than 2 is more likely.");
    no("COMPARE_DIE", "Even is less likely.");
    ok("COMPARE_DIE", "3 outcomes is more than 1 outcome.");
  });
});

describe("the claim kind: the stance (through the text adapter)", () => {
  const wrong: Record<string, string[]> = {
    CLAIM_GT: ["I circle no.", "It's no.", "no"],
    CLAIM_DIV: ["I circle yes.", "It's yes."],
    COMPARE_FRACTIONS: ["It's false."],
  };
  for (const [id, turns] of Object.entries(wrong)) {
    it(`never says "yes" to a wrong word on ${id}`, async () => {
      for (const child of turns) {
        let now = Date.UTC(2026, 10, 15);
        const model = conversationalFake({ answer: (_b, n) => (n === 0 ? reply("Yes, that's right! Well done.", "guide") : reply("Let's check it together. Which word do you circle?", "guide")) });
        const session = createTextSession({ callId: `stance-${id}`, package: FIX[id], model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
        await session.start();
        expect(session.session.tutor).toBeDefined();
        const out = await session.child(child);
        expect(out.say.join(" "), child).not.toContain("that's right");
      }
    });
  }
  it("never says \"yes\" to a bare wrong comparison word", async () => {
    let now = Date.UTC(2026, 10, 15);
    const model = conversationalFake({ answer: () => reply("Yes, that's right! Well done.", "guide") });
    const session = createTextSession({ callId: "bare-cmp", package: FIX.COMPARE_FRACTIONS, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    expect((await session.child("false")).say.join(" ")).not.toContain("that's right");
  });
  it("refuses a false comparison in Maya's message and gives code's line", async () => {
    let now = Date.UTC(2026, 10, 15);
    const model = conversationalFake({ answer: () => reply("1440 is less than 1436, so we circle no.", "guide") });
    const session = createTextSession({ callId: "false-cmp", package: FIX.CLAIM_GT, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    const out = await session.child("I got 1440.");
    expect(out.say.join(" ")).not.toContain("less than 1436");
  });
  it("lets a true message through", async () => {
    let now = Date.UTC(2026, 10, 15);
    const say = "4 × 360 = 1440. Is 1440 greater than 1436?";
    const model = conversationalFake({ answer: () => reply(say, "guide") });
    const session = createTextSession({ callId: "true-cmp", package: FIX.CLAIM_GT, model, clock: () => (now += 500), tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    const out = await session.child("I got 1440.");
    expect(out.say).toEqual([say]);
  });
});

// The review of #1013 (Sol, head ebb20aa9c): each finding with a binding test (it failed on ebb20aa9c) and a control.
describe("review of #1013", () => {
  async function speak(id: string, child: string, say: string) {
    let now = Date.UTC(2026, 10, 15);
    const session = createTextSession({ callId: `r1013-${id}`, package: FIX[id], tutor: true, model: conversationalFake({ answer: () => reply(say, "guide") }), clock: () => (now += 500), mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer() });
    await session.start();
    expect(session.session.tutor).toBeDefined();
    return (await session.child(child)).say.join(" ");
  }
  it("P1-1: refuses a likelihood claim it cannot read (1 red, 3 blue, 5 green)", async () => {
    expect(claimKind.fits(held("MARBLES"))).toBe(true);
    const falseClaim = "Red is more likely than the other colours together.";
    expect(await speak("MARBLES", "I'm stuck.", falseClaim)).not.toContain(falseClaim);
    // Control: a comparison of numbers it reads goes through.
    expect(await speak("MARBLES", "I'm stuck.", "8 is greater than 1.")).toBe("8 is greater than 1.");
  });
  it("P1-2: reads numbers said in words", async () => {
    const falseClaim = "One thousand four hundred forty is less than 1436.";
    expect(await speak("CLAIM_GT", "I'm stuck.", falseClaim)).not.toContain(falseClaim);
    const trueClaim = "One thousand four hundred forty is greater than 1436.";
    expect(await speak("CLAIM_GT", "I'm stuck.", trueClaim)).toBe(trueClaim);
  });
  it("P1-3: refuses an answer statement it cannot read", async () => {
    for (const x of ["The answer is definitely no.", "You should circle no."]) expect(await speak("CLAIM_GT", "I'm stuck.", x)).not.toContain(x);
    // Control: the plain form of the true answer, and naming both choices.
    expect(await speak("CLAIM_GT", "I'm stuck.", "The answer is yes.")).toBe("The answer is yes.");
    expect(await speak("CLAIM_GT", "I'm stuck.", "Circle yes or no.")).toBe("Circle yes or no.");
  });
  it("P2-4: a tick answer is read on spot the error (SPOT_MUL: the answer is no)", async () => {
    expect(held("SPOT_MUL").answer.value).toEqual({ type: "choice", value: "no" });
    expect(await speak("SPOT_MUL", "I tick yes.", "Yes, that's right! Well done.")).not.toContain("that's right");
    expect(await speak("SPOT_MUL", "I tick no.", "Not quite. Try again.")).not.toContain("Not quite");
    // Control: the true facts go through.
    expect(await speak("SPOT_MUL", "I tick no.", "7 × 640 = 4480.")).toBe("7 × 640 = 4480.");
  });
  it("P2-5: the right bare rectangle label is no wrong answer", async () => {
    expect(await speak("COMPARE_AREAS", "7 by 6", "Not quite. Try again.")).not.toContain("Not quite");
    // Control: the wrong label still gets no "yes".
    expect(await speak("COMPARE_AREAS", "5 by 6", "Yes, that's right! Well done.")).not.toContain("that's right");
  });
});
