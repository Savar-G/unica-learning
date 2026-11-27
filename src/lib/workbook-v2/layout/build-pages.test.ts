import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import { answerLine, type Answer, type BracketFace, type Face, type FaceToken, type PageModel, type Rect, type Region, type RegionRole } from "../contract";
import wideBook from "../fixtures/book-4-digits.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import { canonicalJson, sha256 } from "../hash";
import { factsBook, goodPages, inventedBook, placesBook } from "../testing/sample";
import { SHAPES, shapeLibrary } from "../shapes";
import { wholeNumber } from "../shapes/shape";
import { validateSnapshot } from "../bank/snapshot";
import { sheetItems } from "../build/items";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import { buildPages } from "./build-pages";
import { fitProblem, needsOf, questionText, TEMPLATES, type ItemPlace } from "./templates";

const pages = () => goodPages();
const regions = (page: PageModel, role: RegionRole) => page.regions.filter((r) => r.role === role);
const texts = (region: Region) => region.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
const one = (page: PageModel, role: RegionRole): Region => {
  const found = regions(page, role);
  if (found.length !== 1) throw new Error(`${found.length} ${role}`);
  return found[0];
};
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

describe("the two pages of a sheet", () => {
  it("print the topic, the instruction, the level and the page number", () => {
    const [front, back] = pages();
    expect(texts(one(front, "heading"))).toEqual(["3-20 · Multiplying 2 digits by 1 digit"]);
    expect(texts(one(front, "instruction"))).toEqual(["Multiply. Start with the ones."]);
    expect(texts(one(front, "footer"))).toEqual(["Level 3 · Page 381"]);
    expect(texts(one(back, "footer"))).toEqual(["Level 3 · Page 382"]);
    expect([front.qr, back.qr]).toEqual(["https://unicalearning.com/tutor/p/example-front-381", "https://unicalearning.com/tutor/p/example-back-382"]);
  });

  it("put the fixed rectangles where the template says, mirrored between the sides", () => {
    const [front, back] = pages();
    expect(one(front, "qr").rect).toEqual(r(496.9, 698.4, 57.6, 57.6));
    expect(one(back, "qr").rect).toEqual(r(57.5, 698.4, 57.6, 57.6));
    const answers = (page: PageModel) => regions(page, "answer").map((a) => [a.rect.x, a.rect.y]);
    expect(answers(front)).toEqual([[134, 178], [384, 178], [134, 326], [384, 326], [134, 474], [384, 474], [134, 622], [384, 622]]);
    expect(answers(back)).toEqual(answers(front).map(([x, y]) => [x - 54, y]));
    expect(regions(front, "answer").every((a) => a.rect.w === 72 && a.rect.h === 42)).toBe(true);
  });

  it("give each question a label, a stack, an answer area, its reach and a work area", () => {
    const [front] = pages();
    for (const role of ["slot", "label", "question", "answer", "reach", "work"] as const) expect(regions(front, role)).toHaveLength(8);
    expect(regions(front, "label").flatMap(texts)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("line up the digits: ones under ones, and the sign left of the bottom number", () => {
    const [front] = pages();
    const ink = regions(front, "question")[0].ink;
    const digits = ink.flatMap((i) => (i.kind === "text" ? [{ text: i.text, x: i.rect.x - 134, y: i.rect.y }] : []));
    expect(digits.map((d) => d.x)).toEqual([24, 48, 24, 48]);
    expect(digits.map((d) => d.text)).toEqual([expect.stringMatching(/^\d$/), expect.stringMatching(/^\d$/), "×", expect.stringMatching(/^\d$/)]);
    expect(digits[0].y).toBe(digits[1].y);
    expect(digits[2].y).toBe(digits[3].y);
    expect(digits[2].y).toBeGreaterThan(digits[0].y);
  });

  it("never print an answer", () => {
    for (const page of pages()) for (const answer of regions(page, "answer")) expect(answer.ink.map((i) => i.kind)).toEqual(["outline"]);
  });

  it("have ids that no other rectangle of the book has", () => {
    const ids = pages().flatMap((p) => p.regions.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a sheet of 4 digits by 1 digit", () => {
  const plan = planBook({ snapshot: wideSnapshot, book: wideBook });
  const wide = plan.ok ? plan.pages : [];

  it("passes every check that needs no drawing, with all places of both sides full", () => {
    expect(plan).toMatchObject({ ok: true });
    expect(wide.map((page) => [page.template, regions(page, "slot").length])).toEqual([["columns-2x4-wide", 8], ["columns-2x4-wide", 8]]);
    if (plan.ok) expect(Math.max(...plan.items.map((i) => answerLine(i.answer).length))).toBe(5);
  });

  it("has answer areas of five digit places in the two columns of the other template, mirrored between the sides", () => {
    const [front, back] = wide;
    const answers = (page: PageModel) => regions(page, "answer").map(({ rect }) => [rect.x, rect.y, rect.w, rect.h]);
    expect(answers(front)).toEqual([178, 326, 474, 622].flatMap((y) => [[134, y, 120, 42], [384, y, 120, 42]]));
    expect(answers(back)).toEqual(answers(front).map(([x, ...more]) => [x - 54, ...more]));
  });

  it("lines up the digits from the right: ones under ones, and the sign left of the bottom number", () => {
    const placed = regions(wide[0], "question")[0].ink.flatMap((i) => (i.kind === "text" ? [[i.text, i.rect.x - 134]] : []));
    expect(placed.map(([, x]) => x)).toEqual([24, 48, 72, 96, 72, 96]);
    expect(placed[4][0]).toBe("×");
  });

  it("leaves a work area beside each stack, outside the reach of its answer", () => {
    expect(wide).toHaveLength(2);
    for (const page of wide) {
      const works = regions(page, "work");
      expect(works).toHaveLength(8);
      works.forEach(({ rect }, i) => {
        const reach = regions(page, "reach")[i].rect;
        expect(rect.x).toBeGreaterThan(reach.x + reach.w);
        expect([rect.w, rect.h]).toEqual([38, 140]);
      });
    }
  });

  it("uses the only template that 5 digit places fit", () => {
    expect([...TEMPLATES.values()].filter((t) => t.faces.includes("column")).map((t) => [t.id, t.holds])).toEqual([["columns-2x4", { "digit places": 3 }], ["columns-2x4-wide", { "digit places": 5 }]]);
  });
});

describe("a question with one answer area", () => {
  // Made with engine 2.0.0-s3, before answers had parts.
  it.each([["the example sheet", goodPages, "e5178d1410a99bedfd236e5646995d0098220db7a76ac3ae041c66ae9634ea40"], ["the sheet of 4 digits by 1 digit", () => { const plan = planBook({ snapshot: wideSnapshot, book: wideBook }); return plan.ok ? plan.pages : []; }, "64247e899f4c41149ba0972ab661f5b12af658adeaee253c88187151c931ace5"]])("is laid out as before answers had parts: %s", (_name, made, hash) => {
    // A page that does not start a day has no capture, and nothing else of it changed when captures came.
    const before = made().map(({ captures, ...page }) => { expect(captures).toEqual([]); return { ...page, regions: page.regions.map(({ part, ...region }) => { expect(part).toBe(region.role === "answer" || region.role === "reach" ? "answer" : null); return region; }) }; });
    expect(sha256(canonicalJson(before))).toBe(hash);
  });
});

describe("the templates of tokens", () => {
  const book = factsBook();
  const [facts, , , , sums, blanks, , short, long] = book.pages;
  const corners = (page: PageModel, role: RegionRole) => regions(page, role).map(({ rect }) => [rect.x, rect.y]);
  const columnsOf = (page: PageModel) => [...new Set(regions(page, "answer").map(({ rect }) => rect.x))];

  it("have as many places as the print rules allow", () => {
    expect([...TEMPLATES.values()].map((t) => [t.id, t.sides.front.places.length, t.sides.back.places.length])).toEqual([
      ["columns-2x4", 8, 8], ["columns-2x4-wide", 8, 8], ["facts-2x10", 20, 20], ["sums-1x10", 10, 10], ["blanks-1x10", 10, 10], ["sequences-2x2", 4, 4], ["sequences-2x1", 2, 2],
      ["remainders-1x10", 10, 10], ["brackets-2x6", 12, 12], ["brackets-2x4", 8, 8], ["brackets-2x3", 6, 6], ["brackets-1x4", 4, 4], ["brackets-1x3", 3, 3],
      ["places-2x2", 4, 4], ["places-2x3", 6, 6], ["figures-1x4", 4, 4], ["stories-1x3", 3, 3],
    ]);
    // One row more would reach the QR code: a row is an answer area with its reach.
    const [qr] = regions(facts, "qr");
    const lowest = Math.max(...regions(facts, "slot").map(({ rect }) => rect.y + rect.h));
    expect(lowest).toBeLessThanOrEqual(qr.rect.y);
    expect(lowest + 61.2).toBeGreaterThan(qr.rect.y + 40);
  });

  it("run down a column, so that a table in order reads down", () => {
    const answers = corners(facts, "answer");
    expect(answers.slice(0, 3).map(([x]) => x)).toEqual([229.2, 229.2, 229.2]);
    expect(answers[10][1]).toBe(answers[0][1]);
    expect(answers[10][0] - answers[0][0]).toBe(246);
  });

  it("keep the answer areas of a side in one or two columns, wherever the blank stands", () => {
    expect([facts, sums, blanks, short, long].map((page) => columnsOf(page).length)).toEqual([2, 1, 1, 2, 2]);
    const kinds = new Set(book.items.filter((i) => i.id.startsWith(`${blanks.id}/`)).map((i) => (i.question as { blank: string }).blank));
    expect([...kinds].sort()).toEqual(["first", "second"]);
  });

  it("give each blank an area and a reach with the name of its part, and no work area", () => {
    const own = short.regions.filter((g) => g.item === `${short.id}/1`).map((g) => [g.id.slice(short.id.length + 1), g.role, g.part]);
    expect(own).toEqual([["slot-1", "slot", null], ["label-1", "label", null], ["question-1", "question", null],
      ...["blank-1", "blank-2", "blank-3"].flatMap((part) => [[`answer-1-${part}`, "answer", part], [`reach-1-${part}`, "reach", part]])]);
    expect(book.pages.flatMap((page) => regions(page, "work"))).toEqual([]);
  });

  it("put a line above the lower of two sequences", () => {
    const lines = regions(short, "question").map((g) => g.ink.filter((i) => i.kind === "fill").length);
    expect(lines).toEqual([0, 1, 0, 1]);
  });

  const equation = (...tokens: string[]) => ({ kind: "equation" as const, tokens: tokens.map((t) => (t === "□" ? { blank: "answer" } : { text: t })) });
  const column = { kind: "column" as const, top: "24", sign: "×", bottom: "3" };
  it.each([
    ["a fact", "facts-2x10", equation("10", "×", "10", "=", "□"), 100, null],
    ["a short sum in a long line", "sums-1x10", equation("4", "+", "4", "=", "□"), 8, null],
    ["a blank in the first place", "blanks-1x10", equation("□", "×", "7", "=", "35"), 5, null],
    ["a blank in the second place", "blanks-1x10", equation("5", "×", "□", "=", "35"), 7, null],
    ["a blank inside, in a template with one at the end", "facts-2x10", equation("5", "×", "□", "=", "35"), 7, 'has its blanks where the template "facts-2x10" has no answer area'],
    ["a blank at the end, in a template with one inside", "blanks-1x10", equation("5", "×", "7", "=", "□"), 35, 'has its blanks where the template "blanks-1x10" has no answer area'],
    ["a line that is too long", "facts-2x10", equation("4", "+", "4", "+", "4", "=", "□"), 12, 'needs 7 places in its line and the template "facts-2x10" has 5'],
    ["a number that is too long", "sums-1x10", equation("100", "+", "100", "=", "□"), 200, 'needs 3 characters in a number and the template "sums-1x10" has 2'],
    ["an answer that is too long", "facts-2x10", equation("5", "×", "7", "=", "□"), 1035, 'needs 4 characters in a number and the template "facts-2x10" has 3'],
    ["a stack", "facts-2x10", column, 72, 'is a column question and the template "facts-2x10" has no place for one'],
    ["an equation in a template of stacks", "columns-2x4", equation("5", "×", "7", "=", "□"), 35, 'is an equation question and the template "columns-2x4" has no place for one'],
    ["a sequence in a template of equations", "facts-2x10", { kind: "sequence" as const, tokens: [{ text: "5" }, { blank: "answer" }] }, 10, 'is a sequence question and the template "facts-2x10" has no place for one'],
  ])("say whether %s fits", (_name, id, face, answer, problem) => {
    const template = TEMPLATES.get(id);
    if (!template) throw new Error("no template");
    expect(fitProblem(template, face, wholeNumber(answer))).toBe(problem);
  });

  it.each([0, 2, 3])("say that a stack with %s answer parts does not fit", (count) => {
    const parts = Array.from({ length: count }, (_, i) => ({ ...wholeNumber(72).parts[0], name: `blank-${i + 1}` }));
    for (const id of ["columns-2x4", "columns-2x4-wide"]) expect(fitProblem(TEMPLATES.get(id)!, column, { parts })).toBe(`has ${count} answer parts and a stack has one answer area`);
  });

  it("show a question with its answer, and how large it is", () => {
    expect(questionText(equation("5", "×", "□", "=", "35"), wholeNumber(7))).toBe("5 × [7] = 35");
    expect(questionText(column, wholeNumber(72))).toBe("24 × 3 = 72");
    expect(needsOf({ kind: "sequence", tokens: [{ text: "5" }, { text: "10" }, { blank: "blank-1" }] }, { parts: [{ name: "blank-1", kind: "whole-number", value: "115" }] })).toEqual({ terms: 3, "characters in a number": 3 });
  });

  // A division as the layout sees it: tokens, with no math.
  const value = (name: string, text: string) => ({ name, kind: "whole-number" as const, value: text });
  const both = { parts: [value("quotient", "73"), value("remainder", "5")] };
  const rest = [{ text: "R" }, { blank: "remainder" }];
  const bracket = (outside: string, inside: string, workLines: number, ...after: FaceToken[]): BracketFace => ({ kind: "bracket", above: [{ blank: after.length > 0 ? "quotient" : "answer" }, ...after], outside, inside, workLines });
  const line = (...tokens: FaceToken[]): Face => ({ kind: "equation", tokens: [{ text: "443" }, { text: "÷" }, { text: "6" }, { text: "=" }, ...tokens] });
  it.each<[string, Face, Answer, string[]]>([
    ["a line with one area", line({ blank: "answer" }), wholeNumber(73), ["facts-2x10"]],
    ["a line with a remainder", line({ blank: "quotient" }, ...rest), both, ["remainders-1x10"]],
    ["a bracket with no work", bracket("10", "100", 0), wholeNumber(10), ["brackets-2x6", "brackets-2x4", "brackets-2x3"]],
    ["a bracket with two lines of work", bracket("4", "36", 2), wholeNumber(9), ["brackets-2x4", "brackets-2x3"]],
    ["a bracket with six lines of work", bracket("2", "998", 6), wholeNumber(499), ["brackets-2x3"]],
    ["a bracket with a remainder and two lines", bracket("4", "37", 2, ...rest), both, ["brackets-1x4", "brackets-1x3"]],
    ["a bracket with a remainder and six lines", bracket("2", "999", 6, ...rest), both, ["brackets-1x3"]],
    ["seven lines of work", bracket("2", "999", 7, ...rest), both, []],
    ["four characters inside", bracket("2", "1998", 2), wholeNumber(9), []],
    ["three characters outside", bracket("100", "100", 0), wholeNumber(1), []],
    ["an answer of five characters", bracket("2", "998", 6), wholeNumber(10000), []],
    ["a remainder of five characters", bracket("2", "998", 6, ...rest), { parts: [both.parts[0], value("remainder", "10000")] }, []],
    ["two areas and no text between them", bracket("2", "998", 6, { blank: "remainder" }), both, []],
    ["no area", { ...bracket("2", "998", 6), above: [] }, { parts: [] }, []],
    ["a text in the place of the area", { ...bracket("2", "998", 6), above: [{ text: "R" }] }, wholeNumber(9), []],
  ])("of divisions take only their own form: %s", (_name, face, answer, wanted) => {
    expect([...TEMPLATES.values()].filter((t) => fitProblem(t, face, answer) === null).map((t) => t.id)).toEqual(wanted);
  });

  it("say what is wrong with a division that does not fit, and show it with its answer", () => {
    const problem = (id: string, face: Face, answer: Answer) => fitProblem(TEMPLATES.get(id)!, face, answer);
    expect(problem("brackets-1x4", bracket("2", "999", 6, ...rest), both)).toBe('needs 6 lines of work and the template "brackets-1x4" has 3');
    expect(problem("brackets-2x6", bracket("4", "37", 0, ...rest), both)).toBe('has its blanks where the template "brackets-2x6" has no answer area');
    expect(problem("columns-2x4", bracket("4", "36", 2), wholeNumber(9))).toBe('is a bracket question and the template "columns-2x4" has no place for one');
    expect([questionText(bracket("6", "443", 4, ...rest), both), questionText(bracket("6", "438", 4), wholeNumber(73)), questionText(line({ blank: "quotient" }, ...rest), both)]).toEqual(["6)443 = [73] R [5]", "6)438 = [73]", "443 ÷ 6 = [73] R [5]"]);
    expect([answerLine(both), answerLine(wholeNumber(73)), answerLine({ parts: [value("blank-1", "20"), value("blank-2", "30")] })]).toEqual(["73 R5", "73", "20, 30"]);
  });

  it.each(["front", "back"] as const)("are looked at on the side and at the place of each question: %s", (side) => {
    const template = TEMPLATES.get("blanks-1x10");
    const sheet = validateSnapshot(factsSnapshot);
    if (!template || !sheet.ok) throw new Error("no sheet");
    const found = sheet.snapshot.sheets.get("equal-groups");
    if (!found) throw new Error("no sheet");
    const row = found.back.rows[0];
    const places = template.sides[side].places.map((place, i) => (i === 3 ? { ...place, forms: [] } : place));
    const broken = { ...template, sides: { ...template.sides, [side]: { ...template.sides[side], places } } };
    const content = { instruction: "Write the missing number.", template: broken, rows: [{ ...row, items: 4 }] };
    const both = { ...found, front: { ...content, rows: [{ ...row, id: "f", items: 4 }] }, back: content };
    const pages = buildPages([{ sheet: both, levelName: "2", attempt: 1, qr: { front: "f", back: "b" }, items: sheetItems(both, "child", 1) }]);
    expect(pages).toEqual({ ok: false, problems: [expect.stringMatching(new RegExp(`^Page ${side === "front" ? 125 : 126}: question 4 has its blanks where the template "blanks-1x10" has no answer area\\.$`))] });
  });

  it("stop a page with a question that has no place, and name it", () => {
    const [sheet] = wideSnapshot.sheets;
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const odd = shapeLibrary([{ ...mul, worstCase: (l) => ({ ...mul.worstCase(l), question: { a: 1000, b: 2 } }), face: (q) => ((q as { a: number }).a === 1000 ? mul.face(q) : equation("5", "×", "7", "=", "□")) }]);
    expect(planBook({ snapshot: { ...wideSnapshot, sheets: [sheet] }, book: wideBook }, odd)).toEqual({ ok: false, problems: expect.arrayContaining([expect.stringMatching(/^Page \d+: question 1 is an equation question and the template "columns-2x4-wide" has no place for one\.$/)]) });
  });
});

describe("the templates of fields", () => {
  const book = placesBook();
  const fields = (rows: number, prompt = "4307".slice(0, rows), label = "tens"): Face => ({ kind: "fields", prompt, rows: Array.from({ length: rows }, (_, i) => ({ label: i === 0 ? label : `row ${i}`, blank: `blank-${i + 1}` })) });
  const digits = (rows: number, value = "4"): Answer => ({ parts: Array.from({ length: rows }, (_, i) => ({ name: `blank-${i + 1}`, kind: "digit" as const, value })) });
  const own = (page: PageModel, number: number) => page.regions.filter((g) => g.item === `${page.id}/${number}`);

  it("hold four questions of up to 4 rows, or six of up to 2 rows, on both sides of the example book", () => {
    expect(book.pages.map((p) => `${p.template} ${regions(p, "slot").length}`)).toEqual(["places-2x3 6", "places-2x3 6", "places-2x2 4", "places-2x2 4"]);
    expect(["places-2x2", "places-2x3"].map((id) => TEMPLATES.get(id)?.holds.rows)).toEqual([4, 2]);
  });

  it("stack the rows of each question, with all answer areas of a side in two columns and below the prompt", () => {
    for (const page of book.pages) {
      expect(new Set(regions(page, "answer").map(({ rect }) => rect.x)).size).toBe(2);
      for (const slot of regions(page, "slot")) {
        const number = Number(slot.id.split("-").at(-1));
        const [question] = own(page, number).filter((g) => g.role === "question");
        const areas = own(page, number).filter((g) => g.role === "answer").map(({ rect }) => rect);
        expect(new Set(areas.map((a) => a.x)).size).toBe(1);
        areas.slice(1).forEach((area, i) => expect(area.y).toBeGreaterThanOrEqual(areas[i].y + areas[i].h));
        const [prompt] = question.ink.filter((i) => i.kind === "text");
        for (const area of areas) expect(area.y).toBeGreaterThan(prompt.rect.y + prompt.rect.h);
      }
    }
  });

  it("give each row a label, an area and a reach with the name of its part, and no work area", () => {
    const [, , front] = book.pages;
    const item = book.items.find((i) => i.id === `${front.id}/4`);
    expect(item?.face).toMatchObject({ kind: "fields", rows: [{ label: "hundreds", blank: "hundreds" }, { label: "tens", blank: "tens" }, { label: "ones", blank: "ones" }] });
    expect(own(front, 4).map((g) => [g.id.slice(front.id.length + 1), g.role, g.part])).toEqual([["slot-4", "slot", null], ["label-4", "label", null], ["question-4", "question", null],
      ...["hundreds", "tens", "ones"].flatMap((part) => [[`answer-4-${part}`, "answer", part], [`reach-4-${part}`, "reach", part]])]);
    const [question] = own(front, 4).filter((g) => g.role === "question");
    expect(texts(question)).toEqual([item?.face.kind === "fields" ? item.face.prompt : "", "hundreds", "tens", "ones"]);
    expect(book.pages.flatMap((page) => regions(page, "work"))).toEqual([]);
  });

  it("put a line above a question that stands below another one", () => {
    expect(book.pages.map((page) => regions(page, "question").map((g) => g.ink.filter((i) => i.kind === "fill").length))).toEqual([[0, 0, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]]);
  });

  it.each<[string, string, Face, Answer, string | null]>([
    ["4 rows", "places-2x2", fields(4), digits(4), null],
    ["2 rows", "places-2x3", fields(2), digits(2), null],
    ["2 rows in the template of 4", "places-2x2", fields(2), digits(2), null],
    ["3 rows", "places-2x3", fields(3), digits(3), 'needs 3 rows and the template "places-2x3" has 2'],
    ["5 rows", "places-2x2", fields(5, "4307"), digits(5), 'needs 5 rows and the template "places-2x2" has 4'],
    ["a prompt of 5 characters", "places-2x2", fields(2, "43070"), digits(2), 'needs 5 characters in the prompt and the template "places-2x2" has 4'],
    ["a label of 10 characters", "places-2x2", fields(2, "43", "ten thousand"), digits(2), 'needs 12 characters in a label and the template "places-2x2" has 9'],
    ["an answer of 5 characters", "places-2x2", fields(2), digits(2, "10000"), 'needs 5 characters in an answer and the template "places-2x2" has 4'],
    ["fields in a template of equations", "facts-2x10", fields(2), digits(2), 'is a fields question and the template "facts-2x10" has no place for one'],
    ["fields in a template of brackets", "brackets-2x3", fields(2), digits(2), 'is a fields question and the template "brackets-2x3" has no place for one'],
    ["an equation in a template of fields", "places-2x2", { kind: "equation", tokens: [{ text: "5" }, { blank: "answer" }] }, wholeNumber(5), 'is an equation question and the template "places-2x2" has no place for one'],
    ["a stack in a template of fields", "places-2x3", { kind: "column", top: "24", sign: "×", bottom: "3" }, wholeNumber(72), 'is a column question and the template "places-2x3" has no place for one'],
  ])("say whether %s fits", (_name, id, face, answer, problem) => {
    const template = TEMPLATES.get(id);
    if (!template) throw new Error("no template");
    expect(fitProblem(template, face, answer)).toBe(problem);
  });

  it("take fields in no other template, and show a question of fields with its answer", () => {
    expect([...TEMPLATES.values()].filter((t) => t.faces.includes("fields")).map((t) => [t.id, t.faces])).toEqual([["places-2x2", ["fields"]], ["places-2x3", ["fields"]]]);
    expect(questionText(fields(2, "40"), { parts: [{ name: "blank-1", kind: "digit", value: "4" }, { name: "blank-2", kind: "digit", value: "0" }] })).toBe("40 tens [4] row 1 [0]");
  });
});

describe("the template of bar models", () => {
  const book = inventedBook();
  const figures = book.pages.filter((p) => p.template === "figures-1x4");
  const bar = (parts: number, size = "15"): Face => ({ kind: "figure", figure: { kind: "bar-model", parts: Array.from({ length: parts }, () => size), totalLabel: "?" }, prompt: "Total =", blank: "answer" });
  const template = TEMPLATES.get("figures-1x4");
  if (!template) throw new Error("no template");

  it("holds four questions on each side, one under the other, with one column of answer areas at the right end", () => {
    expect(figures.map((p) => [p.side, regions(p, "slot").length, new Set(regions(p, "answer").map((a) => a.rect.x)).size])).toEqual([["front", 4, 1], ["back", 4, 1]]);
    for (const side of ["front", "back"] as const) {
      const places = template.sides[side].places;
      const live = side === "front" ? 90 : 36;
      places.forEach((place, i) => {
        expect("frame" in place && place.frame.w).toBe(288);
        expect("reach" in place && place.reach.x + place.reach.w).toBe(live + 486);
        if (i > 0) expect(place.slot.y).toBe(places[i - 1].slot.y + places[i - 1].slot.h);
      });
    }
  });

  it("draws a bar for each part, side by side and of one width, with its part in the middle, then the bracket, the label of the total and the prompt", () => {
    for (const page of figures) {
      for (const item of book.items.filter((i) => i.id.startsWith(`${page.id}/`))) {
        if (item.face.kind !== "figure") throw new Error("no figure");
        const { parts } = item.face.figure;
        const [question] = page.regions.filter((g) => g.item === item.id && g.role === "question");
        const outlines = question.ink.filter((i) => i.kind === "outline").map((i) => i.rect);
        expect(outlines).toHaveLength(parts.length);
        outlines.forEach((o, i) => { expect(o.w).toBeCloseTo(288 / parts.length, 9); expect(o.x).toBeCloseTo(outlines[0].x + i * o.w, 9); expect(o.y).toBe(outlines[0].y); });
        expect(texts(question)).toEqual([...parts, "?", "Total ="]);
        const words = question.ink.filter((i) => i.kind === "text");
        // The parts stand in their line, the label of the total and the prompt in the line of the area, apart from it.
        const [area] = page.regions.filter((g) => g.item === item.id && g.role === "answer");
        for (const word of words.slice(0, parts.length)) expect(word.rect.y + word.rect.h).toBeLessThan(area.rect.y);
        for (const word of words.slice(parts.length)) expect(word.rect.y + word.rect.h / 2).toBeCloseTo(area.rect.y + area.rect.h / 2, 9);
        expect(question.ink.filter((i) => i.kind === "fill")).toHaveLength(3);
      }
    }
  });

  it("gives each question a label, a question, an answer area and its reach, and no work area", () => {
    const [front] = figures;
    expect(front.regions.filter((g) => g.item === `${front.id}/2`).map((g) => [g.id.slice(front.id.length + 1), g.role, g.part])).toEqual([["slot-2", "slot", null], ["label-2", "label", null], ["question-2", "question", null], ["answer-2", "answer", "answer"], ["reach-2", "reach", "answer"]]);
    expect(figures.flatMap((p) => regions(p, "work"))).toEqual([]);
  });

  it.each<[string, string, Face, Answer, string | null]>([
    ["2 bars", "figures-1x4", bar(2), wholeNumber(30), null],
    ["6 bars", "figures-1x4", bar(6, "99"), wholeNumber(594), null],
    ["7 bars", "figures-1x4", bar(7), wholeNumber(105), 'needs 7 bars and the template "figures-1x4" has 6'],
    ["a figure in a template of fields", "places-2x2", bar(2), wholeNumber(30), 'is a figure question and the template "places-2x2" has no place for one'],
    ["a figure in a template of stacks", "columns-2x4", bar(2), wholeNumber(30), 'is a figure question and the template "columns-2x4" has no place for one'],
    ["a figure in a template of equations", "facts-2x10", bar(2), wholeNumber(30), 'is a figure question and the template "facts-2x10" has no place for one'],
    ["an equation in the template of figures", "figures-1x4", { kind: "equation", tokens: [{ text: "5" }, { blank: "answer" }] }, wholeNumber(5), 'is an equation question and the template "figures-1x4" has no place for one'],
    ["a stack in the template of figures", "figures-1x4", { kind: "column", top: "24", sign: "×", bottom: "3" }, wholeNumber(72), 'is a column question and the template "figures-1x4" has no place for one'],
    ["fields in the template of figures", "figures-1x4", { kind: "fields", prompt: "40", rows: [{ label: "tens", blank: "tens" }] }, { parts: [{ name: "tens", kind: "digit", value: "4" }] }, 'is a fields question and the template "figures-1x4" has no place for one'],
  ])("says whether %s fits", (_name, id, face, answer, problem) => {
    const found = TEMPLATES.get(id);
    if (!found) throw new Error("no template");
    expect(fitProblem(found, face, answer)).toBe(problem);
  });

  it("takes figures in no other template, and shows a figure with its answer", () => {
    expect([...TEMPLATES.values()].filter((t) => t.faces.includes("figure")).map((t) => [t.id, t.faces])).toEqual([["figures-1x4", ["figure"]]]);
    expect(questionText(bar(3), wholeNumber(45))).toBe("15 15 15 ? Total = [45]");
    expect(needsOf(bar(4, "99"), wholeNumber(396))).toEqual({ bars: 4 });
  });
});

describe("the place of the time log", () => {
  const rectsOf = (place: ItemPlace) => Object.values(place).flatMap((value) => {
    const all = Array.isArray(value) ? value.flatMap((v: unknown) => (v && typeof v === "object" && "x" in v ? [v] : v && typeof v === "object" ? Object.values(v as object) : [])) : [value];
    return all.flatMap((v) => (v && typeof v === "object" && "x" in v && "w" in v ? [v as Rect] : v && typeof v === "object" ? Object.values(v as object).filter((o): o is Rect => !!o && typeof o === "object" && "w" in o) : []));
  });
  const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;

  it("is on the front of every template, in the band between the questions and the footer, apart from every other rectangle", () => {
    expect(TEMPLATES.size).toBe(17);
    for (const template of TEMPLATES.values()) {
      expect(template.sides.back.frame.timeLog).toBeNull();
      const { frame, places } = template.sides.front;
      const log = frame.timeLog;
      if (!log) throw new Error(`${template.id} has no time log`);
      const own = [log.rect, ...log.fields.flatMap((f) => [f.labelRect, f.box, f.reach])];
      for (const rect of own) {
        expect(rect.y, template.id).toBeGreaterThanOrEqual(698.4);
        expect(rect.y + rect.h, template.id).toBeLessThanOrEqual(738);
        expect(rect.x, template.id).toBeGreaterThanOrEqual(90);
      }
      const others = [frame.heading, frame.instruction, frame.footer, frame.qr, ...Object.values(frame.marks), ...places.flatMap(rectsOf)];
      expect(others.length, template.id).toBeGreaterThan(10);
      for (const other of others) expect(overlap(log.rect, other), `${template.id} ${JSON.stringify(other)}`).toBe(false);
    }
  });
});
