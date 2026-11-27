import { describe, expect, it } from "vitest";
import raw from "../fixtures/snapshot.json";
import inventedSnapshot from "../fixtures/snapshot-invented-topic.json";
import { TEMPLATES, type PageTemplate } from "../layout/templates";
import { wholeNumber } from "../shapes/shape";
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
    ["limits that no question meets", (s) => put(front(s).rows[0].limits, "product", { min: 10, max: 12 }), `${ROW}: no question meets these limits (a wider product has some).`],
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
    ["a page number that is too large to count with", (s) => put(s.sheets[0], "firstPage", 2 ** 53), 'Sheet "column-multiplication-1": firstPage must be a whole number, 1 or more.'],
    ["a first page with no number left for the back", (s) => put(s.sheets[0], "firstPage", Number.MAX_SAFE_INTEGER), 'Sheet "column-multiplication-1": firstPage leaves no page number for the back.'],
    ["a negative page number", (s) => put(s.sheets[0], "firstPage", -1), 'Sheet "column-multiplication-1": firstPage must be a whole number, 1 or more.'],
    ["a level name that is a word", (s) => { put(s.level, "name", "Mars"); put(s.topics[0], "code", "Mars-20"); }, 'The level: name must be a number from 1 to 99, and it is "Mars".'],
    ["a level name with a zero in front", (s) => { put(s.level, "name", "03"); put(s.topics[0], "code", "03-20"); }, 'The level: name must be a number from 1 to 99, and it is "03".'],
    ["a level name that is level 0", (s) => { put(s.level, "name", "0"); put(s.topics[0], "code", "0-20"); }, 'The level: name must be a number from 1 to 99, and it is "0".'],
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

describe("a value that is not plain data is refused, so the hash covers all that the build reads", () => {
  const limits = (s: Raw) => front(s).rows[0].limits;
  const inherit = (target: object, name: string, value: unknown) => { drop(target, name); Object.setPrototypeOf(target, { [name]: value }); };
  const LIMITS = "The snapshot, sheets[0].front.rows[0].limits";
  class Sheet { id = "x"; }
  it.each<[string, (s: Raw) => unknown, string]>([
    ["an inherited limit", (s) => inherit(limits(s), "zeroInProduct", "never"), `${LIMITS}: this must be a plain object.`],
    ["an inherited range end", (s) => inherit(limits(s).a, "max", 43), `${LIMITS}.a: this must be a plain object.`],
    ["an inherited field of a sheet", (s) => inherit(s.sheets[0], "firstPage", 381), "The snapshot, sheets[0]: this must be a plain object."],
    ["an inherited field of the level", (s) => inherit(s.level, "name", "3"), "The snapshot, level: this must be a plain object."],
    ["an inherited field at the top", (s) => inherit(s, "format", 1), "The snapshot: this must be a plain object."],
    ["an object of a class", (s) => put(s.sheets, "0", Object.assign(new Sheet(), s.sheets[0])), "The snapshot, sheets[0]: this must be a plain object."],
    ["a date", (s) => put(s, "id", new Date(0)), "The snapshot, id: this must be a plain object."],
    ["a map", (s) => put(s, "level", new Map([["id", "level-3"]])), "The snapshot, level: this must be a plain object."],
    ["a computed field", (s) => { Object.defineProperty(s.level, "name", { get: () => "3", enumerable: true }); }, "The snapshot, level.name: this must be a plain value."],
    ["a hidden field", (s) => { Object.defineProperty(s.level, "name", { value: "3", enumerable: false }); }, "The snapshot, level.name: this must be a plain value."],
    ["a field with a symbol for a name", (s) => Object.assign(s.level, { [Symbol("x")]: 1 }), "The snapshot, level: this must be a plain object."],
    ["a field of a list", (s) => Object.assign(s.sheets, { note: 1 }), "The snapshot, sheets: this must be a plain list."],
    ["a list with a hole", (s) => { s.topics[0].sheets.length = 2; }, "The snapshot, topics[0].sheets: this must be a plain list."],
    ["a list of a class", (s) => put(s, "topics", Object.setPrototypeOf([...s.topics], class extends Array {}.prototype)), "The snapshot, topics: this must be a plain list."],
    ["nothing as a value", (s) => put(s.level, "name", undefined), "The snapshot, level.name: this must be a plain value."],
    ["a function", (s) => put(s.level, "toJSON", () => ({ id: "level-3", name: "3" })), "The snapshot, level.toJSON: this must be a plain value."],
    ["a number that JSON cannot hold", (s) => put(limits(s).a, "max", Number.NaN), `${LIMITS}.a.max: this must be a plain value.`],
    ["a number without end", (s) => put(limits(s).a, "max", Number.POSITIVE_INFINITY), `${LIMITS}.a.max: this must be a plain value.`],
    ["a large integer type", (s) => put(s.sheets[0], "firstPage", BigInt(381)), "The snapshot, sheets[0].firstPage: this must be a plain value."],
    ["a text object", (s) => put(s.level, "name", Object("3")), "The snapshot, level.name: this must be a plain object."],
    ["an object inside itself", (s) => put(s.level, "name", s), "The snapshot, level.name: this holds itself."],
    ["objects that are too deep", (s) => put(s.level, "name", Array.from({ length: 40 }).reduce<unknown>((inner) => [inner], 1)), `The snapshot, level.name${"[0]".repeat(30)}: this is nested too deep.`],
  ])("%s", (_name, change, problem) => {
    expect(problemsAfter(change)).toEqual([problem]);
  });

  it("but the same data from JSON text, or with no prototype, is the same snapshot", () => {
    const hashOf = (s: unknown) => { const r = validateSnapshot(s); return r.ok ? r.hash : r.problems.join(); };
    expect(hashOf(JSON.parse(JSON.stringify(raw)))).toBe(hashOf(copy()));
    expect(hashOf(Object.assign(Object.create(null), copy()))).toBe(hashOf(copy()));
  });

  it("the build reads what the hash covers, also when an object answers two ways", () => {
    const s = copy();
    put(front(s).rows[0].limits, "a", new Proxy(front(s).rows[0].limits.a, { get: (target, name) => (name === "max" ? 20 : Reflect.get(target, name)) }));
    const [plain, tricky] = [validateSnapshot(copy()), validateSnapshot(s)];
    if (!plain.ok || !tricky.ok) throw new Error("refused");
    expect(tricky.hash).toBe(plain.hash);
    expect(tricky.snapshot.sheets.get("column-multiplication-1")?.front.rows[0].limits).toEqual(plain.snapshot.sheets.get("column-multiplication-1")?.front.rows[0].limits);
  });

  it("a later change of the raw data does not reach the checked snapshot", () => {
    const s = copy();
    const result = validateSnapshot(s);
    put(s.sheets[0].front.rows[0].limits.a, "max", 12);
    put(s.topics[0], "title", "Another title");
    expect(result.ok && result.snapshot.sheets.get("column-multiplication-1")?.front.rows[0].limits).toMatchObject({ a: { min: 11, max: 43 } });
    expect(result.ok && result.snapshot.sheets.get("column-multiplication-1")?.topic.title).toBe("Multiplying 2 digits by 1 digit");
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

  const base = TEMPLATES.get("columns-2x4");
  if (!base) throw new Error("no template");
  const shorter = (side: "front" | "back"): PageTemplate =>
    ({ ...base, sides: { ...base.sides, [side]: { ...base.sides[side], places: base.sides[side].places.slice(0, 6) } } });
  it.each([
    ["front", 'Sheet "column-multiplication-1", front side: 8 questions do not fit the template "columns-2x4", which has 6 places.'],
    ["back", 'Sheet "column-multiplication-1", back side: 8 questions do not fit the template "columns-2x4", which has 6 places.'],
  ] as const)("counts the places of the side itself when the %s has fewer", (side, problem) => {
    expect(validateSnapshot(copy(), SHAPES, new Map([[base.id, shorter(side)]]))).toEqual({ ok: false, problems: [problem] });
  });

  describe("with a template that has not every form on both sides", () => {
    const blanks = TEMPLATES.get("blanks-1x10");
    const sequences = TEMPLATES.get("sequences-2x2");
    if (!blanks || !sequences) throw new Error("no template");
    type Place = Extract<PageTemplate["sides"]["front"]["places"][number], { forms: unknown }>;
    const changed = (template: PageTemplate, side: "front" | "back", index: number, change: (place: Place) => Partial<Place>): PageTemplate =>
      ({ ...template, sides: { ...template.sides, [side]: { ...template.sides[side], places: template.sides[side].places.map((place, i) => (i === index ? { ...place, ...change(place as Place) } : place)) } } });
    const withRow = (template: PageTemplate, shape: string, limits: unknown) => {
      const s = copy();
      put(front(s), "template", template.id);
      put(front(s), "rows", [{ id: "row", shape, items: 1, limits }]);
      return validateSnapshot(s, SHAPES, new Map([...TEMPLATES, [template.id, template]]));
    };
    const factor = (blank: string) => ({ tables: [7], missing: { min: 2, max: 9 }, result: { min: 0, max: 100 }, blank });
    const skip = (places: [number, number]) => ({ step: { min: 5, max: 5 }, direction: "up", start: { min: 0, max: 50 }, offStep: "never", terms: { min: 5, max: 5 }, blanks: { min: 1, max: 2 }, places: { min: places[0], max: places[1] } });
    const AT = 'Sheet "column-multiplication-1", front side, row "row": the widest question, ';
    const noForm = (id: string) => ` has its blanks where the template "${id}" has no answer area.`;
    it.each<[string, PageTemplate, string, unknown, RegExp | null]>([
      ["both forms", blanks, "missing.factor", factor("either"), null],
      ["one form less, and limits that ask for both", changed(blanks, "front", 0, ({ forms }) => ({ forms: forms.slice(0, 1) })), "missing.factor", factor("either"), /7 × \[2\] = 14,/],
      ["the other form less, and limits that ask for both", changed(blanks, "front", 0, ({ forms }) => ({ forms: forms.slice(1) })), "missing.factor", factor("either"), /\[2\] × 7 = 14,/],
      ["one form less, and limits that do not ask for it", changed(blanks, "front", 0, ({ forms }) => ({ forms: forms.slice(0, 1) })), "missing.factor", factor("first"), null],
      ["no form on the back", changed(blanks, "back", 0, () => ({ forms: [] })), "missing.factor", factor("first"), /\[2\] × 7 = 14,/],
      ["no form at the last place of the back", changed(blanks, "back", 9, () => ({ forms: [] })), "missing.factor", factor("first"), /\[2\] × 7 = 14,/],
      ["no answer area for the last term", changed(sequences, "back", 3, ({ forms }) => ({ forms: [forms[0].map((cell, i) => (i === 4 ? { ...cell, area: null } : cell))] })), "count.skip", skip([3, 5]), /has its blanks/],
      ["no answer area for the last term, and limits with no blank there", changed(sequences, "back", 3, ({ forms }) => ({ forms: [forms[0].map((cell, i) => (i === 4 ? { ...cell, area: null } : cell))] })), "count.skip", skip([3, 4]), null],
      ["no text for the second term", changed(sequences, "front", 0, ({ forms }) => ({ forms: [forms[0].map((cell, i) => (i === 1 ? { ...cell, text: null } : cell))] })), "count.skip", skip([3, 4]), /has its blanks/],
    ])("%s", (_name, template, shape, limits, problem) => {
      const result = withRow(template, shape, limits);
      const text = result.ok ? "" : result.problems.join("\n");
      // The back of the snapshot still has its stacks, so a fit problem of this row is the only one there can be.
      if (problem === null) return expect(text).toBe("");
      expect(text).toMatch(problem);
      expect(text.startsWith(AT)).toBe(true);
      expect(text.endsWith(noForm(template.id))).toBe(true);
    });
  });

  it("refuses a row whose widest question is too wide for the template", () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const wide: Shape = { ...mul, worstCase: () => ({ question: {}, answer: wholeNumber("1234") }), face: () => ({ kind: "column", top: "617", sign: "×", bottom: "2" }) };
    const result = validateSnapshot(copy(), shapeLibrary([wide]));
    expect(result).toMatchObject({ ok: false, problems: expect.arrayContaining([`${ROW}: the widest question, 617 × 2 = 1234, needs 4 digit places and the template "columns-2x4" has 3.`]) });
  });
});

describe("the word problems of a snapshot", () => {
  type Stories = typeof inventedSnapshot & Record<string, unknown>;
  type Question = Stories["questions"][number] & Record<string, unknown>;
  const stories = (): Stories => structuredClone(inventedSnapshot) as Stories;
  const question = (s: Stories, id: string): Question => {
    const found = s.questions.find((q) => q.id === id);
    if (!found) throw new Error(`no question ${id}`);
    return found as Question;
  };
  /** The ids of the questions of the story row of a side. */
  const rowQuestions = (s: Stories, side: "front" | "back") => (s.sheets[2][side].rows[0].limits as unknown as { questions: string[] }).questions;
  const storyProblems = (change: (s: Stories) => unknown): string => {
    const s = stories();
    change(s);
    const result = validateSnapshot(s);
    return result.ok ? "" : result.problems.join("\n");
  };

  it("are read with the snapshot: questions, scenarios and two region packs, and a snapshot with none has none", () => {
    const result = validateSnapshot(stories());
    if (!result.ok) throw new Error(result.problems.join("\n"));
    const bank = result.snapshot.stories;
    expect(bank && [bank.defaultRegion, [...bank.packs.keys()], bank.questions.size, new Set(bank.scenarios.map((s) => s.interest))]).toEqual(["CA", ["CA", "US"], 7, new Set(["default", "space"])]);
    expect(bank?.questions.get("half-of-them")?.phrasings[0].tokens.find((t) => t.kind === "math")).toEqual({ kind: "math", text: "½" });
    const plain = validateSnapshot(copy());
    expect(plain.ok && plain.snapshot.stories).toBeNull();
  });

  it.each<[string, (s: Stories) => unknown, RegExp]>([
    // Q1: the defined questions.
    ["one phrasing", (s) => { question(s, "muffin-boxes").phrasings.pop(); }, /^Question "muffin-boxes": a question needs at least 2 phrasings, and it has 1\.$/m],
    ["an empty token", (s) => { question(s, "muffin-boxes").phrasings[0].tokens[0] = { word: "" }; }, /^Question "muffin-boxes", phrasing "packs", token 1: the token "" must not be empty or have a space at its ends\.$/m],
    ["no token", (s) => { question(s, "muffin-boxes").phrasings[0].tokens = []; }, /^Question "muffin-boxes", phrasing "packs": tokens must have at least 1 entry\.$/m],
    ["a token that is neither a word nor math", (s) => { Object.assign(question(s, "muffin-boxes").phrasings[0].tokens, { 0: { text: "The" } }); }, /token 1: a token must be \{"word": text\} or \{"math": text\}/],
    ["a word with a space", (s) => { question(s, "muffin-boxes").phrasings[0].tokens[0] = { word: "The big" }; }, /the word "The big" has a space: a word token is one word/],
    ["a slot that the formula names and the question does not have", (s) => { question(s, "muffin-boxes").solver = { op: "×", left: { slot: "groups" }, right: { slot: "boxes" } }; }, /^Question "muffin-boxes", solver: the slot "boxes" is not a slot of the question\.$/m],
    ["a placeholder of no slot", (s) => { question(s, "muffin-boxes").phrasings[0].tokens[3] = { word: "[boxes]" }; }, /phrasing "packs": the placeholder \[boxes\] is not known\.[^]*the slot "groups" must be printed one time and it is printed 0 times/],
    ["a slot that is printed twice", (s) => { question(s, "muffin-boxes").phrasings[1].tokens.push({ word: "[each]" }); }, /phrasing "holds": the slot "each" must be printed one time and it is printed 2 times/],
    ["a range with min above max", (s) => { question(s, "muffin-boxes").slots.groups = { min: 9, max: 2 }; }, /^Question "muffin-boxes", slot "groups": min and max must be whole numbers from 0 to 9999, with min not more than max\.$/m],
    ["a range with no multiple in it", (s) => { question(s, "half-of-them").slots.count = { min: 5, max: 5, multipleOf: 2 }; }, /slot "count": no number from 5 to 5 is a multiple of 2/],
    ["a character that the fonts cannot print", (s) => { question(s, "muffin-boxes").phrasings[0].tokens[0] = { word: "Thé→" }; }, /the token "Thé→" has a character that the fonts cannot print/],
    ["a digit of its own", (s) => { question(s, "muffin-boxes").phrasings[0].tokens[0] = { word: "2nd" }; }, /the token "2nd" has a digit, and only a slot prints a number/],
    ["a unit that is no placeholder", (s) => { question(s, "muffin-boxes").unit = "muffins"; }, /^Question "muffin-boxes": unit must be "\[unit\]" of the scenario or "\[unit\.<name>\]" of the region pack\.$/m],
    ["a story row that names no question of the snapshot", (s) => { rowQuestions(s, "front")[0] = "flying-boxes"; }, /^Sheet "story-problems-1", front side, row "one-step": there is no question "flying-boxes"\.$/m],
    ["a story row that names a question twice", (s) => { rowQuestions(s, "front")[1] = "muffin-boxes"; }, /row "one-step": the question "muffin-boxes" is used more than once/],
    ["a story row in a snapshot with no word problems", (s) => { for (const name of ["questions", "scenarios", "regionPacks", "defaultRegion"]) Reflect.deleteProperty(s, name); }, /^Sheet "story-problems-1", front side, row "one-step": a story row needs the questions, scenarios and region packs of its snapshot\.$/m],
    ["word problems with a part missing", (s) => { Reflect.deleteProperty(s, "scenarios"); }, /^The snapshot: scenarios is missing: word problems need defaultRegion, regionPacks, scenarios, questions\.$/m],
    ["a scenario word with a digit", (s) => { s.scenarios[0].place = "bakery 2"; }, /^Scenario "bakery-boxes": place has a digit, and only a slot prints a number\.$/m],
    // A2: the formula is worked for every choice of numbers.
    ["a half of a number that can be odd", (s) => { question(s, "half-of-them").slots.count = { min: 4, max: 40 }; }, /^Question "half-of-them", solver: with count 5: ½ × 5 is not a whole number\.$/m],
    ["a difference that can be below zero", (s) => { question(s, "ribbon-cut").slots.cut = { min: 26, max: 30 }; }, /^Question "ribbon-cut", solver: with cut 26, length 25: 25 - 26 is less than zero\.$/m],
    ["an answer that can be 1, beside a plural unit", (s) => { question(s, "ribbon-cut").slots.cut = { min: 5, max: 24 }; }, /^Question "ribbon-cut", solver: with cut 24, length 25 the answer is 1, and the unit beside the answer area is plural\.$/m],
    ["too many choices of numbers to check", (s) => { question(s, "muffin-boxes").slots = { groups: { min: 2, max: 999 }, each: { min: 2, max: 999 } }; }, /^Question "muffin-boxes", solver: the slots allow 996004 choices of numbers and the most is 10000\.$/m],
    ["a number that can be 1 before a plural word", (s) => { question(s, "muffins-left").slots.taken = { min: 1, max: 4 }; }, /phrasing "given": the slot "taken" can be 1 and the word after it is plural, \[things\]/],
    ["a number that can be 1 before a plural word inside one math token", (s) => {
      const q = question(s, "muffin-boxes");
      q.slots.each = { min: 1, max: 4 };
      const at = q.phrasings[0].tokens.findIndex((t) => "word" in t && t.word === "[each]");
      q.phrasings[0].tokens.splice(at, 2, { math: "[each] [things]" });
    }, /phrasing "packs": the slot "each" can be 1 and the word after it is plural, \[things\]/],
    ["a fraction that disagrees with the formula", (s) => {
      const token = question(s, "half-of-them").phrasings[0].tokens.find((t) => "math" in t);
      if (token && "math" in token) token.math = "¼";
    }, /phrasing "takes": the phrasing prints the fractions ¼ and the formula has ½/],
    ["a fraction printed as a word token", (s) => {
      const tokens = question(s, "half-of-them").phrasings[0].tokens;
      const at = tokens.findIndex((t) => "math" in t);
      tokens[at] = { word: "½" };
    }, /phrasing "takes": the word "½" has a fraction: a fraction must be a math token/],
    ["a formula that uses no slot", (s) => { Object.assign(question(s, "half-of-them"), { solver: { number: 2 } }); }, /^Question "half-of-them", solver: the formula must use a slot of the question\.$/m],
    ["an explicit null regions list", (s) => { Object.assign(question(s, "half-of-them"), { regions: null }); }, /^Question "half-of-them": regions must be a list of different region pack ids\.$/m],
    ["a scenario word with a fraction", (s) => { s.scenarios[0].place = "bakery ½"; }, /^Scenario "bakery-boxes": place has a fraction, and only a math token of a phrasing prints a fraction\.$/m],
    ["a longer answer in a non-default scenario that exceeds the template", (s) => {
      const q = question(s, "muffins-left");
      Object.assign(q, { slots: { groups: { min: 99, max: 100 }, each: { min: 99, max: 100 }, taken: { min: 0, max: 2, multipleOf: 2 } } });
      s.scenarios.find((x) => x.id === "bakery-boxes")!.quantityLimits = { groups: { min: 2, max: 100 }, each: { min: 2, max: 100 }, taken: { min: 2, max: 2 } };
      s.scenarios.find((x) => x.id === "station-crates")!.quantityLimits = { groups: { min: 2, max: 100 }, each: { min: 2, max: 100 }, taken: { min: 0, max: 2 } };
    }, /needs 5 characters in an answer and the template "stories-1x3" has 4/],
    // T1: the scenarios.
    ["no default scenario of a kind that a question uses", (s) => { s.scenarios[0].interest = "farm"; }, /^Question "muffin-boxes": no scenario of the kind "groups" has the interest "default"\.$/m],
    ["two scenarios of one interest and kind", (s) => { s.scenarios[1].interest = "default"; }, /^The pair of interest and kind of a scenario "default, groups" is used more than once\.$/m],
    ["limits of a scenario that leave no number of a slot", (s) => { s.scenarios[1].quantityLimits.groups = { min: 10, max: 12 }; }, /^Question "muffin-boxes": the slot "groups" and the limits of the scenario "station-crates" have no number in common\.$/m],
    ["a scenario with no limit for a slot", (s) => { Reflect.deleteProperty(s.scenarios[4].quantityLimits, "cut"); }, /^Question "ribbon-cut": the scenario "craft-ribbon" sets no limit for the slot "cut"\.$/m],
    ["a limit of a slot that no question has", (s) => { Object.assign(s.scenarios[4].quantityLimits, { width: { min: 1, max: 9 } }); }, /^Scenario "craft-ribbon": no question of the kind "measure" has the slot "width"\.$/m],
    // T2: the region packs.
    ["a default region that is no pack", (s) => { s.defaultRegion = "UK"; }, /^The snapshot: defaultRegion must be the id of a region pack, and it is "UK"\.$/m],
    ["a question of a region that has no pack", (s) => { question(s, "toonie-savings").regions = ["CA", "UK"]; }, /^Question "toonie-savings": there is no region pack "UK"\.$/m],
    ["a row with too few questions for a region", (s) => { rowQuestions(s, "back").splice(3, 1); }, /^Sheet "story-problems-1", back side, row "two-steps": the row asks for 3 different questions and the region "US" has 2 of them\.$/m],
    ["a pack with a coin twice", (s) => { s.regionPacks[1].coins.list[1] = { ...s.regionPacks[1].coins.list[0] }; }, /Region pack "US": the coin id "dollar" is used more than once/],
    ["a pack with a digit-leading coin id", (s) => { s.regionPacks[1].coins.list[4].id = "1-cent"; }, /Region pack "US", coins, coin 5: id must start with a small letter and use only small letters, digits and dashes/],
    ["a slot with unaligned multipleOf bounds whose aligned values break the formula", (s) => {
      const q = question(s, "half-of-them");
      q.slots.count = { min: 5, max: 9, multipleOf: 2 };
      q.phrasings.forEach((p) => { p.tokens = p.tokens.filter((t) => !("math" in t)); });
      Object.assign(q, { solver: { op: "÷", left: { op: "+", left: { slot: "count" }, right: { number: 1 } }, right: { number: 2 } } });
    }, /Question "half-of-them", solver: with count 6: 7 ÷ 2 is not a whole number/],
    ["a pack with another rounding", (s) => { s.regionPacks[0].coins.rounding = "nearest-dime"; }, /Region pack "CA", coins: rounding must be "none" or "nearest-5-cents"/],
    // T3: every placeholder fills with every scenario and region pack that a question can meet.
    ["a spelling that one region pack does not have", (s) => { Reflect.deleteProperty(s.regionPacks[1].spelling, "colour"); }, /^Question "ribbon-cut", scenario "craft-ribbon", region "US": phrasing "cuts": the region pack "US" has no \[spell\.colour\]\.$/m],
    ["a coin that a region of the question does not have", (s) => { question(s, "toonie-savings").regions = ["CA", "US"]; }, /^Question "toonie-savings", scenario "piggy-bank", region "US": phrasing "saves": the region pack "US" has no \[coins\.toonie\]\.$/m],
    ["a unit of the answer that a region pack does not have", (s) => { question(s, "ribbon-cut").unit = "[unit.area]"; }, /^Question "ribbon-cut", scenario "craft-ribbon", region "CA": the region pack "CA" has no \[unit\.area\]\.$/m],
  ])("refuses %s", (_name, change, problem) => expect(storyProblems(change)).toMatch(problem));

  it("passes a question of one region that its own region packs fill, and aligns multipleOf slot bounds before checking the formula", () => {
    expect(storyProblems((s) => { question(s, "nickels-to-pennies").regions = ["US"]; })).toBe("");
    expect(storyProblems((s) => { question(s, "half-of-them").slots.count = { min: 5, max: 9, multipleOf: 2 }; })).toBe("");
  });
});
