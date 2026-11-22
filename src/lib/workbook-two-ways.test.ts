import { describe, expect, it } from "vitest";
import { twoWaysMethods, writtenTwoWaysProblem, type TwoWaysInput } from "./workbook-two-ways";

const q = (text: string, level = 10, templateId: string | null = null): TwoWaysInput => ({ text, level, templateId, operation: null });

describe("the two methods of a Use 2 ways question fit the question", () => {
  it("gives a spinner or probability story no pair, whatever words it shares with a product", () => {
    expect(twoWaysMethods(q("A spinner has 5 equal parts and 1 is red. It spins 30 times and gets 10 reds. How far off is the prediction of 6 reds?", 19))).toBeNull();
    expect(twoWaysMethods(q("A bag has 3 red and 5 blue counters. What is the chance of red? Each draw is at random.", 10))).toBeNull();
  });

  it("treats a missing factor as a division", () => {
    expect(twoWaysMethods(q("$17 × ? = $578"))).toEqual(["divide", "count up in groups"]);
  });

  it("leaves times-table facts to be known, not worked two ways, from U10", () => {
    for (const text of ["7 × 8 = ?", "56 ÷ 7 = ?", "7 × ? = 56", "56 = 7 × ?", "? × 7 = 56"]) expect(twoWaysMethods(q(text)), text).toBeNull();
    expect(twoWaysMethods(q("56 = 17 × ?"))).toEqual(["divide", "count up in groups"]);
    // A division story with more numbers than its two is unclear: no pair.
    expect(twoWaysMethods(q("Mia has 120 stickers and 3 albums. She shares them equally among 4 friends. How many does each get?"))).toBeNull();
    expect(twoWaysMethods(q("4,368 ÷ 6 = ?"))).toEqual(["share in groups", "use a times fact"]);
  });

  it("strips zeros only from a tens product, rounds up only near a ten, and gives other products no pair", () => {
    expect(twoWaysMethods(q("60 × 7 = ?"))).toEqual(["split a number into parts", "use a fact you know, then the zeros"]);
    expect(twoWaysMethods(q("19 × 6 = ?"))).toEqual(["split a number into parts", "round up, then take away"]);
    expect(twoWaysMethods(q("318 × 7 = ?"))).toBeNull();
  });

  it("reads the zeros method off the factors, not off every number a story prints", () => {
    expect(twoWaysMethods(q("Mia has 20 boxes. She fills 13 boxes with 14 books each. How many books does she pack?"))).toBeNull();
    expect(twoWaysMethods({ text: "Mia has 20 boxes. She packs 13 boxes of 14 books.", level: 10, templateId: null, operation: { kind: "multiply", operands: [13, 14] } })).toBeNull();
    expect(twoWaysMethods(q("Each box holds 60 pens. How many pens are in 7 boxes? 60 × 7"))?.[1]).toBe("use a fact you know, then the zeros");
  });

  it("pairs sums, differences and pattern jumps by their kind", () => {
    expect(twoWaysMethods(q("47 + 28 = ?"))?.[0]).toBe("add the tens, then the ones");
    expect(twoWaysMethods(q("74 − 38 = ?"))?.[1]).toBe("count up from the smaller number");
    expect(twoWaysMethods(q("The first two numbers in a pattern are 270 and 295. How much is added each time?", 10, "3.6-increasing-pattern#1.0"))).toEqual(
      ["subtract the first number from the second", "count on from the first number to the second"]);
    expect(twoWaysMethods(q("4 + 15 = ?"))).toBeNull();
  });

  it("keeps U4 to U9's methods as tuned", () => {
    expect(twoWaysMethods(q("There are 13 birds. 9 fly away. How many are left?", 6))).toEqual(["count back", "count up from the smaller number"]);
  });

  it("changes nothing at the other levels: U16 keeps the methods it printed before", () => {
    expect(twoWaysMethods(q("A spinner spins it 30 times and gets 10 reds.", 16))).toEqual(["split a number into parts", "use a fact you know, then the zeros"]);
    expect(writtenTwoWaysProblem(16, "solve-it-two-ways", q("A spinner spins 30 times.", 16))).toBeNull();
  });

  it("refuses a written Use 2 ways question with no pair, with the reason", () => {
    expect(writtenTwoWaysProblem(19, "solve-it-two-ways", q("A spinner spins 30 times.", 19))).toMatch(/probability/);
    expect(writtenTwoWaysProblem(19, "solve-it-two-ways", q("47 + 28 = ?", 19))).toBeNull();
    expect(writtenTwoWaysProblem(19, "word-problems", q("A spinner spins 30 times.", 19))).toBeNull();
  });
});
