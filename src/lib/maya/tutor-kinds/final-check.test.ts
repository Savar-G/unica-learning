// Final pre-launch check, part 2 (true math), the kind fit findings N05 and N06. Each case is the reviewer's own (it
// reached the child on 4b2959e1a and aa4eef2c0): a printed question that disagrees with its stored facts must keep the
// controller. Each has a true control beside it, so a fix that refuses everything fails too.
import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { judgment } from "@/lib/maya/tutor";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { createTextSession } from "@/lib/maya-text";
import type { OperationPackage } from "@/lib/question-package";
import { createSession } from "../session";
import { tutorKindOf } from "./index";

const sub = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const add = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const pv = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;

const kindOf = (pkg: OperationPackage) => tutorKindOf(pkg)?.id ?? null;
const tutors = (pkg: OperationPackage) => !!createSession({ callId: `final-${pkg.text}`, package: pkg, conversational: true, tutor: true }).tutor;

/** One turn through the text adapter: the model proposes `line` after the child's words. */
async function speak(pkg: OperationPackage, line: string) {
  let now = Date.UTC(2026, 10, 15);
  const model = conversationalFake({ answer: () => reply(line, "guide") });
  const s = createTextSession({ callId: `final-${pkg.text}-${line}`, package: pkg, model, clock: () => (now += 100), random: 3, tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer((input) => (judgment(input.line).any ? { verdict: "pass" } : { verdict: "fail", rules: ["math"], reason: "The math is false." })) });
  await s.start();
  const out = await s.child("Please help me.");
  await s.finish({ reason: "child_stopped" });
  return out.say;
}

describe("N05: the column kind fits only the stored equation, in its order, as the whole printed question", () => {
  it("refuses a printed 28 − 52 = ? stored as 52 − 28, and an added instruction after the equation", async () => {
    for (const text of ["28 − 52 = ?", "52 − 28 = ? Then add 28."]) {
      const pkg = { ...sub, text };
      expect(kindOf(pkg), text).toBeNull();
      expect(tutors(pkg), text).toBe(false);
      expect(await speak(pkg, "The answer is 24."), text).not.toEqual(["The answer is 24."]);
    }
  });

  it("refuses a story that asks a second thing, or prints the numbers of a subtraction the other way round", () => {
    expect(kindOf({ ...sub, text: "Mia has 52 tickets and gives 28 away. How many are left? Then add 28." })).toBeNull();
    expect(kindOf({ ...sub, text: "Mia gives 28 tickets away from 52. How many are left?" })).toBeNull();
    expect(kindOf({ ...sub, operation: { kind: "subtract", operands: [28, 52] }, text: "28 − 52 = ?" } as OperationPackage)).toBeNull();
  });

  it("control: the stored equation and a matching story still fit", async () => {
    for (const text of ["52 − 28 = ?", "52−28=?", "What is 52 − 28?", "Mia has 52 tickets and gives 28 away. How many tickets are left?"]) {
      expect(kindOf({ ...sub, text }), text).toBe("column");
    }
    expect(kindOf(sub)).toBe("column");
    expect(kindOf(add)).toBe("column");
    expect(kindOf({ ...add, text: "27+39=?" })).toBe("column");
    expect(await speak(sub, "Let us start with the ones.")).toEqual(["Let us start with the ones."]);
  });
});

describe("N06: the place-value kind fits only when the printed ask is the stored ask", () => {
  it("refuses a printed digit question stored as a value ask", async () => {
    const pkg = { ...pv, text: "In 48942, which digit is in the ten thousands place?" };
    expect(kindOf(pkg)).toBeNull();
    expect(tutors(pkg)).toBe(false);
    expect(await speak(pkg, "The answer is 40000.")).not.toEqual(["The answer is 40000."]);
  });

  it("refuses a printed value question stored as a digit ask, and a question that asks two things", () => {
    const digit = teachingPackage(storedPlaceValue({ variant: "1.1", n0: 48942, place: "ten thousands" })) as OperationPackage;
    expect(digit.operation).toMatchObject({ kind: "place-value", ask: "digit" });
    expect(kindOf(digit)).toBe("place-value");
    expect(kindOf({ ...digit, text: "What is the value of the digit in the ten thousands place of 48942?" })).toBeNull();
    expect(kindOf({ ...pv, text: "In 48942, which digit is in the ten thousands place, and what is its value?" })).toBeNull();
    expect(kindOf({ ...pv, text: "What is the value of the digit in the ten thousands place of 48942 rounded to the nearest ten?" })).toBeNull();
  });

  it("control: the stored value question still fits and teaches", async () => {
    expect(pv.text).toMatch(/value/);
    expect(kindOf(pv)).toBe("place-value");
    expect(kindOf({ ...pv, text: "48942: value of the ten thousands digit?" })).toBe("place-value");
    expect(await speak(pv, "Let us count the places from the right.")).toEqual(["Let us count the places from the right."]);
  });
});
