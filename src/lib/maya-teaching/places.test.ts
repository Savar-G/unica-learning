import { describe, expect, it } from "vitest";
import { packageLines } from "@/lib/maya/lines";
import { createSession, readNumbers } from "@/lib/maya";
import type { OperationPackage } from "@/lib/question-package";
import { teachingPackage } from "./index";
import { bareSum, subtractFromTenThousand } from "./samples";

const read = (text: string) => { const r = readNumbers(text); return { values: r.values.map((v) => (v.type === "number" ? v.value : v)), notAnswer: r.notAnswer, unreadable: r.unreadable }; };

describe("Maya reads the places of 5- and 6-digit numbers", () => {
  it.each([
    ["6 ten thousands", [6], [true]],
    ["Six ten thousands.", [6], [true]],
    ["two hundred thousands", [2], [true]],
    ["8 in the hundred thousands", [8], [true]],
    ["I put 9 for the ten thousands", [9], [true]],
    ["I carry 1 to the ten thousands", [1], [false]],
    ["the ten thousands column", [], []],
    ["5 plus 4 is 9 ten thousands, so 393693.", [5, 4, 9, 393693], [false, false, true, false]],
  ])("'%s': a column, never the number 10 or 100", (text, values, notAnswer) => {
    expect(read(text)).toEqual({ values, notAnswer, unreadable: false });
  });

  it("reads 5- and 6-digit numbers, in digits and in words", () => {
    expect(read("6385").values).toEqual([6385]);
    expect(read("987,746").values).toEqual([987746]);
    expect(read("six thousand three hundred eighty five").values).toEqual([6385]);
    expect(read("nine hundred eighty seven thousand seven hundred forty six").values).toEqual([987746]);
    expect(read("one hundred thousand").values).toEqual([100000]);
  });

  it("keeps the one-word places as before", () => {
    expect(read("6 tens")).toEqual({ values: [6], notAnswer: [true], unreadable: false });
    expect(read("I carry 1 to the tens")).toEqual({ values: [1], notAnswer: [false], unreadable: false });
    expect(read("66 tens").unreadable).toBe(true);
    expect(read("66 ten thousands").unreadable).toBe(true);
  });

  it("names every place in her lines, up to the hundred thousands", () => {
    const sub = teachingPackage(subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4])) as OperationPackage;
    expect(packageLines(sub).help("thousands").flatMap((o) => o.texts)).toContain("There were 0 thousands, so regroup 1 ten thousand as 10 thousands; after the 1 thousand given to the hundreds, 9 thousands are left. Subtract the thousands: 9 − 3 = 6. Write 6.");
    expect(packageLines(sub).help("ten thousands").flatMap((o) => o.texts)).toContain("There is nothing to write in the ten thousands.");
    const sum = teachingPackage(bareSum(352418, 41275)) as OperationPackage;
    expect(createSession({ callId: "six", package: sum }).contentProblem).toBeNull();
    expect(packageLines(sum).help("hundred thousands").flatMap((o) => o.texts)).toContain("Bring down the hundred thousands: write 3.");
  });
});
