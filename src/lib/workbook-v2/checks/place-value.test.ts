import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import type { DrawnText } from "../contract";
import addSubBook from "../fixtures/book-add-sub.json";
import addSubSnapshot from "../fixtures/snapshot-add-sub.json";
import { checkPlaces } from "../testing/drawn-checks";
import { reportedTexts } from "../testing/fake-typesetter";
import { divisionBook, factsBook, goodBook } from "../testing/sample";

const book = goodBook();
const first = book.items[0].face;
if (first.kind !== "column") throw new Error("not a stack");
const { top, sign, bottom } = first;
const CELL = 24;
/** The texts of question 1: the top digits, the sign and the bottom digits. The fourth text of the page is the first one. */
const START = 3;
const problems = (change: (own: DrawnText[]) => unknown, at = book): string[] => {
  const texts = reportedTexts(at.pages);
  change(texts.slice(START, START + top.length + 1 + bottom.length));
  return checkPlaces(at.pages, at.items, texts);
};
const shift = (d: DrawnText, cells: number) => { d.start.x += cells * CELL; d.end.x += cells * CELL; };

it("the example question is a number of two digits times one digit", () => {
  expect([top.length, sign, bottom.length]).toEqual([2, "×", 1]);
});

it("each digit of the example pages stands in its place, in stacks of two to five places", () => {
  expect(problems(() => {})).toEqual([]);
  const plan = planBook({ snapshot: addSubSnapshot, book: addSubBook });
  if (!plan.ok) throw new Error(plan.problems.join("\n"));
  expect(new Set(plan.pages.map((p) => p.template))).toEqual(new Set(["columns-2x4", "columns-2x4-wide"]));
  expect(checkPlaces(plan.pages, plan.items, reportedTexts(plan.pages))).toEqual([]);
  const facts = factsBook();
  expect(checkPlaces(facts.pages, facts.items, reportedTexts(facts.pages))).toEqual([]);
});

it("a digit may be 1.5% of a place away from its middle", () => expect(problems((own) => shift(own[3], 0.015))).toEqual([]));

describe("a digit in another place stops the book", () => {
  it.each<[string, (own: DrawnText[]) => unknown, string]>([
    ["the ones of the lower number under the tens", (own) => { shift(own[3], -1); shift(own[2], -1); }, `Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands in the tens.`],
    ["the sign in another place", (own) => shift(own[2], -1), `Page 381: question 1 must have "${sign}" of its line 2 in the tens, and it stands in the hundreds.`],
    ["the top number one place to the left", (own) => { shift(own[0], -1); shift(own[1], -1); }, `Page 381: question 1 must have "${top[0]}" of its line 1 in the tens, and it stands in the hundreds.`],
    ["the whole stack one place to the left", (own) => own.forEach((d) => shift(d, -1)), `Page 381: question 1 must have "${top[1]}" of its line 1 in the ones, and it stands in the tens.`],
    ["a digit between two places", (own) => shift(own[3], -0.2), `Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands between two places.`],
    ["a digit 2.5% of a place away from its middle", (own) => shift(own[3], 0.025), `Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands between two places.`],
    ["a digit right of the ones", (own) => shift(own[3], 1), `Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands between two places.`],
    ["a digit with no place", (own) => { own[3].start.x = Number.NaN; }, `Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands between two places.`],
    ["two digits in each other's place", (own) => { shift(own[0], 1); shift(own[1], -1); }, `Page 381: question 1 must have "${top[0]}" of its line 1 in the tens, and it stands in the ones.`],
    ["a digit of the lower number in the line above", (own) => { own[3].start.y -= 28; own[3].end.y -= 28; }, "Page 381: question 1 must have its 4 digits and signs in 2 lines, with each line level."],
    ["a digit that is not level with its line", (own) => { own[1].start.y += 3; }, "Page 381: question 1 must have its 4 digits and signs in 2 lines, with each line level."],
    ["the lower number above the top one", (own) => { for (const d of own.slice(2)) d.start.y -= 56; }, "Page 381: question 1 must have its 4 digits and signs in 2 lines, with each line level."],
  ])("%s", (_name, change, problem) => {
    expect(problems(change)).toContain(problem);
  });

  it("also when the model has it there", () => {
    const wrong = structuredClone(book);
    const ink = wrong.pages[0].regions.find((r) => r.id.endsWith("/question-1"))?.ink ?? [];
    for (const i of ink.slice(2, 4)) i.rect.x -= CELL;
    expect(checkPlaces(wrong.pages, wrong.items, reportedTexts(wrong.pages))).toContain(`Page 381: question 1 must have "${bottom}" of its line 2 in the ones, and it stands in the tens.`);
  });

  it("and a stack with cells of two widths, or with two digits in one text", () => {
    const widths = structuredClone(book);
    const ink = widths.pages[0].regions.find((r) => r.id.endsWith("/question-1"))?.ink ?? [];
    ink[0].rect = { ...ink[0].rect, w: 20 };
    expect(checkPlaces(widths.pages, widths.items, reportedTexts(widths.pages))).toContain("Page 381: question 1 must have cells of one width.");
    const joined = structuredClone(book);
    const region = joined.pages[0].regions.find((r) => r.id.endsWith("/question-1"));
    const one = region?.ink[1];
    if (!region || one?.kind !== "text") throw new Error("no digit");
    one.text = top;
    region.ink.splice(0, 1);
    expect(checkPlaces(joined.pages, joined.items, reportedTexts(joined.pages))).toContain("Page 381: question 1 must have its 4 digits and signs in 2 lines, with each line level.");
  });

  it("and a stack of which a digit was not drawn", () => {
    const texts = reportedTexts(book.pages);
    texts.splice(START + 3, 1);
    expect(checkPlaces(book.pages, book.items, texts)).toContain("Page 381: question 1 must have its 4 digits and signs in 2 lines, with each line level.");
  });
});

describe("a bracket", () => {
  const division = divisionBook();
  // Page 7 has brackets with a remainder: R, the number outside, the sign and two digits inside. Page 14 has three digits.
  const [seventh, last] = [division.pages[6], division.pages[13]];
  const changed = (page: typeof seventh, change: (own: DrawnText[]) => unknown): string[] => {
    const sheet = division.pages.indexOf(page) + 1;
    const texts = reportedTexts(division.pages);
    const region = page.regions.find((r) => r.id.endsWith("/question-1"));
    const ink = region?.ink.filter((i) => i.kind === "text") ?? [];
    change(ink.map((i) => { const found = texts.find((t) => t.sheet === sheet && t.x === i.rect.x && t.y === i.rect.y); if (!found) throw new Error("no text"); return found; }));
    return checkPlaces(division.pages, division.items, texts);
  };
  const faceOf = (page: typeof seventh) => { const item = division.items.find((i) => i.id === `${page.id}/1`); if (item?.face.kind !== "bracket") throw new Error("no bracket"); return item.face; };
  const [two, three] = [faceOf(seventh), faceOf(last)];

  it("has each digit of its number inside under its place of the area, on every page with brackets", () => {
    expect([two.inside.length, two.above.length, three.inside.length]).toEqual([2, 3, 3]);
    expect(changed(seventh, () => {})).toEqual([]);
  });

  const PAGE = `Page ${seventh.page}: question 1`;
  it.each<[string, (own: DrawnText[]) => unknown, string]>([
    ["the tens under the ones", (own) => shift(own[3], 1), `${PAGE} must have "${two.inside[0]}" of its number inside in the tens, and it stands in the ones.`],
    ["the ones under another place", (own) => shift(own[4], 1), `${PAGE} must have "${two.inside[1]}" of its number inside in the ones, and it stands between two places.`],
    ["the number one place to the left", (own) => { shift(own[3], -1); shift(own[4], -1); }, `${PAGE} must have "${two.inside[1]}" of its number inside in the ones, and it stands in the tens.`],
    ["a digit between two places", (own) => shift(own[4], 0.025), `${PAGE} must have "${two.inside[1]}" of its number inside in the ones, and it stands between two places.`],
    ["a digit with no place", (own) => { own[4].start.x = Number.NaN; }, `${PAGE} must have "${two.inside[1]}" of its number inside in the ones, and it stands between two places.`],
    ["two digits in each other's place", (own) => { shift(own[3], 1); shift(own[4], -1); }, `${PAGE} must have "${two.inside[0]}" of its number inside in the tens, and it stands in the ones.`],
    ["a digit that is not level", (own) => { own[3].start.y += 3; }, `${PAGE} must have "${two.outside}" and the 2 digits of "${two.inside}" in one line below its answer area.`],
    ["the number outside in another line", (own) => { own[1].start.y += 3; }, `${PAGE} must have "${two.outside}" and the 2 digits of "${two.inside}" in one line below its answer area.`],
    ["the number outside over the sign", (own) => shift(own[1], 0.5), `${PAGE} must have "${two.outside}", then ")", left of its number inside.`],
    ["the sign over the first digit", (own) => shift(own[2], 0.5), `${PAGE} must have "${two.outside}", then ")", left of its number inside.`],
    ["the sign left of its place", (own) => shift(own[2], -0.5), `${PAGE} must have "${two.outside}", then ")", left of its number inside.`],
    ["the numbers in the answer area", (own) => { for (const d of own.slice(1)) { d.start.y -= 40; d.end.y -= 40; } }, `${PAGE} must have its number inside below its answer area.`],
  ])("%s stops the book", (_name, change, problem) => expect(changed(seventh, change)).toContain(problem));

  it("with three digits stops the book when one stands under another place", () => {
    expect(changed(last, (own) => shift(own.at(-3)!, 1))).toContain(`Page ${last.page}: question 1 must have "${three.inside[0]}" of its number inside in the hundreds, and it stands in the tens.`);
  });

  it("stops the book when the area above is moved, also when the model has it there", () => {
    const wrong = structuredClone(division);
    for (const r of wrong.pages[6].regions) if (r.item === `${seventh.id}/1` && r.part === "quotient") r.rect = { ...r.rect, x: r.rect.x + CELL };
    expect(checkPlaces(wrong.pages, wrong.items, reportedTexts(wrong.pages))).toContain(`${PAGE} must have "${two.inside[1]}" of its number inside in the ones, and it stands in the tens.`);
  });

  it("stops the book with no area, or with a digit that was not drawn", () => {
    const none = structuredClone(division);
    none.pages[6].regions = none.pages[6].regions.filter((r) => !r.id.endsWith("/answer-1-quotient"));
    expect(checkPlaces(none.pages, none.items, reportedTexts(none.pages))).toContain(`${PAGE} must have "${two.outside}" and the 2 digits of "${two.inside}" in one line below its answer area.`);
    const texts = reportedTexts(division.pages).filter((t) => !(t.sheet === 7 && t.text === two.inside[1]));
    expect(checkPlaces(division.pages, division.items, texts).join("\n")).toContain(`${PAGE} must have "${two.outside}" and the 2 digits`);
  });
});
