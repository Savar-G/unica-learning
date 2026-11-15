import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { createSession } from "@/lib/maya/session";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { tutorKindOf } from "./index";

// Pre-launch check 2 of the tutor core (part 2, true math), the fit findings. On main d6e32a97e each printed question
// below fitted a kind whose stored operation computes another quantity, so Maya taught a wrong answer with no math
// review. A kind now fits a word problem only when its final question asks for exactly what the stored operation
// computes, in the kind's closed question forms, and a printed relation is the stored one. Any other keeps the controller.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;

/** A synthetic package with the operation's own worked steps and answer. */
function make(text: string, operation: Operation): OperationPackage {
  const easier: Operation = operation.kind === "multiply" ? { kind: "multiply", operands: [2, 2] } : { kind: "evaluate", operands: ["2 × 3 − 1"] };
  return {
    ...SUB, id: "synthetic", text, operation, answer: { ...SUB.answer, value: operationResult(operation) }, steps: workedSteps(operation),
    easierExample: { text: operation.kind === "multiply" ? "2 × 2 = ?" : "What is 2 × 3 − 1?", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
    wrongAnswers: [{ value: { type: "number", value: 99999 }, cause: "careless", description: "A made-up error.", step: null }],
  } as OperationPackage;
}
const MUL = (text: string) => make(text, { kind: "multiply", operands: [6, 440] });
const EVAL = (text: string) => make(text, { kind: "evaluate", operands: ["5 × 350 − 870"] });
const PLACE = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;
const FRACTIONS = createSession({ callId: "fractions", package: FIXTURES.COMPARE_FRACTIONS, conversational: true, tutor: true }).package as OperationPackage;
const CLAIM_GT = createSession({ callId: "claim-gt", package: FIXTURES.CLAIM_GT, conversational: true, tutor: true }).package as OperationPackage;

/** The kind that teaches the package in a session, or null when the controller keeps it. */
function taughtBy(pkg: OperationPackage): string | null {
  const s = createSession({ callId: "fit", package: pkg, conversational: true, tutor: true });
  return s.tutor && s.package ? tutorKindOf(s.package as OperationPackage)?.id ?? null : null;
}

describe("the reviewer's cases keep the controller", () => {
  it.each([
    ["F3 column", { ...SUB, text: "Mia gave away 52 counters and has 28 left. How many counters did she have at first?" }],
    ["F4 multiply", MUL("Each of 6 boxes holds 440 counters. How many counters are in each box?")],
    ["F5 evaluate", EVAL("A shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many buttons did it sell?")],
    ["F6 place value", { ...PLACE, text: "What is double the value of the digit in the ten thousands place of 48942?" }],
    ["F7 claim", { ...FRACTIONS, text: "True or false: 5/6 is less than 3/6." }],
  ] as const)("%s", (_, pkg) => {
    expect(tutorKindOf(pkg as OperationPackage)).toBeNull();
    expect(taughtBy(pkg as OperationPackage)).toBeNull();
  });
});

describe("other questions that ask for another quantity keep the controller", () => {
  it.each([
    ["column: what was given away", { ...SUB, text: "Mia has 52 counters and gives 28 away. How many counters did she give away?" }],
    ["column: a total asked of a subtraction", { ...SUB, text: "Mia has 52 counters and gives 28 away. How many counters did she have at first?" }],
    ["column: the first number is what is left", { ...SUB, text: "Mia has 52 counters left after she gives 28 away. How many counters are left?" }],
    ["column: an addition asked at first", { ...ADD, text: "Mia has 27 counters and gets 39 more. How many counters did she have at first?" }],
    ["column: how many more, asked of the smaller", { ...SUB, text: "Mia scores 28 points. Ava scores 52 points. How many more points does Mia score?" }],
    ["multiply: the groups counted", MUL("Each of 6 boxes holds 440 counters. How many boxes in all?")],
    ["multiply: a share asked", MUL("6 boxes hold 440 counters in each. How many counters per box?")],
    ["evaluate: the groups left", EVAL("A shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many boxes are left?")],
    ["evaluate: what was there first", EVAL("A shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many buttons did it have at first?")],
    ["place value: half the value", { ...PLACE, text: "What is half the value of the digit in the ten thousands place of 48942?" }],
    ["place value: a value and something more", { ...PLACE, text: "What is the value of the digit in the ten thousands place of 48942 times 2?" }],
    ["claim: the sides swapped", { ...FRACTIONS, text: "True or false: 3/6 > 5/6." }],
    ["claim: a printed less-than on a stored greater-than", { ...CLAIM_GT, text: CLAIM_GT.text.replace("greater", "less") }],
  ] as const)("%s", (_, pkg) => {
    expect(tutorKindOf(pkg as OperationPackage)).toBeNull();
  });
});

describe("controls: true questions in the closed forms still fit", () => {
  it.each([
    ["column", { ...SUB, text: "Mia has 52 counters and gives 28 away. How many counters are left?" }, "column"],
    ["column", { ...SUB, text: "Mia scores 52 points. A friend scores 28 points. How many more points does Mia score?" }, "column"],
    ["column", { ...ADD, text: "Mia has 27 counters and gets 39 more. How many counters does she have now?" }, "column"],
    ["column", { ...ADD, text: "Mia collected 27 tickets and a friend collected 39. How many tickets is that in all?" }, "column"],
    ["multiply", MUL("Each box holds 440 counters. How many counters in 6 boxes?"), "multiply"],
    ["multiply", MUL("Each box holds 440 counters. Mia fills 6 of them. How many counters is that?"), "multiply"],
    ["evaluate", EVAL("A shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many buttons are left?"), "evaluate"],
    ["place value", { ...PLACE, text: "What is the value of the digit in the ten thousands place of 48942?" }, "place-value"],
    ["place value", { ...PLACE, text: "Zara saw the number 48942 on a sign at school. What is the value of the digit in the ten thousands place?" }, "place-value"],
    ["claim", FRACTIONS, "claim"],
    ["claim", CLAIM_GT, "claim"],
  ] as const)("%s: %s", (_, pkg, kind) => {
    expect(tutorKindOf(pkg as OperationPackage)?.id).toBe(kind);
  });
});
