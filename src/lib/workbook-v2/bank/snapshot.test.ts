import { describe, expect, it } from "vitest";
import raw from "../fixtures/snapshot.json";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { validateSnapshot } from "./snapshot";

type Raw = typeof raw;
const copy = (): Raw => structuredClone(raw);
/** The problems of the good snapshot after one change. */
function problemsAfter(change: (s: Raw) => unknown): string[] {
  const s = copy();
  const replaced = change(s);
  const result = validateSnapshot(replaced !== undefined && replaced !== null && typeof replaced === "object" && "format" in replaced ? replaced : s);
  return result.ok ? [] : result.problems;
}
/** Breaks the types on purpose: a bank file is text that a person wrote. */
const put = (target: object, key: string, value: unknown) => { Reflect.set(target, key, value); };
const drop = (target: object, key: string) => { Reflect.deleteProperty(target, key); };

const front = (s: Raw) => s.sheets[0].front;
const back = (s: Raw) => s.sheets[0].back;

describe("a good snapshot", () => {
  it("is accepted with its topics, sheets and rows", () => {
    const result = validateSnapshot(copy());
    if (!result.ok) throw new Error(result.problems.join("\n"));
    expect(result.snapshot.sheets.get("column-multiplication-1")).toMatchObject({ firstPage: 381, topic: { code: "3-20" } });
    expect(result.snapshot.sheets.get("column-multiplication-1")?.front.rows.map((r) => [r.id, r.items])).toEqual([["no-carry", 4], ["one-carry", 4]]);
  });

  it("has a hash that the order of keys does not change and any value does", () => {
    const hashOf = (s: unknown) => { const r = validateSnapshot(s); return r.ok ? r.hash : "refused"; };
    const turned = Object.fromEntries(Object.entries(copy()).reverse());
    const changed = copy();
    front(changed).rows[0].limits.b.max = 3;
    expect(hashOf(turned)).toBe(hashOf(copy()));
    expect(hashOf(copy())).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf(changed)).not.toBe(hashOf(copy()));
  });
});

const ROW = 'Sheet "column-multiplication-1", front side, row "no-carry"';

describe("a bad snapshot is refused, and the problem names the place", () => {
  it.each<[string, (s: Raw) => unknown, string]>([
    ["an unknown shape", (s) => put(front(s).rows[0], "shape", "mul.colum"), `${ROW}: there is no shape "mul.colum".`],
    ["a shape named like an object property", (s) => put(front(s).rows[0], "shape", "constructor"), `${ROW}: there is no shape "constructor".`],
    ["limits that no question meets", (s) => put(front(s).rows[0].limits, "product", { min: 10, max: 12 }), `${ROW}: no question meets these limits.`],
    ["limits with too few questions", (s) => { put(front(s).rows[0].limits, "a", { min: 11, max: 11 }); }, `${ROW}: the row asks for 4 different questions and its limits allow 3.`],
    ["a misspelled limit", (s) => put(front(s).rows[0].limits, "carrys", { min: 0, max: 0 }), `${ROW}: unknown limit "carrys".`],
    ["a limit of the wrong type", (s) => put(front(s).rows[0].limits, "a", { min: "11", max: 43 }), `${ROW}: a.min must be a whole number.`],
    ["an unknown template", (s) => put(front(s), "template", "columns-9x9"), 'Sheet "column-multiplication-1", front side: there is no template "columns-9x9".'],
    ["a topic that names a missing sheet", (s) => put(s.topics[0], "sheets", ["column-multiplication-1", "gone"]), 'Topic "topic-20": there is no sheet "gone".'],
    ["a sheet that no topic names", (s) => { s.sheets.push({ ...structuredClone(s.sheets[0]), id: "lost", firstPage: 383 }); }, 'Sheet "lost": no topic names this sheet.'],
    ["a sheet that two topics name", (s) => { s.topics.push({ ...structuredClone(s.topics[0]), id: "topic-21", code: "3-21" }); }, 'Sheet "column-multiplication-1": more than one topic names this sheet.'],
    ["a sheet that one topic names twice", (s) => put(s.topics[0], "sheets", ["column-multiplication-1", "column-multiplication-1"]), 'Sheet "column-multiplication-1": more than one topic names this sheet.'],
    ["a topic code of another level", (s) => put(s.topics[0], "code", "4-20"), 'Topic "topic-20": the code "4-20" must be the level name, a dash and a number, such as 3-1.'],
    ["a topic with no sheet", (s) => put(s.topics[0], "sheets", []), 'Topic "topic-20": sheets must have at least 1 entry.'],
    ["a sheet with no back", (s) => drop(s.sheets[0], "back"), 'Sheet "column-multiplication-1": back is missing.'],
    ["a side with no row", (s) => put(front(s), "rows", []), 'Sheet "column-multiplication-1", front side: rows must have at least 1 entry.'],
    ["a row with no question", (s) => put(front(s).rows[0], "items", 0), `${ROW}: items must be a whole number, 1 or more.`],
    ["part of a question", (s) => put(front(s).rows[0], "items", 1.5), `${ROW}: items must be a whole number, 1 or more.`],
    ["two topics with one id", (s) => { s.topics.push({ ...structuredClone(s.topics[0]), code: "3-21", sheets: [] }); }, 'The topic id "topic-20" is used more than once.'],
    ["two topics with one code", (s) => { s.topics.push({ ...structuredClone(s.topics[0]), id: "topic-21" }); }, 'The topic code "3-20" is used more than once.'],
    ["two sheets with one id", (s) => { s.sheets.push({ ...structuredClone(s.sheets[0]), firstPage: 383 }); }, 'The sheet id "column-multiplication-1" is used more than once.'],
    ["two sheets with one page number", (s) => { s.sheets.push({ ...structuredClone(s.sheets[0]), id: "second" }); }, "The page number 381 is used more than once."],
    ["two rows with one id on a sheet", (s) => put(back(s).rows[0], "id", "no-carry"), 'Sheet "column-multiplication-1": the row id "no-carry" is used more than once.'],
    ["an even first page", (s) => put(s.sheets[0], "firstPage", 382), 'Sheet "column-multiplication-1": firstPage must be odd, because the front of a sheet is a right-hand page.'],
    ["a page number as text", (s) => put(s.sheets[0], "firstPage", "381"), 'Sheet "column-multiplication-1": firstPage must be a whole number, 1 or more.'],
    ["an instruction that is too long", (s) => put(front(s), "instruction", "x".repeat(61)), 'Sheet "column-multiplication-1", front side: instruction has 61 characters and the limit is 60.'],
    ["an empty instruction", (s) => put(front(s), "instruction", "  "), 'Sheet "column-multiplication-1", front side: instruction must be text with no space at its ends.'],
    ["an instruction on two lines", (s) => put(front(s), "instruction", "Multiply.\nThen check."), 'Sheet "column-multiplication-1", front side: instruction has a character that the fonts cannot print.'],
    ["a character that the fonts do not hold", (s) => put(s.topics[0], "title", "Multiplying 二"), 'Topic "topic-20": title has a character that the fonts cannot print.'],
    ["a title that is too long", (s) => put(s.topics[0], "title", "x".repeat(45)), 'Topic "topic-20": title has 45 characters and the limit is 44.'],
    ["a title that is a number", (s) => put(s.topics[0], "title", 7), 'Topic "topic-20": title must be text with no space at its ends.'],
    ["an id with a slash", (s) => put(s.sheets[0], "id", "a/b"), 'Sheet 1: id must use only small letters, digits and dashes.'],
    ["an unknown field on a sheet", (s) => put(s.sheets[0], "basis", "a made-up source"), 'Sheet "column-multiplication-1": unknown field "basis".'],
    ["an unknown field on a row", (s) => put(front(s).rows[0], "note", "x"), `${ROW}: unknown field "note".`],
    ["an unknown field at the top", (s) => put(s, "extra", 1), 'The snapshot: unknown field "extra".'],
    ["another format", (s) => put(s, "format", 2), "The snapshot: format must be 1."],
    ["no level", (s) => drop(s, "level"), "The snapshot: level is missing."],
    ["a level name as a number", (s) => put(s.level, "name", 3), "The level: name must be text with no space at its ends."],
    ["topics that are not a list", (s) => put(s, "topics", {}), "The snapshot: topics must be a list."],
  ])("%s", (_name, change, problem) => {
    expect(problemsAfter(change)).toContain(problem);
  });

  it.each<[string, unknown]>([["nothing", undefined], ["null", null], ["text", "{}"], ["a list", []]])("%s in place of a snapshot", (_name, value) => {
    expect(validateSnapshot(value)).toEqual({ ok: false, problems: ["The snapshot must be an object."] });
  });

  it("lists every problem, not only the first", () => {
    const problems = problemsAfter((s) => { put(front(s).rows[0], "shape", "a.b"); put(back(s).rows[1], "shape", "c.d"); });
    expect(problems).toEqual([`${ROW}: there is no shape "a.b".`, 'Sheet "column-multiplication-1", back side, row "past-one-hundred": there is no shape "c.d".']);
  });
});

describe("rows never get easier down a side", () => {
  it.each<[string, (s: Raw) => unknown, string[]]>([
    ["the same rows in the other order", (s) => { front(s).rows.reverse(); }, ['Sheet "column-multiplication-1", front side, row "no-carry": this row is easier than the row above it.']],
    ["a row with an easier end than the row above", (s) => put(back(s).rows[1].limits, "product", { min: 10, max: 999 }), ['Sheet "column-multiplication-1", back side, row "past-one-hundred": this row is easier than the row above it.']],
    ["a row with a hardest question below the row above", (s) => { put(front(s).rows[0].limits, "b", { min: 2, max: 9 }); put(front(s).rows[1], "limits", { ...front(s).rows[0].limits, b: { min: 2, max: 4 } }); }, ['Sheet "column-multiplication-1", front side, row "one-carry": this row is easier than the row above it.']],
    ["the same limits twice", (s) => put(front(s).rows[1], "limits", structuredClone(front(s).rows[0].limits)), []],
  ])("%s", (_name, change, problems) => {
    expect(problemsAfter(change)).toEqual(problems);
  });
});

describe("the questions of a side fit its template", () => {
  it.each<[number, number, string[]]>([
    [4, 4, []],
    [1, 1, []],
    [4, 5, ['Sheet "column-multiplication-1", front side: 9 questions do not fit the template "columns-2x4", which has 8 places.']],
    [8, 1, ['Sheet "column-multiplication-1", front side: 9 questions do not fit the template "columns-2x4", which has 8 places.']],
  ])("%i and %i questions", (first, second, problems) => {
    expect(problemsAfter((s) => { put(front(s).rows[0], "items", first); put(front(s).rows[1], "items", second); })).toEqual(problems);
  });

  it("refuses a row whose widest question is too wide for the template", () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const wide: Shape = { ...mul, worstCase: () => ({ question: {}, answer: { kind: "whole-number", value: "1234" } }), face: () => ({ kind: "column", top: "617", sign: "×", bottom: "2" }) };
    const result = validateSnapshot(copy(), shapeLibrary([wide]));
    expect(result).toMatchObject({ ok: false, problems: expect.arrayContaining([`${ROW}: the widest question, 617 × 2 = 1234, needs 4 digit places and the template "columns-2x4" has 3.`]) });
  });
});
