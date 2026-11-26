// What the harness does not say of place.value: the count and the choice against every number of 2 to 4 digits, by the
// characters of each number, and the plain words that name narrow limits.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pick, seedFrom } from "../hash";
import { placeValue, type PlaceValueLimits } from "./place-value";

const r = (min: number, max: number) => ({ min, max });
const WIDE: PlaceValueLimits = { digits: r(2, 4), number: r(10, 9999), zeros: r(0, 3), zeroInOnes: "allowed", zeroInTens: "allowed", zeroInHundreds: "allowed" };
const ALL = Array.from({ length: 9990 }, (_, i) => String(10 + i));

/** Each number of the limits, rising, read from its characters. */
function inside(l: PlaceValueLimits): number[] {
  const word = (value: string, has: boolean) => value === "allowed" || (value === "only") === has;
  return ALL.filter((text) => {
    const at = (place: number) => text.at(-1 - place);
    return text.length >= l.digits.min && text.length <= l.digits.max && Number(text) >= l.number.min && Number(text) <= l.number.max
      && [...text].filter((c) => c === "0").length >= l.zeros.min && [...text].filter((c) => c === "0").length <= l.zeros.max
      && word(l.zeroInOnes, at(0) === "0") && word(l.zeroInTens, at(1) === "0" && text.length > 2) && word(l.zeroInHundreds, at(2) === "0" && text.length > 3);
  }).map(Number);
}

const range = (min: number, max: number) => fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([a, b]) => r(Math.min(a, b), Math.max(a, b)));
const word = fc.constantFrom("never", "allowed", "only") as fc.Arbitrary<PlaceValueLimits["zeroInOnes"]>;
const limits: fc.Arbitrary<PlaceValueLimits> = fc.record({
  digits: fc.oneof(fc.constant(r(2, 4)), range(2, 4)), number: fc.oneof(fc.constant(r(10, 9999)), range(10, 9999)), zeros: fc.oneof(fc.constant(r(0, 3)), range(0, 3)),
  zeroInOnes: word, zeroInTens: word, zeroInHundreds: word,
});

describe("place.value", () => {
  it("counts each number of the limits, and the seed alone picks its place in the rising list", () => {
    let full = 0;
    fc.assert(fc.property(limits, fc.nat(), (l, n) => {
      const numbers = inside(l);
      expect(placeValue.count(l)).toBe(numbers.length);
      if (numbers.length === 0) return;
      full++;
      const seed = seedFrom("place", n);
      expect(placeValue.generate(l, seed).question).toEqual({ number: numbers[pick(seed, numbers.length)] });
    }), { numRuns: 150, seed: 237 });
    expect(full).toBeGreaterThan(40);
    expect(placeValue.count(WIDE)).toBe(9990);
  });

  it.each<[string, PlaceValueLimits, string]>([
    ["a zero in the tens of 2 digits", { ...WIDE, digits: r(2, 2), zeroInTens: "only" }, "a wider digits or zeroInTens has some"],
    ["a zero in the hundreds of 3 digits", { ...WIDE, digits: r(2, 3), zeroInHundreds: "only" }, "a wider digits or zeroInHundreds has some"],
    ["three zeros in a number of 3 digits", { ...WIDE, number: r(100, 999), zeros: r(3, 3) }, "a wider number or zeros has some"],
    ["no zero in a number that ends in one", { ...WIDE, zeros: r(0, 0), zeroInOnes: "only" }, "a wider zeros or zeroInOnes has some"],
    ["numbers of 4 digits and 2 digits", { ...WIDE, digits: r(4, 4), number: r(10, 99) }, "a wider digits or number has some"],
  ])("names the narrow limits when no number meets them: %s", (_name, l, named) => {
    expect(placeValue.readLimits(l)).toEqual({ ok: false, problem: `no question meets these limits (${named})` });
  });

  it("reads limits that some number meets", () => expect(placeValue.readLimits({ ...WIDE, zeroInHundreds: "only" })).toEqual({ ok: true, limits: { ...WIDE, zeroInHundreds: "only" } }));
});
