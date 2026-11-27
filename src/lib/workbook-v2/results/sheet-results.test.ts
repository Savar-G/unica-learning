import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { WORKBOOK_1_PACES } from "../assemble/level-config";
import { FIRST_TRIES, sheetResult, sheetResults, type FirstTry, type ItemMark, type ResultItem, type SheetResultKind } from "./sheet-results";

const itemsOf = (total: number) => Array.from({ length: total }, (_, i) => ({ id: `q${i + 1}` }));
/** Marks for the first questions of a sheet: `right` right ones, then `wrong` wrong ones, then `blank` blank ones. */
function marksOf(right: number, wrong: number, blank = 0): ItemMark[] {
  const tries: FirstTry[] = [...Array<FirstTry>(right).fill("right"), ...Array<FirstTry>(wrong).fill("wrong"), ...Array<FirstTry>(blank).fill("blank")];
  return tries.map((firstTry, i) => ({ itemId: `q${i + 1}`, firstTry }));
}
const resultOf = (total: number, marks: ItemMark[], masteryPercent: number) => {
  const outcome = sheetResult(itemsOf(total), marks, { masteryPercent });
  if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
  return outcome;
};

describe("the result of a sheet", () => {
  it.each<[string, number, number, [number, number, number], SheetResultKind, number]>([
    // name, total, mastery, [right, wrong, blank], result, maxMistakes
    ["all right at 90%", 16, 90, [16, 0, 0], "mastered", 1],
    ["one mistake of 16 at 90%", 16, 90, [15, 1, 0], "mastered", 1],
    ["two mistakes of 16 at 90%", 16, 90, [14, 2, 0], "repeat", 1],
    ["a proven fail with only 10 of 16 marked at 90%", 16, 90, [8, 2, 0], "repeat", 1],
    // Savar, 2026-11-24: 16 questions at 90%, 10 marked. One wrong is not yet a fail; the sheet waits for its marks.
    ["one wrong with only 10 of 16 marked at 90%", 16, 90, [9, 1, 0], "unknown", 1],
    ["a proven fail with only 2 of 16 marked", 16, 90, [0, 2, 0], "repeat", 1],
    ["two blanks are two mistakes", 16, 90, [14, 0, 2], "repeat", 1],
    ["one blank is one mistake", 16, 90, [15, 0, 1], "mastered", 1],
    ["two mistakes of 10 at 80%", 10, 80, [8, 2, 0], "mastered", 2],
    ["three mistakes of 10 at 80%", 10, 80, [7, 3, 0], "repeat", 2],
    ["two mistakes of 10 at 90%", 10, 90, [8, 2, 0], "repeat", 1],
    ["12 of 16 marked, all right: under 80% marked", 16, 90, [12, 0, 0], "unknown", 1],
    ["13 of 16 marked, all right: 81% marked", 16, 90, [13, 0, 0], "mastered", 1],
    ["13 of 16 marked, one wrong at 90%", 16, 90, [12, 1, 0], "mastered", 1],
    ["8 of 10 marked with 2 wrong at 80%: under the share of the marked", 10, 80, [6, 2, 0], "repeat", 2],
    ["nothing marked", 16, 90, [0, 0, 0], "unknown", 1],
    ["one mistake allowed, under 80% marked", 16, 90, [5, 1, 0], "unknown", 1],
    ["a sheet of one question, right", 1, 90, [1, 0, 0], "mastered", 0],
    ["a sheet of one question, blank", 1, 90, [0, 0, 1], "repeat", 0],
    ["a sheet of one question, unmarked", 1, 90, [0, 0, 0], "unknown", 0],
    ["100% mastery allows no mistake", 20, 100, [19, 1, 0], "repeat", 0],
  ])("%s", (_name, total, masteryPercent, [right, wrong, blank], result, maxMistakes) => {
    const outcome = resultOf(total, marksOf(right, wrong, blank), masteryPercent);
    expect(outcome).toEqual({ ok: true, result, total, itemsScored: right + wrong + blank, right, mistakes: wrong + blank, maxMistakes });
  });

  it("ignores corrections: only the first try counts", () => {
    const marks = marksOf(14, 2).map((m): ItemMark => ({ ...m, correction: "right" }));
    expect(resultOf(16, marks, 90).result).toBe("repeat");
    const spoiled = marksOf(16, 0).map((m): ItemMark => ({ ...m, correction: "wrong" }));
    expect(resultOf(16, spoiled, 90).result).toBe("mastered");
  });

  it.each<[string, () => ReturnType<typeof sheetResult>, RegExp]>([
    ["a sheet with no questions", () => sheetResult([], [], { masteryPercent: 90 }), /no questions has no result/],
    ["a mastery percent of 0", () => sheetResult(itemsOf(4), [], { masteryPercent: 0 }), /whole number from 1 to 100, not 0/],
    ["a mastery percent over 100", () => sheetResult(itemsOf(4), [], { masteryPercent: 101 }), /not 101/],
    ["a mastery percent that is not whole", () => sheetResult(itemsOf(4), [], { masteryPercent: 85.5 }), /not 85.5/],
    ["a mastery percent that is text", () => sheetResult(itemsOf(4), [], { masteryPercent: "90" as unknown as number }), /not "90"/],
    ["two marks of one question", () => sheetResult(itemsOf(4), [...marksOf(1, 0), ...marksOf(0, 1)], { masteryPercent: 90 }), /"q1" has more than one mark/],
    ["a mark of an unknown question", () => sheetResult(itemsOf(2), [{ itemId: "q9", firstTry: "right" }], { masteryPercent: 90 }), /"q9" is for no question/],
    ["a question twice on the sheet", () => sheetResult([{ id: "q1" }, { id: "q1" }], [], { masteryPercent: 90 }), /"q1" is on the sheet more than once/],
    ["an unknown first try", () => sheetResult(itemsOf(2), [{ itemId: "q1", firstTry: "maybe" as FirstTry }], { masteryPercent: 90 }), /must be right, wrong or blank/],
    ["an unknown correction", () => sheetResult(itemsOf(2), [{ itemId: "q1", firstTry: "right", correction: "maybe" as FirstTry }], { masteryPercent: 90 }), /correction of "q1"/],
  ])("refuses %s", (_name, run, problem) => {
    const outcome = run();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems.join("\n")).toMatch(problem);
  });
});

/** A sheet of 1 to 40 questions, a mastery percent, and a first try or no mark for each question. */
const marked = fc.integer({ min: 1, max: 40 }).chain((total) => fc.record({
  total: fc.constant(total),
  masteryPercent: fc.integer({ min: 1, max: 100 }),
  tries: fc.array(fc.option(fc.constantFrom(...FIRST_TRIES), { nil: null }), { minLength: total, maxLength: total }),
  order: fc.array(fc.nat(), { minLength: total, maxLength: total }),
}));
const marksFrom = (tries: readonly (FirstTry | null)[]): ItemMark[] => tries.flatMap((firstTry, i) => (firstTry ? [{ itemId: `q${i + 1}`, firstTry }] : []));

describe("properties of every sheet", () => {
  it("a blank is a wrong answer, and the order of the marks does not matter", () => {
    fc.assert(fc.property(marked, ({ total, masteryPercent, tries, order }) => {
      const marks = marksFrom(tries);
      const shuffled = marks.map((m, i) => ({ m, k: order[i] })).sort((a, b) => a.k - b.k).map(({ m }) => m);
      const asWrong = marks.map((m): ItemMark => (m.firstTry === "blank" ? { ...m, firstTry: "wrong" } : m));
      const one = resultOf(total, marks, masteryPercent);
      expect(resultOf(total, shuffled, masteryPercent)).toEqual(one);
      expect(resultOf(total, asWrong, masteryPercent)).toEqual(one);
    }));
  });

  it("more mistakes than allowed is always a repeat, a sheet under 80% marked with none is never mastered, and a mastered sheet has at most maxMistakes", () => {
    fc.assert(fc.property(marked, ({ total, masteryPercent, tries }) => {
      const outcome = resultOf(total, marksFrom(tries), masteryPercent);
      if (outcome.mistakes > outcome.maxMistakes) expect(outcome.result).toBe("repeat");
      if (outcome.itemsScored * 100 < total * 80) expect(outcome.result).not.toBe("mastered");
      if (outcome.result === "mastered") expect(outcome.mistakes).toBeLessThanOrEqual(outcome.maxMistakes);
      if (outcome.result === "unknown") expect(outcome.itemsScored * 100).toBeLessThan(total * 80);
      expect(outcome.maxMistakes).toBe(total - Math.ceil((total * masteryPercent) / 100));
    }));
  });

  it("a sheet with every question marked is mastered exactly when the right ones reach the mastery percent", () => {
    fc.assert(fc.property(marked, ({ total, masteryPercent, tries }) => {
      const full = tries.map((t) => t ?? "wrong");
      const outcome = resultOf(total, marksFrom(full), masteryPercent);
      expect(outcome.result).toBe(outcome.right * 100 >= total * masteryPercent ? "mastered" : "repeat");
    }));
  });

  it("turning a wrong first try into a right one never takes a sheet from mastered", () => {
    fc.assert(fc.property(marked, fc.nat(), ({ total, masteryPercent, tries }, at) => {
      const wrongAt = tries.map((t, i) => (t === "wrong" ? i : -1)).filter((i) => i >= 0);
      if (wrongAt.length === 0) return;
      const better = [...tries];
      better[wrongAt[at % wrongAt.length]] = "right";
      const [before, after] = [tries, better].map((t) => resultOf(total, marksFrom(t), masteryPercent).result);
      if (before === "mastered") expect(after).toBe("mastered");
    }));
  });
});

/** A book of two sheets: "s1" attempt 1 with 16 questions and "s2" attempt 2 with 10. */
const BOOK: ResultItem[] = [
  ...Array.from({ length: 16 }, (_, i) => ({ id: `s1/1/q${i + 1}`, sheetId: "s1", attempt: 1 })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `s2/2/q${i + 1}`, sheetId: "s2", attempt: 2 })),
];
const bookMarks = (sheet: string, right: number, wrong: number): ItemMark[] =>
  marksOf(right, wrong).map((m) => ({ ...m, itemId: `${sheet}/${m.itemId}` }));

describe("the results of a book", () => {
  const paceOf = (name: string) => {
    const pace = WORKBOOK_1_PACES.find((p) => p.names.includes(name));
    if (!pace) throw new Error(`no pace ${name}`);
    return pace.config;
  };

  it("gives each sheet attempt its result, in the order of its first question", () => {
    const outcome = sheetResults([...bookMarks("s2/2", 8, 2), ...bookMarks("s1/1", 9, 1)], BOOK, { masteryPercent: 90 });
    expect(outcome).toMatchObject({ ok: true, sheets: [
      { sheetId: "s1", attempt: 1, result: "unknown", itemsScored: 10, mistakes: 1, total: 16 },
      { sheetId: "s2", attempt: 2, result: "repeat", itemsScored: 10, mistakes: 2, total: 10 },
    ] });
  });

  it("takes the mastery line from the config alone: the same marks master at 80% and repeat at 90%", () => {
    const marks = bookMarks("s2/2", 8, 2);
    const at = (config: { masteryPercent: number }) => {
      const outcome = sheetResults(marks, BOOK, config);
      if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
      return outcome.sheets.find((s) => s.sheetId === "s2")?.result;
    };
    expect(paceOf("5").masteryPercent).toBe(90);
    expect(paceOf("8").masteryPercent).toBe(80);
    expect(at(paceOf("5"))).toBe("repeat");
    expect(at(paceOf("8"))).toBe("mastered");
  });

  it("counts a blank as wrong and never lets a correction change the first try", () => {
    const blanks = bookMarks("s2/2", 8, 2).map((m): ItemMark => (m.firstTry === "wrong" ? { ...m, firstTry: "blank", correction: "right" } : m));
    const outcome = sheetResults(blanks, BOOK, { masteryPercent: 90 });
    expect(outcome.ok && outcome.sheets.find((s) => s.sheetId === "s2")).toMatchObject({ result: "repeat", mistakes: 2 });
  });

  it.each<[string, ItemMark[], ResultItem[], RegExp]>([
    ["a mark of no question of the book", [{ itemId: "x", firstTry: "right" }], BOOK, /"x" is for no question of the book/],
    ["a question on two sheets", [], [...BOOK, { id: "s1/1/q1", sheetId: "s2", attempt: 2 }], /"s1\/1\/q1" is on more than one sheet/],
    ["two marks of one question", [...bookMarks("s1/1", 1, 0), ...bookMarks("s1/1", 1, 0)], BOOK, /"s1", attempt 1: The question "s1\/1\/q1" has more than one mark/],
    ["a bad mastery percent", [], BOOK, /not 0/],
  ])("refuses %s", (_name, marks, items, problem) => {
    const outcome = sheetResults(marks, items, { masteryPercent: problem.source === "not 0" ? 0 : 90 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems.join("\n")).toMatch(problem);
  });

  it("is the result of each sheet on its own, whatever the other sheets and the order of the marks", () => {
    fc.assert(fc.property(marked, marked, fc.integer({ min: 1, max: 100 }), (one, two, masteryPercent) => {
      const items: ResultItem[] = [
        ...Array.from({ length: one.total }, (_, i) => ({ id: `a/q${i + 1}`, sheetId: "a", attempt: 1 })),
        ...Array.from({ length: two.total }, (_, i) => ({ id: `b/q${i + 1}`, sheetId: "b", attempt: 3 })),
      ];
      const [ma, mb] = [marksFrom(one.tries), marksFrom(two.tries)];
      const prefixed = [...mb.map((m) => ({ ...m, itemId: `b/${m.itemId}` })), ...ma.map((m) => ({ ...m, itemId: `a/${m.itemId}` }))];
      const outcome = sheetResults(prefixed, items, { masteryPercent });
      if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
      expect(outcome.sheets.map((s) => s.result)).toEqual([resultOf(one.total, ma, masteryPercent).result, resultOf(two.total, mb, masteryPercent).result]);
    }));
  });
});
