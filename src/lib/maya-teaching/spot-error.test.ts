// C2: the spot-the-error deriver, through the session adapter's public interface. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { heldReason } from "@/lib/maya";
import { checkQuestionPackage, operationResult, type QuestionPackage } from "@/lib/question-package";
import { teachingPackage } from "./index";
import { MAYA_TEACHING_LIMITS } from "./limits";
import { asSpot, spotMissing, spotMultiplyTens, spotPlaceValue } from "./spot-error-samples";
import { spotExampleShown } from "./spot-item";
import { storedPlaceValue } from "./place-value-samples";

const TEACHING_FIELDS = ["operation", "answer", "steps", "wrongAnswers", "easierExample", "stepsVersion", "operationSource"];
const made = (stored: QuestionPackage) => teachingPackage(stored) as QuestionPackage;
const without = (p: QuestionPackage) => Object.fromEntries(Object.entries(p).filter(([k]) => !TEACHING_FIELDS.includes(k)));
/** A stored spot item with one field of its item changed. */
const edit = (stored: QuestionPackage, change: (item: NonNullable<QuestionPackage["item"]>) => void): QuestionPackage => {
  const copy = structuredClone(stored);
  change(copy.item!);
  return copy;
};

const MUL = spotMultiplyTens(7, 643, 448);
const MISS = spotMissing(4, 170, 17);
const VALUE = spotPlaceValue("1.2", 46213, "ten thousands", 4000);
const DIGIT = spotPlaceValue("2.1", 571324, "hundred thousands", 7);
const RIGHT = spotPlaceValue("1.2", 48216, "thousands", 8000);

describe("the spot-the-error deriver", () => {
  it("derives the question under the worked answer from its own path, and the fix is the result", () => {
    for (const [stored, kind, fix] of [[MUL, "multiply", 4480], [MISS, "divide", 170], [VALUE, "place-value", 40000], [DIGIT, "place-value", 5], [RIGHT, "place-value", 8000]] as const) {
      const pkg = made(stored);
      expect(pkg.operation?.kind, stored.text).toBe(kind);
      expect(operationResult(pkg.operation!), stored.text).toEqual({ type: "number", value: fix });
      expect(pkg.answer?.value).toEqual({ type: "number", value: fix });
      expect(heldReason(pkg), stored.text).toBeNull();
    }
  });

  it("never changes the printed book or the stored package: only teaching fields are added", () => {
    for (const stored of [MUL, MISS, VALUE, DIGIT, RIGHT]) {
      const before = structuredClone(stored);
      const pkg = made(stored);
      expect(stored).toEqual(before);
      expect(without(pkg)).toEqual(without(stored));
      expect(pkg.item).toEqual(stored.item);
    }
  });

  it("lists the answer given as an expected wrong answer when it is wrong, and not when it is right", () => {
    expect(made(MUL).wrongAnswers.filter((w) => w.cause === "spot-shown").map((w) => w.value)).toEqual([{ type: "number", value: 448 }]);
    expect(made(RIGHT).wrongAnswers.some((w) => w.cause === "spot-shown")).toBe(false);
  });

  it("holds the question when any agreement fails", () => {
    const held = (p: QuestionPackage) => made(p).operation ?? null;
    // "Is it right?" keyed the wrong way.
    expect(held(edit(MUL, (i) => { const r = i.regions[0]; if (r.kind === "choice") r.answer = "Yes"; }))).toBeNull();
    // The fix key is not the template's answer.
    expect(held(edit(MUL, (i) => { const r = i.regions[1]; if (r.kind === "box") r.answer = { type: "number", value: 4481 }; }))).toBeNull();
    // The answer given is not digits only.
    expect(held(edit(MUL, (i) => { const c = i.checks[0]; if (c.kind === "template-shown") c.shown = "4,480"; }))).toBeNull();
    // The two checks hold different template sources.
    expect(held(edit(MUL, (i) => { const c = i.checks[1]; if (c.kind === "template") c.source = { ...c.source, answer: "a * b + 1" }; }))).toBeNull();
    // Another label, another mark, a third region.
    expect(held(edit(MUL, (i) => { i.regions[1].label = "Answer"; }))).toBeNull();
    expect(held(edit(MUL, (i) => { const r = i.regions[0]; if (r.kind === "choice") r.mark = "circle"; }))).toBeNull();
    expect(held(edit(MUL, (i) => { i.regions.push({ id: "extra", kind: "box", label: null, answer: { type: "number", value: 1 } }); }))).toBeNull();
    // A printed text no closed form reads (the pattern-rule story, C1's path): held.
    expect(held({ ...MUL, text: "The rule is add 640. Start at 7. What is the fourth number?" })).toBeNull();
  });

  it("keeps the default checks: only Maya's explicit limits accept a spot item with an operation", () => {
    const pkg = made(MUL);
    expect(checkQuestionPackage(MUL).ok).toBe(true);
    const plain = checkQuestionPackage({ ...pkg, operationSource: "generator" });
    expect(plain.ok).toBe(false);
    expect(plain.ok ? null : plain.reason).toMatch(/needs its shown error/);
    expect(checkQuestionPackage({ ...pkg, operationSource: "generator" }, undefined, { ...MAYA_TEACHING_LIMITS, templateShown: false }).ok).toBe(false);
    expect(checkQuestionPackage(pkg, undefined, MAYA_TEACHING_LIMITS).ok).toBe(true);
  });

  it("derives a place-value spot item on a two-digit page as the session opens it", () => {
    const stored = asSpot(storedPlaceValue({ variant: "2.2", n0: 785243, place: "hundred thousands", page: 26, question: 12 }), 70000);
    expect(made(stored).operation?.kind).toBe("place-value");
  });
});

describe("the easier example's answer given (lessons 11 and 12)", () => {
  it("is a dropped zero, else an added zero, else one more", () => {
    expect(spotExampleShown(3840, { value: 44800, shown: 4480 })).toBe(384);
    expect(spotExampleShown(384, { value: 4480, shown: 448 })).toBe(3840);
    expect(spotExampleShown(3, { value: 170, shown: 17 })).toBe(30);
  });

  it("is never the question's result, its answer given, a power-of-10 part of the result or its first digits", () => {
    // 448 × 10 is the result: refused; 449 is safe.
    expect(spotExampleShown(448, { value: 4480, shown: 44 })).toBe(449);
    // 80 is the answer given: 9 is the one left.
    expect(spotExampleShown(8, { value: 8000, shown: 80 })).toBe(9);
    // Every candidate refused: null, so the question is held.
    expect(spotExampleShown(4, { value: 40, shown: 5 })).toBeNull();
    for (const [ex, q] of [[384, { value: 4480, shown: 448 }], [3, { value: 170, shown: 17 }], [800, { value: 40000, shown: 4000 }]] as const) {
      const shown = spotExampleShown(ex, q)!;
      expect(shown).not.toBe(q.value);
      expect(shown).not.toBe(q.shown);
      expect([0, 1, 2, 3, 4, 5, 6].some((k) => shown * 10 ** k === q.value)).toBe(false);
      expect(String(q.value).startsWith(String(shown))).toBe(false);
    }
  });
});
