import { describe, expect, it } from "vitest";
import { applyBatch, createScene } from "@/lib/board";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedCompare, storedSum, storedBuild } from "@/lib/maya-teaching/place-value-parts-samples";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { spotPlaceValue } from "@/lib/maya-teaching/spot-error-samples";
import type { OperationPackage, Place, QuestionPackage } from "@/lib/question-package";
import { checkTutorSay } from "../tutor";
import { describeTutorKind } from "./contract";
import { placeValueKind as kind } from "./place-value";

// Packages built the way Maya's session adapter builds them, from synthetic stored questions (never a customer's book).
const teach = (stored: QuestionPackage) => teachingPackage(stored) as OperationPackage;
const digitAsk = (n0: number, place: Place, variant: "1.1" | "2.1" | "3.1" = "1.1") => teach(storedPlaceValue({ variant, n0, place }));
const valueAsk = (n0: number, place: Place, variant: "1.2" | "1.3" | "2.2" | "3.2" = "1.2") => teach(storedPlaceValue({ variant, n0, place }));

const VALUE = [valueAsk(48942, "ten thousands"), valueAsk(48942, "tens", "1.3"), valueAsk(735168, "hundred thousands", "2.2"), valueAsk(735168, "hundreds", "3.2")];
const COMPARE = [
  teach(storedCompare({ step: 1, n0: 16466, place: "thousands", second: "hundreds" })),
  teach(storedCompare({ step: 2, n0: 274869, place: "ten thousands", second: "tens" })),
  teach(storedCompare({ step: 1, n0: 35538, place: "thousands", second: "hundreds" })),
];
const SUM = [teach(storedSum({ step: 1, n0: 99467, place: "thousands", second: "tens" })), teach(storedSum({ step: 2, n0: 985939, place: "ten thousands", second: "hundreds" }))];
const DIGIT = [digitAsk(34924, "thousands"), digitAsk(91639, "ones"), digitAsk(893969, "hundred thousands", "2.1"), digitAsk(735168, "tens", "3.1")];

describeTutorKind(kind, [...DIGIT, ...VALUE, ...COMPARE, ...SUM]);

describe("place-value kind: what it fits", () => {
  it("keeps a spot the error, a tenths build and a 7-digit number for the controller", () => {
    expect(kind.fits(teach(spotPlaceValue("1.2", 48942, "ten thousands", 4000)))).toBe(false);
    expect(kind.fits(teach(spotPlaceValue("2.1", 893969, "hundred thousands", 9)))).toBe(false);
    expect(kind.fits(teach(storedBuild({ wholes: 6, tenths: 4 })))).toBe(false);
    const big = valueAsk(4894213, "millions" as Place, "2.2");
    expect(kind.fits(big)).toBe(false);
  });
  it("refuses a package whose steps or answer code does not compute", () => {
    const pkg = valueAsk(48942, "ten thousands");
    expect(kind.fits({ ...pkg, answer: { ...pkg.answer, value: { type: "number", value: 4000 } } })).toBe(false);
    expect(kind.fits({ ...pkg, steps: pkg.steps.map((s) => (s.kind === "read-digit" ? { ...s, digit: 8 } : s)) })).toBe(false);
  });
});

describe("place-value kind: numberMeaning", () => {
  it("names the real mistakes of a digit ask", () => {
    const pkg = digitAsk(34924, "thousands");
    expect(kind.numberMeaning(pkg, 4)).toMatch(/right answer/);
    expect(kind.numberMeaning(pkg, 2)).toMatch(/likely mistake: counted the places from the left/);
    expect(kind.numberMeaning(pkg, 3)).toMatch(/likely mistake: read the digit of the next place over \(the ten thousands\)/);
    expect(kind.numberMeaning(pkg, 9)).toMatch(/likely mistake: read the digit of the next place over \(the hundreds\)/);
    expect(kind.numberMeaning(pkg, 4000)).toMatch(/likely mistake: gave the digit's value/);
    expect(kind.numberMeaning(pkg, 34924)).toBe("the question's number");
    expect(kind.numberMeaning(pkg, 7)).toBe("not a value of this question");
  });
  it("names the real mistakes of a value ask, and never calls the digit a mistake", () => {
    const pkg = valueAsk(48942, "ten thousands");
    expect(kind.numberMeaning(pkg, 40000)).toMatch(/right answer/);
    expect(kind.numberMeaning(pkg, 4)).toMatch(/^right for the ten thousands digit.*not the answer: its value is 40,000/);
    expect(kind.numberMeaning(pkg, 4)).not.toMatch(/likely mistake/);
    expect(kind.numberMeaning(pkg, 400000)).toMatch(/likely mistake: a value with one zero too many/);
    expect(kind.numberMeaning(pkg, 4000)).toMatch(/likely mistake: a value with one zero too few/);
    expect(kind.numberMeaning(pkg, 80000)).toMatch(/likely mistake: read the digit of the next place over \(the thousands\)/);
    expect(kind.numberMeaning(pkg, 20000)).toMatch(/likely mistake: counted the places from the left/);
    expect(kind.numberMeaning(pkg, 10000)).toMatch(/likely mistake: the worth of one ten thousand/);
  });
  it("names the real mistakes of a sum, and reads each value as right for its step", () => {
    const pkg = SUM[0];
    expect(kind.numberMeaning(pkg, 9060)).toMatch(/right answer/);
    expect(kind.numberMeaning(pkg, 9000)).toMatch(/^right for the value of the thousands digit/);
    expect(kind.numberMeaning(pkg, 60)).toMatch(/^right for the value of the tens digit/);
    expect(kind.numberMeaning(pkg, 15)).toMatch(/likely mistake: added the two digits/);
    expect(kind.numberMeaning(pkg, 96)).toMatch(/likely mistake: wrote the two digits side by side/);
    expect(kind.numberMeaning(pkg, 960)).toMatch(/likely mistake/);
  });
  it("reads each digit of a compare as right for its step", () => {
    const pkg = COMPARE[0];
    expect(kind.numberMeaning(pkg, 6)).toMatch(/right for the thousands digit/);
    expect(kind.numberMeaning(pkg, 4)).toMatch(/right for the hundreds digit/);
    expect(kind.numberMeaning(pkg, 1)).toMatch(/likely mistake: read the digit of the next place over/);
  });
});

describe("place-value kind: Maya's place claims", () => {
  const pkg = valueAsk(48942, "ten thousands");
  const ok = (s: string) => expect(kind.claimProblems(pkg, s), s).toEqual([]);
  const no = (s: string) => expect(kind.claimProblems(pkg, s).length, s).toBeGreaterThan(0);
  it("passes true claims about the question's number", () => {
    for (const s of [
      "The 4 is in the ten thousands place.", "The digit in the ten thousands place is 4.", "The ten-thousands digit is 4.",
      "The 9 is in the hundreds place.", "The thousands place holds an 8.", "The 8 is worth 8,000.", "The 8 is worth eight thousand.",
      "The 8 is worth 8 thousand.", "The 4 in the ten thousands place is worth 40,000.", "The 4 is worth 4 ten thousands, which is 40,000.",
      "The value of the 4 in the ten thousands place is 40,000.", "The value of the digit in the ten thousands place is 40,000.",
      "48,942 has 4 ten thousands.", "48,942 has 4 ten thousands, 8 thousands and 9 hundreds.", "There are 4 ten thousands in 48,942.",
      "48,942 has 5 digits.", "4 ten thousands is 40,000.", "1 ten thousand is 10 thousands.", "The thousands place is worth 1,000.",
      "The ten thousands place is the fifth place from the right.", "The thousands digit is bigger than the ten thousands digit.",
      "8 is bigger than 4.", "8 > 4.", "Count the places from the right: ones, tens, hundreds, thousands, ten thousands.",
      "Which digit is in the ten thousands place of 48,942?", "In 847, the 8 is in the hundreds place.", "Six and four are digits.",
      // Maya's own sentences from a real-model run (2026-11-15).
      "But its value is how much it is worth: it sits in the ten thousands place, so it is 4 ten thousands, not 4 ones.",
      "It is 4 ten thousands.", "Not 4,000, but you're close: 4,000 is the thousands place, and we need one place further left.",
      "The 4 is worth 4 times 10,000.", "The digit 4 sits in the ten thousands place, so it is worth 4 ten thousands.",
      "The 4 in 48,942 is worth 40,000.", "So that is 40,000.",
      "Not quite, 2 is not in the ten thousands place.", "Not quite, and I see why: 2 is the digit in the ones place.",
      "Yes, 4 is the right digit for the ten thousands place!", "The digit in the thousands place is not 4.", "The 8 is not worth 800.",
    ]) ok(s);
  });
  it("refuses false claims", () => {
    for (const s of [
      "The 8 is in the ten thousands place.", "The digit in the ten thousands place is 8.", "The ten thousands digit is 2.",
      "The thousands place holds a 9.", "The 8 is worth 800.", "The 4 in the ten thousands place is worth 4,000.",
      "The value of the digit in the ten thousands place is 4.", "The value of the ten thousands digit is 400,000.",
      "48,942 has 8 ten thousands.", "48,942 has 6 digits.", "4 ten thousands is 4,000.", "The ten thousands place is the first place from the right.",
      "The ten thousands digit is bigger than the thousands digit.", "4 is bigger than 8.", "4 > 8.", "48,942 has a hundred thousands digit of 4.",
      "In 847, the 8 is in the tens place.", "The 7 is in the thousands place.", "It is 4 thousands.", "The 4 is worth 4 times 1,000.",
      "4,500 is the thousands place.", "The 4 in 48,942 is worth 400.", "4 is not in the ten thousands place.",
      "2 is the digit in the tens place.", "The digit in the thousands place is not 8.", "The 8 is not worth 8,000.",
    ]) no(s);
  });
  it("fails closed on a place claim it cannot read", () => {
    no("The 4 tells us 40,000 here in the ten thousands.");
    no("The 4 sits there, and that makes the ten thousands 40,000.");
  });
  it("is the check Maya's whole message gets", () => {
    const ctx = { stance: "none" as const, claims: (x: string) => kind.claimProblems(pkg, x) };
    expect(checkTutorSay("Good thinking. The 8 is worth 800. What is the value of the 4?", ctx)).toMatchObject({ ok: false, reason: "false_equation" });
    expect(checkTutorSay("Good thinking. The 8 is worth 8,000. What is the value of the 4?", ctx)).toMatchObject({ ok: true });
  });
});

describe("place-value kind: the board", () => {
  it("draws the chart first, then the checked value and answer, never twice", () => {
    const pkg = valueAsk(48942, "ten thousands");
    const { commands, keys } = kind.draw(pkg, [{ offer: "answer" }], [], () => "n");
    expect(commands.map((c) => c.op)).toEqual(["place_chart", "put", "put"]);
    expect(commands.at(-2)).toMatchObject({ target: { rowId: "value", column: "ten_thousands" }, value: "40000" });
    expect(commands.at(-1)).toMatchObject({ target: { rowId: "answer" }, value: "40000" });
    let scene = createScene();
    const r = applyBatch(scene, { transactionId: "t", commands: commands as never });
    expect(r.ok).toBe(true);
    if (r.ok) scene = r.scene;
    expect(kind.draw(pkg, [{ offer: "answer" }, { offer: "value", place: "ten_thousands" }, { offer: "chart" }], keys, () => "n").commands).toEqual([]);
  });
  it("writes a digit of a blank chart only for the asked place, and colors any place of the number", () => {
    const pkg = digitAsk(34924, "thousands");
    const { commands } = kind.draw(pkg, [{ offer: "band", place: "Ones" }, { offer: "digit", place: "tens" }], [], () => "n");
    expect(commands[0]).toMatchObject({ op: "place_chart", blank: true });
    expect(commands[1]).toMatchObject({ op: "mark", target: { piece: "band-ones" } });
    expect(commands[2]).toMatchObject({ op: "put", target: { column: "thousands", rowId: "digits" }, value: "4" });
    expect(applyBatch(createScene(), { transactionId: "t", commands: commands as never }).ok).toBe(true);
  });
  it("never offers a word on the board, and writes a value's note as the digit times its place", () => {
    expect(kind.drawings(COMPARE[0]).map((d) => d.id)).not.toContain("answer");
    expect(kind.draw(COMPARE[0], [{ offer: "answer" }], [], () => "n").commands).toEqual([]);
    expect(kind.draw(VALUE[0], [{ offer: "note", place: "4 × 10,000 = 40,000" }], ["chart"], () => "n").commands).toEqual([{ op: "write", id: "n", text: "4 × 10000 = 40000", place: { below: "question" } }]);
    // A hundred thousands value does not fit the note's equation form, so no note is offered.
    expect(kind.drawings(VALUE[2]).map((d) => d.id)).not.toContain("note");
  });
  it("writes a sum's note only from a true equation", () => {
    const pkg = SUM[0];
    expect(kind.draw(pkg, [{ offer: "note", place: "9,000 + 60 = 9,060" }], ["chart"], () => "n").commands).toEqual([{ op: "write", id: "n", text: "9000 + 60 = 9060", place: { below: "question" } }]);
    expect(kind.draw(pkg, [{ offer: "note", place: "9000 + 60 = 960" }], ["chart"], () => "n").commands).toEqual([]);
  });
});

// #1017 (the Sol review of #1011): false claims the reader let through. Each item has the false sentences it must refuse
// and true controls it must keep, all through Maya's whole-message check.
describe("place-value kind: #1017 false claims", () => {
  const value = valueAsk(48942, "ten thousands");
  const compareQ = COMPARE[0]; // 16466: thousands 6, hundreds 4, answer true
  const verdict = (pkg: OperationPackage, s: string) => checkTutorSay(s, { stance: "none", claims: (x: string) => kind.claimProblems(pkg, x), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) }).ok;
  const refuses = (pkg: OperationPackage, list: string[]) => { for (const s of list) expect(verdict(pkg, s), s).toBe(false); };
  const keeps = (pkg: OperationPackage, list: string[]) => { for (const s of list) expect(verdict(pkg, s), s).toBe(true); };

  it("1. a value is never accepted as a digit", () => {
    refuses(value, ["The digit in the ten thousands place is 40000.", "The ten thousands digit is 40000.", "The ten thousands place is 40000.", "The digit is 40000."]);
    keeps(value, ["The digit in the ten thousands place is 4.", "The ten thousands digit is 4.", "The value of the digit in the ten thousands place is 40000.", "The ten thousands digit is worth 40000.", "The thousands place is worth 1000."]);
  });
  it("2. each claim is checked against its own number, and a sentence with two numbers is refused", () => {
    refuses(value, ["In 847, the 8 is in the hundreds place, and in 48942, the 8 is in the hundreds place.", "In 48942, the 8 is in the thousands place, and in 847, the 8 is in the thousands place."]);
    keeps(value, ["In 847, the 8 is in the hundreds place.", "In 48942, the 8 is in the thousands place, so 48942 has 8 thousands.", "The 4 has a value of 40000."]);
  });
  it("3. a value is read whole: an unread rest after it is refused", () => {
    refuses(value, ["The 8 is worth 8000 plus 1.", "The 4 is worth 40000.5.", "The 8 is worth 8000 tens.", "The 8 is worth 8000 + 1."]);
    keeps(value, ["The 8 is worth 8000.", "The 8 is worth 8,000, and the 4 is worth 40,000.", "The 4 is worth 40000; 40000 + 8000 = 48000."]);
  });
  it("4. negated and value comparisons, answer words and other family claims are read, or refused", () => {
    refuses(compareQ, [
      "The thousands digit is not bigger than the hundreds digit.", "The statement is false.", "It is false.",
      "The value of the thousands digit is smaller than the value of the hundreds digit.", "6 is not bigger than 4.",
      "The thousands digit is the same as the hundreds digit.",
    ]);
    keeps(compareQ, [
      "The thousands digit is bigger than the hundreds digit.", "The hundreds digit is not bigger than the thousands digit.", "The statement is true.",
      "So the statement is not false.", "The value of the thousands digit is bigger than the value of the hundreds digit.", "6 is not smaller than 4.",
    ]);
    refuses(value, ["The 8 represents 800.", "The 4 is worth 40000, and the 8 represents 800.", "The statement is true.", "The 8 counts for 800.", "The 8 is worth 800 for 48942."]);
    keeps(value, ["The 8 represents 8000.", "The 4 is worth 40000, and the 8 represents 8000."]);
  });
});
