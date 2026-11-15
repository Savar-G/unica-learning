import { describe, expect, it } from "vitest";
import { applyBatch, createScene, type Batch } from "@/lib/board";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorDrawings } from "../tutor";
import { columnKind } from "./column";
import { describeTutorKind } from "./contract";

/** A column question built from the worked-steps code, as a workbook stores it. */
function pkg(kind: "add" | "subtract" | "decimal-add" | "decimal-subtract", a: number, b: number, text?: string): OperationPackage {
  const operation = { kind, operands: [a, b] as [number, number] };
  const add = kind === "add" || kind === "decimal-add";
  const value = add ? a + b : a - b;
  return {
    id: `${kind}-${a}-${b}`,
    // Maya's session adapter marks the packages it makes: whole numbers to 999,999 (maya-teaching/limits.ts).
    operationSource: "maya-teaching",
    ref: { source: "workbook", workbookId: "test", page: 1, question: 1 },
    templateId: null,
    text: text ?? `${a} ${add ? "+" : "−"} ${b} = ?`,
    answer: { value: { type: "number", value }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "4.4", skills: [] },
    level: 12,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: value + 10 }, cause: add ? "O3" : "O1", description: add ? "Forgets to carry" : "Takes the smaller digit from the larger", step: null }],
    easierExample: add
      ? { text: "4 + 3 = ?", operation: { kind: "add", operands: [4, 3] }, answer: { type: "number", value: 7 }, steps: workedSteps({ kind: "add", operands: [4, 3] }) }
      : { text: "7 − 3 = ?", operation: { kind: "subtract", operands: [7, 3] }, answer: { type: "number", value: 4 }, steps: workedSteps({ kind: "subtract", operands: [7, 3] }) },
  } as OperationPackage;
}

const ADD_30_70 = pkg("add", 30, 70);
const ADD_78_56 = pkg("add", 78, 56);
const ADD_7_7 = pkg("add", 7, 7);
const ADD_18000 = pkg("add", 18000, 2000);
const ADD_4567 = pkg("add", 4567, 3658);
const ADD_STORY = pkg("add", 17000, 3000, "Zara collected 17000 tickets and a friend collected 3000. How many tickets did they collect?");
const SUB_110_50 = pkg("subtract", 110, 50);
const SUB_90_40 = pkg("subtract", 90, 40);
const SUB_ZEROS = pkg("subtract", 10000, 2001);
const SUB_4005 = pkg("subtract", 6005, 1238);
const ADD_SIX = pkg("add", 456789, 123456);
const SUB_SIX = pkg("subtract", 100000, 1);
const SUB_STORY = pkg("subtract", 10000, 2001, "Mia has 10,000 tickets and gives 2001 away. How many tickets are left?");

describeTutorKind(columnKind, [
  SAMPLE_PACKAGES["subtract-52-28"], SAMPLE_PACKAGES["add-27-39"],
  ADD_30_70, ADD_78_56, ADD_7_7, ADD_18000, ADD_4567, ADD_STORY,
  SUB_110_50, SUB_90_40, SUB_ZEROS, SUB_4005, SUB_STORY, ADD_SIX, SUB_SIX,
  pkg("add", 4700, 12), pkg("subtract", 223, 129), pkg("subtract", 1002, 4),
] as OperationPackage[]);

describe("column kind: which questions it reads", () => {
  it("fits whole-number column work of every size the board draws", () => {
    for (const p of [ADD_7_7, ADD_30_70, ADD_18000, SUB_ZEROS, SUB_STORY, pkg("add", 999999, 0)]) expect(columnKind.fits(p), p.text).toBe(true);
  });
  it("leaves decimals, a question that hides its numbers and other work to the controller", () => {
    expect(columnKind.fits(pkg("decimal-add", 2.5, 1.75))).toBe(false);
    expect(columnKind.fits(pkg("decimal-subtract", 5.2, 1.75))).toBe(false);
    expect(columnKind.fits(pkg("add", 4, 0, "How many lines of symmetry do a square and a scalene triangle have in all?"))).toBe(false);
    expect(columnKind.fits(pkg("add", 999999, 1))).toBe(false);
    const framed = { ...SUB_ZEROS, steps: [{ id: "frame", kind: "missing-frame" }, ...SUB_ZEROS.steps] } as unknown as OperationPackage;
    expect(columnKind.fits(framed)).toBe(false);
  });
});

describe("column kind: the steps", () => {
  it("explains each ten traded in a borrow across zeros", () => {
    const [ones, tens, hundreds, thousands, tenThousands] = columnKind.steps(SUB_ZEROS);
    expect(ones.work).toContain("0 ones is too small to take 1, and the tens, the hundreds and the thousands have 0 to give");
    expect(ones.work).toContain("trade 1 ten thousand for 10 thousands, then 1 thousand for 10 hundreds, then 1 hundred for 10 tens and then 1 ten for 10 ones");
    expect(ones.work).toContain("so 0 ones become 10; 10 − 1 = 9; write 9 in the ones");
    expect(tens.work).toContain("the tens got 10 tens from the trade and gave 1 ten to the ones, so the tens now have 9");
    expect(hundreds.work).toContain("9 − 0 = 9");
    expect(thousands.work).toContain("9 − 2 = 7; write 7 in the thousands");
    expect(tenThousands).toMatchObject({ id: "ten thousands", result: "nothing to write" });
    expect(tenThousands.work).toContain("1 ten thousand was traded away, so 1 ten thousand is now 0");
  });
  it("trades across five zeros, from the hundred thousands", () => {
    const [ones] = columnKind.steps(SUB_SIX);
    expect(ones.work).toBe("0 ones is too small to take 1, and the tens to the ten thousands have 0 to give: trade 1 hundred thousand for 10 ten thousands, then 1 of each 0 place for 10 of the place on its right; so 0 ones become 10; 10 − 1 = 9; write 9 in the ones");
    expect(columnKind.draw(SUB_SIX, [{ offer: "trade" }], [], () => "x").commands.map((c) => c.from)).toEqual(["hundred_thousands", "ten_thousands", "thousands", "hundreds", "tens"]);
  });
  it("trades into the tens from the hundreds", () => {
    const [, tens, hundreds] = columnKind.steps(SUB_110_50);
    expect(tens.work).toContain("1 ten is too small to take 5: trade 1 hundred for 10 tens, so the tens now have 11; 11 − 5 = 6");
    expect(hundreds.work).toContain("1 hundred was traded away, so 1 hundred is now 0");
  });
  it("carries into a new place", () => {
    const [ones, tens, hundreds] = columnKind.steps(ADD_78_56);
    expect(ones.work).toBe("8 + 6 = 14; trade 10 ones for 1 ten: write 4 and carry 1 to the tens");
    expect(tens.work).toContain("1 + 7 + 5 = 13; trade 10 tens for 1 hundred: write 3 and carry 1 to the hundreds");
    expect(hundreds).toMatchObject({ result: 1, work: "only the carried 1 is in the hundreds; write 1 in the hundreds" });
    expect(columnKind.steps(ADD_18000)[3].work).toContain("8 + 2 = 10; trade 10 thousands for 1 ten thousand: write 0 and carry 1 to the ten thousands");
  });
  it("asks the next open step, and skips a place with nothing to write", () => {
    expect(columnKind.stepQuestion(SUB_ZEROS, [])).toBe("What do you get for 10 minus 1?");
    expect(columnKind.stepQuestion(SUB_ZEROS, ["ones", "tens", "hundreds", "thousands"])).toBe("So what is 10000 minus 2001?");
    expect(columnKind.stepQuestion(ADD_78_56, ["ones", "tens"])).toBe("What do we write in the hundreds?");
  });
});

describe("column kind: what the child's number means", () => {
  it("names the smaller-from-larger mistake", () => {
    expect(columnKind.numberMeaning(SUB_ZEROS, 12001)).toContain("smaller digit taken from the bigger one in each column");
    expect(columnKind.numberMeaning(SUB_4005, 5233)).toContain("smaller digit taken from the bigger one in each column");
    expect(columnKind.numberMeaning(SUB_4005, 3)).toContain("the small digit taken from the big one in the ones (8 − 5)");
  });
  it("names a trade not taken from the next place", () => {
    expect(columnKind.numberMeaning(SUB_ZEROS, 18009)).toContain("did not take 1 away from the next place");
    expect(columnKind.numberMeaning(SUB_110_50, 160)).toContain("did not take 1 away from the next place");
  });
  it("names a forgotten carry and a whole total written", () => {
    expect(columnKind.numberMeaning(ADD_4567, 7115)).toContain("forgot a carried 1");
    expect(columnKind.numberMeaning(ADD_4567, 7111115)).toContain("wrote a column's whole total instead of carrying");
    expect(columnKind.numberMeaning(ADD_78_56, 124)).toContain("forgot the carried 1 in the tens");
    expect(columnKind.numberMeaning(ADD_78_56, 1214)).toContain("wrote a column's whole total");
    expect(columnKind.numberMeaning(ADD_78_56, 2)).toContain("the tens without the carried 1");
  });
  it("reads the answer, a step and the trade's values as right", () => {
    expect(columnKind.numberMeaning(SUB_ZEROS, 7999)).toBe("the right answer to the whole question");
    expect(columnKind.numberMeaning(SUB_ZEROS, 7)).toContain("right for the thousands digit (9 − 2 = 7)");
    expect(columnKind.numberMeaning(SUB_ZEROS, 10)).toContain("the ones after the trade");
    expect(columnKind.numberMeaning(SUB_ZEROS, 2001)).toBe("a number of the question");
    expect(columnKind.numberMeaning(SUB_ZEROS, 5555)).toBe("not a value of this question");
  });
});

describe("column kind: the board", () => {
  async function board(p: OperationPackage) {
    const { createTextSession } = await import("@/lib/maya-text");
    const { conversationalFake } = await import("@/lib/maya-model-fake");
    let now = Date.UTC(2026, 10, 15);
    const session = createTextSession({ callId: "column-board", package: p, model: conversationalFake({ answer: () => { throw new Error("no model"); } }), clock: () => (now += 100), tutor: true });
    let scene = createScene();
    for (const b of (await session.start()).board as Batch[]) {
      const r = applyBatch(scene, b);
      if (r.ok) scene = r.scene;
    }
    return scene;
  }
  it("draws a borrow across zeros from the far end, and the board takes it", async () => {
    const d = columnKind.draw(SUB_ZEROS, [{ offer: "trade" }], [], (i) => `n-${i}`);
    expect(d.commands.map((c) => [c.from, c.to])).toEqual([["ten_thousands", "thousands"], ["thousands", "hundreds"], ["hundreds", "tens"], ["tens", "ones"]]);
    expect(d.keys).toEqual(["trade:thousands", "trade:hundreds", "trade:tens", "trade:ones"]);
    // Every trade is done: a second request draws nothing.
    expect(columnKind.draw(SUB_ZEROS, [{ offer: "trade" }], d.keys, () => "x").commands).toEqual([]);
    const r = applyBatch(await board(SUB_ZEROS), { transactionId: "t", commands: d.commands as never });
    expect(r.ok, r.ok ? "" : JSON.stringify(r.refusal)).toBe(true);
  });
  it("offers a trade only when the question has one, and the core passes every command", () => {
    expect(columnKind.drawings(SUB_90_40).map((d) => d.id)).toEqual(["digit", "note"]);
    expect(columnKind.drawings(SUB_ZEROS).map((d) => d.id)).toEqual(["trade", "digit", "note"]);
    const all = columnKind.draw(SUB_SIX, [{ offer: "digit", place: "ten thousands" }], [], () => "x");
    expect(tutorDrawings(SUB_SIX, [{ offer: "digit", place: "ten thousands" }], [], () => "x").commands).toEqual(all.commands);
  });
  it("writes every digit of the answer in order and never a 0 on its left", async () => {
    const d = columnKind.draw(SUB_ZEROS, [{ offer: "digit", place: "thousands" }], [], () => "x");
    expect(d.commands.filter((c) => c.op === "put").map((c) => c.value)).toEqual(["9", "9", "9", "7"]);
    expect(columnKind.draw(SUB_ZEROS, [{ offer: "digit", place: "ten thousands" }], d.keys, () => "x").commands).toEqual([]);
    const r = applyBatch(await board(SUB_ZEROS), { transactionId: "t", commands: d.commands as never });
    expect(r.ok, r.ok ? "" : JSON.stringify(r.refusal)).toBe(true);
  });
  it("writes the carries and the new place of an addition", async () => {
    const d = columnKind.draw(ADD_78_56, [{ offer: "digit", place: "hundreds" }], [], () => "x");
    expect(d.commands.map((c) => c.op)).toEqual(["put", "regroup", "put", "regroup", "put"]);
    expect(d.commands.at(-1)).toMatchObject({ value: "1", target: { column: "hundreds" } });
    const r = applyBatch(await board(ADD_78_56), { transactionId: "t", commands: d.commands as never });
    expect(r.ok, r.ok ? "" : JSON.stringify(r.refusal)).toBe(true);
  });
});

describe("column kind: its own claims in the thousands", () => {
  const ctx = (p: OperationPackage) => ({ stance: "none" as const, op: columnKind.op!(p)!, claims: (x: string) => columnKind.claimProblems(p, x) });
  it("refuses a false place claim the core does not read", () => {
    expect(columnKind.claimProblems(SUB_ZEROS, "1 thousand is 100 hundreds.")).not.toEqual([]);
    expect(columnKind.claimProblems(SUB_ZEROS, "1 ten thousand is 100 thousands.")).not.toEqual([]);
    expect(columnKind.claimProblems(SUB_ZEROS, "The 0 thousands are now 5 thousands.")).not.toEqual([]);
    expect(checkTutorSay("1 thousand is 100 hundreds.", ctx(SUB_ZEROS))).toMatchObject({ ok: false, reason: "false_equation" });
  });
  it("lets a true one through", () => {
    for (const s of ["1 thousand is 10 hundreds.", "1 ten thousand is 10 thousands.", "The 0 thousands become 10 thousands.", "10 thousands is the same as 1 ten thousand.", "There are 0 thousands to give."]) {
      expect(columnKind.claimProblems(SUB_ZEROS, s), s).toEqual([]);
    }
    expect(columnKind.claimProblems(SUB_ZEROS, "Now the 10 thousands are 9 thousands.")).not.toEqual([]);
    expect(columnKind.claimProblems(SUB_ZEROS, "The 10 thousands are now 9 thousands.")).toEqual([]);
    expect(columnKind.claimProblems(ADD_18000, "10 thousands become 0 thousands after the carry.")).toEqual([]);
    expect(columnKind.claimProblems(ADD_18000, "The 1 ten thousand is now 2 ten thousands.")).toEqual([]);
    expect(columnKind.claimProblems(ADD_18000, "The 1 ten thousand is now 5 ten thousands.")).not.toEqual([]);
    expect(columnKind.claimProblems(SUB_SIX, "1 hundred thousand is 10 ten thousands.")).toEqual([]);
    expect(columnKind.claimProblems(SUB_SIX, "1 hundred thousand is 100 ten thousands.")).not.toEqual([]);
    expect(columnKind.claimProblems(SUB_SIX, "Now the ten thousands are 9.")).toEqual([]);
  });
});

// The Sol review of #1012 (issue #1019): one binding test per finding, each with a true or right control.
describe("column kind: review of #1012 (#1019)", () => {
  const ADD_4700_12 = pkg("add", 4700, 12);
  const SUB_223_129 = pkg("subtract", 223, 129);
  const SUB_1002_4 = pkg("subtract", 1002, 4);

  it("1: a lone printed digit is not a carry", () => {
    const hundreds = columnKind.steps(ADD_4700_12).find((st) => st.id === "hundreds")!;
    expect(hundreds.work).toBe("only the 7 is in the hundreds, with nothing to add to it; write 7 in the hundreds");
    expect(hundreds.work).not.toContain("carried");
    expect(columnKind.notes!(ADD_4700_12).join(" ")).not.toContain("carry");
    // Control: a column with only the carried 1 still says so.
    expect(columnKind.steps(ADD_78_56).find((st) => st.id === "hundreds")!.work).toBe("only the carried 1 is in the hundreds; write 1 in the hundreds");
    expect(columnKind.notes!(ADD_78_56).join(" ")).toContain("The last carry makes a new place");
  });

  it("2: the top after the trades counts the 1 already given", () => {
    expect(columnKind.numberMeaning(SUB_223_129, 11)).toContain("the tens after the trade (2 + 10 − 1)");
    expect(columnKind.numberMeaning(SUB_223_129, 11)).not.toContain("(2 + 10)");
    // Control: a place that only takes 10 keeps its expression.
    expect(columnKind.numberMeaning(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage, 12)).toContain("the ones after the trade (2 + 10)");
  });

  it("3: a trade of unequal quantities is refused", () => {
    const say = "Trade 1 thousand for 100 hundreds. What do you get for 10 minus 1?";
    expect(columnKind.claimProblems(SUB_ZEROS, say)).not.toEqual([]);
    expect(checkTutorSay(say, { stance: "none", op: "subtract", claims: (s) => columnKind.claimProblems(SUB_ZEROS, s) })).toMatchObject({ ok: false, reason: "false_equation" });
    expect(columnKind.claimProblems(SUB_ZEROS, "We trade 1 ten for 100 ones.")).not.toEqual([]);
    // Control: true trades pass, in every place, and the kind's own step text still passes.
    expect(columnKind.claimProblems(SUB_ZEROS, "Trade 1 ten from the 5 tens for 100 ones.")).not.toEqual([]);
    for (const s of ["Trade 1 thousand for 10 hundreds. What do you get for 10 minus 1?", "So we borrow: trade 1 ten from the 5 tens for 10 ones.", "We trade 1 ten for 10 ones.", "Trade 1 ten thousand for 10 thousands, then 1 thousand for 10 hundreds."]) {
      expect(columnKind.claimProblems(SUB_ZEROS, s), s).toEqual([]);
      expect(checkTutorSay(s, { stance: "none", op: "subtract", claims: (x) => columnKind.claimProblems(SUB_ZEROS, x) }), s).toMatchObject({ ok: true });
    }
  });

  it("4: a value between two trades is a value of the work", () => {
    expect(columnKind.workValues(SUB_1002_4)).toContain(10);
    expect(columnKind.numberMeaning(SUB_1002_4, 10)).toContain("the tens between the two trades (0 + 10)");
    expect(columnKind.workValues(SUB_223_129)).toContain(1);
    // Control: the right answer is still right, and a number of no step is still not a work value.
    expect(columnKind.numberMeaning(SUB_1002_4, 998)).toBe("the right answer to the whole question");
    expect(columnKind.workValues(SUB_1002_4)).not.toContain(11);
    expect(columnKind.numberMeaning(SUB_1002_4, 11)).toBe("not a value of this question");
  });
});
