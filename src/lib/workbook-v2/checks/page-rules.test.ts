import { describe, expect, it } from "vitest";
import type { Ink, PageModel, Region, RegionRole } from "../contract";
import { factsBook, goodBook, type GoodBook } from "../testing/sample";
import { checkPage } from "./page-rules";

const find = (page: PageModel, role: RegionRole, index = 0): Region => {
  const region = page.regions.filter((r) => r.role === role)[index];
  if (!region) throw new Error(`no ${role} ${index}`);
  return region;
};
const move = (region: Region, dx: number, dy: number) => {
  region.rect = { ...region.rect, x: region.rect.x + dx, y: region.rect.y + dy };
  region.ink = region.ink.map((i): Ink => ({ ...i, rect: { ...i.rect, x: i.rect.x + dx, y: i.rect.y + dy } }));
};
const sayInstead = (region: Region, text: string) => {
  region.ink = region.ink.map((i): Ink => (i.kind === "text" ? { ...i, text } : i));
};
const remove = (page: PageModel, role: RegionRole) => { page.regions = page.regions.filter((r) => r.role !== role); };
const problemsOf = (book: GoodBook, index = 0) => checkPage(book.pages[index], book.items);

it("the pages of the example book break no rule", () => {
  const book = goodBook();
  expect(book.pages.flatMap((p) => checkPage(p, book.items))).toEqual([]);
});

describe("a page that breaks a rule", () => {
  it.each<[string, (p: PageModel) => unknown, RegExp]>([
    ["an answer area in the spine zone", (p) => move(find(p, "answer"), -60, 0), /"answer-1" enters the spine zone/],
    ["a scan mark in the spine zone", (p) => move(find(p, "scan-mark"), -10, 0), /"mark-tl" enters the spine zone/],
    ["a work area in the outer margin", (p) => move(find(p, "work", 1), 1, 0), /"work-2" enters the 0.5 inch outer margin/],
    ["a heading in the top margin", (p) => move(find(p, "heading"), 0, -1), /"heading" enters the 0.5 inch outer margin/],
    ["a QR code in the bottom margin", (p) => move(find(p, "qr"), 0, 2), /"qr" enters the 0.5 inch outer margin/],
    ["two answer areas on top of each other", (p) => { find(p, "answer", 2).rect = { ...find(p, "answer").rect }; }, /"answer-1" and "answer-3" overlap/],
    ["a heading over the instruction", (p) => move(find(p, "instruction"), 0, -10), /"heading" and "instruction" overlap/],
    ["a QR code over a scan mark", (p) => move(find(p, "qr"), 12, 0), /"qr" and "mark-br" overlap|"mark-br" and "qr" overlap/],
    ["two slots on top of each other", (p) => move(find(p, "slot", 2), 0, -20), /"slot-1" and "slot-3" overlap/],
    ["a slot over the instruction", (p) => move(find(p, "slot"), 0, -20), /"slot-1" and "instruction" overlap|"instruction" and "slot-1" overlap/],
    ["a part outside its slot", (p) => move(find(p, "label"), 0, -16), /"label-1" is not inside "slot-1"/],
    ["ink outside its rectangle", (p) => { const i = find(p, "question").ink[0]; i.rect = { ...i.rect, y: i.rect.y - 5 }; }, /ink of "question-1" is outside it/],
    ["a work area inside a reach", (p) => move(find(p, "work"), -10, 0), /"work-1" enters the reach "reach-1"/],
    ["a question inside a reach", (p) => move(find(p, "question"), 0, 4), /"question-1" enters the reach "reach-1"/],
    ["a reach that is too small on the right", (p) => { const g = find(p, "reach"); g.rect = { ...g.rect, w: g.rect.w - 1 }; }, /"reach-1" does not leave enough space on the right of "answer-1"/],
    ["a reach that is too small on the left", (p) => { const g = find(p, "reach"); g.rect = { ...g.rect, x: g.rect.x + 1, w: g.rect.w - 1 }; }, /"reach-1" does not leave enough space on the left of "answer-1"/],
    ["a reach that is too small above", (p) => { const g = find(p, "reach"); g.rect = { ...g.rect, y: g.rect.y + 1, h: g.rect.h - 1 }; }, /"reach-1" does not leave enough space above "answer-1"/],
    ["a reach that is too small below", (p) => { const g = find(p, "reach"); g.rect = { ...g.rect, h: g.rect.h - 1 }; }, /"reach-1" does not leave enough space below "answer-1"/],
    ["an answer area out of its column", (p) => { move(find(p, "answer", 2), 3, 0); move(find(p, "reach", 2), 3, 0); }, /3 answer columns/],
    ["an answer area of another width", (p) => { const g = find(p, "answer", 2); g.rect = { ...g.rect, w: 70 }; }, /"answer-3" is 70 by 42 points and needs 72 by 42/],
    ["an answer area that is too low", (p) => { const g = find(p, "answer"); g.rect = { ...g.rect, h: 41 }; }, /"answer-1" is 72 by 41 points and needs 72 by 42/],
    ["an answer area far from its question", (p) => { move(find(p, "answer"), 0, 8); move(find(p, "reach"), 0, 8); move(find(p, "question"), 0, -14); }, /"answer-1" is not directly below its question/],
    ["an answer area with no question above it", (p) => { p.regions = p.regions.filter((g) => g.id !== find(p, "question").id); }, /question 1 has no "question" rectangle/],
    ["no work area", (p) => remove(p, "work"), /question 1 has no "work" rectangle/],
    ["a question that prints other numbers", (p) => { const i = find(p, "question").ink[0]; if (i.kind === "text") i.text = i.text === "1" ? "2" : "1"; }, /question 1 prints/],
    ["a question number that is wrong", (p) => sayInstead(find(p, "label"), "9"), /question 1 has the label "9"/],
    ["a printed answer", (p) => { const g = find(p, "answer"); g.ink.push({ kind: "text", rect: g.rect, color: "black", text: "72", size: 12, weight: 400, align: "center" }); }, /"answer-1" must be empty/],
    ["a character that the fonts do not hold", (p) => sayInstead(find(p, "label"), "二"), /"label-1" has the text "二", which the fonts cannot print/],
    ["a fraction sign that is not in the list", (p) => { p.topicTitle = "Adding ⅓"; sayInstead(find(p, "heading"), "3-20 · Adding ⅓"); }, /"heading" has the text "3-20 · Adding ⅓", which the fonts cannot print/],
    ["a digit over another digit", (p) => { const { ink } = find(p, "question"); ink[0].rect = { ...ink[1].rect }; }, /the text ".*" of "question-1" is over other ink/],
    ["a digit over the line", (p) => { const { ink } = find(p, "question"); ink[4].rect = { ...ink[4].rect, y: ink[3].rect.y }; }, /the text ".*" of "question-1" is over other ink/],
    ["no heading", (p) => remove(p, "heading"), /there must be one heading, not 0/],
    ["a heading with no topic code", (p) => sayInstead(find(p, "heading"), "Multiplying 2 digits by 1 digit"), /the heading must be "3-20 · Multiplying 2 digits by 1 digit"/],
    ["a heading at the bottom", (p) => { const g = find(p, "heading"); g.rect = { ...g.rect, y: 668 }; }, /the heading must be above/],
    ["no instruction", (p) => remove(p, "instruction"), /there must be one instruction, not 0/],
    ["a long instruction", (p) => { p.instruction = "x".repeat(61); sayInstead(find(p, "instruction"), p.instruction); }, /the instruction has 61 characters and the limit is 60/],
    ["an instruction on two lines", (p) => { const g = find(p, "instruction"); g.rect = { ...g.rect, h: 26 }; }, /the instruction must be one line/],
    ["an instruction below a question", (p) => { const g = find(p, "instruction"); g.rect = { ...g.rect, y: 670 }; }, /the instruction must be above/],
    ["no footer", (p) => remove(p, "footer"), /there must be one footer, not 0/],
    ["a footer with no level", (p) => sayInstead(find(p, "footer"), "Page 381"), /the footer must be "Level 3 · Page 381"/],
    ["a footer at the top", (p) => { const g = find(p, "footer"); g.rect = { ...g.rect, y: 20 }; }, /the footer must be below/],
    ["an even page number on a front", (p) => { p.page = 382; sayInstead(find(p, "footer"), "Level 3 · Page 382"); }, /a front page must have an odd number/],
    ["no QR code", (p) => remove(p, "qr"), /there must be one qr, not 0/],
    ["a QR code in the inner corner", (p) => move(find(p, "qr"), -380, 0), /the QR code must be in the bottom right corner/],
    ["a QR code at the top", (p) => move(find(p, "qr"), 0, -600), /the QR code must be in the bottom right corner/],
    ["a QR code that is too small", (p) => { const g = find(p, "qr"); g.rect = { x: g.rect.x + 15, y: g.rect.y + 15, w: 42.6, h: 42.6 }; }, /the QR code is smaller than 0.6 inch/],
    ["a QR code with no squares", (p) => { find(p, "qr").ink = []; }, /the QR code has no squares/],
    ["three scan marks", (p) => { p.regions = p.regions.filter((g) => g.id !== find(p, "scan-mark").id); }, /the scan marks must be mark-tl, mark-tr, mark-br, mark-bl/],
    ["a scan mark out of its corner", (p) => move(find(p, "scan-mark", 2), -3, 0), /"mark-br" is not in its corner/],
    ["coloured ink", (p) => { find(p, "answer").ink[0].color = "red"; }, /"answer-1" has ink that is not black/],
    ["a template page of another size", (p) => { p.size = { w: 595, h: 842 }; }, /the paper must be 612 by 792 points/],
  ])("%s", (_name, breakPage, problem) => {
    const book = goodBook();
    const [front] = book.pages;
    breakPage(front);
    const problems = problemsOf(book);
    expect(problems.join("\n")).toMatch(problem);
    expect(problems.every((p) => p.startsWith("Page 38"))).toBe(true);
  });

  it.each<[string, (p: PageModel) => unknown, RegExp]>([
    ["content in the spine zone, which is on the right", (p) => move(find(p, "work", 1), 1, 0), /"work-2" enters the spine zone/],
    ["content in the outer margin, which is on the left", (p) => move(find(p, "label"), -1, 0), /"label-1" enters the 0.5 inch outer margin/],
    ["a QR code in the bottom right corner", (p) => move(find(p, "qr"), 380, 0), /the QR code must be in the bottom left corner/],
    ["an odd page number", (p) => { p.page = 383; }, /a back page must have an even number/],
  ])("on the back: %s", (_name, breakPage, problem) => {
    const book = goodBook();
    breakPage(book.pages[1]);
    expect(problemsOf(book, 1).join("\n")).toMatch(problem);
  });
});

describe("a question with blanks", () => {
  // Page 8 has four sequences, and the first one has three blanks. Page 6 has a blank inside each line, page 1 one at the end.
  const good = factsBook();
  type Change = (page: PageModel, items: GoodBook["items"]) => unknown;
  const problemsAfter = (index: number, change: Change): string => {
    const { pages, items } = structuredClone(good);
    change(pages[index], items.filter((i) => i.id.startsWith(`${pages[index].id}/`)));
    return checkPage(pages[index], items).join("\n");
  };
  const named = (page: PageModel, name: string): Region => {
    const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  const drop = (page: PageModel, name: string) => { page.regions = page.regions.filter((r) => !r.id.endsWith(`/${name}`)); };
  const exchange = (page: PageModel, one: string, two: string) => {
    const [a, b] = [named(page, one), named(page, two)];
    [a.rect, b.rect, a.ink, b.ink] = [b.rect, a.rect, b.ink, a.ink];
  };
  const write = (region: Region, text: string) => region.ink.push({ kind: "text", rect: region.rect, color: "black", text, size: 12, weight: 400, align: "center" });

  it("breaks no rule on any page of the example book of facts, with full sides", () => {
    expect(good.pages.flatMap((p) => checkPage(p, good.items))).toEqual([]);
    expect(good.pages.map((p) => [p.template, p.regions.filter((r) => r.role === "slot").length])).toEqual([
      ["facts-2x10", 20], ["facts-2x10", 20], ["facts-2x10", 20], ["facts-2x10", 20], ["sums-1x10", 10], ["blanks-1x10", 10], ["blanks-1x10", 10], ["sequences-2x2", 4], ["sequences-2x1", 2], ["sequences-2x1", 2],
    ]);
    expect(good.items.find((i) => i.id === `${good.pages[7].id}/1`)?.answer.parts.map((p) => p.name)).toEqual(["blank-1", "blank-2", "blank-3"]);
  });

  it.each<[string, number, Change, RegExp]>([
    ["a part with no answer area", 7, (p) => drop(p, "answer-1-blank-2"), /question 1 has no "answer" rectangle for the part "blank-2"/],
    ["a part with no reach", 7, (p) => drop(p, "reach-1-blank-2"), /question 1 has no "reach" rectangle for the part "blank-2"/],
    ["two parts with one area", 7, (p) => { named(p, "answer-1-blank-2").rect = { ...named(p, "answer-1-blank-1").rect }; }, /"answer-1-blank-1" and "answer-1-blank-2" overlap/],
    ["two areas for one part", 7, (p) => { named(p, "answer-1-blank-2").part = "blank-1"; }, /question 1 has 2 "answer" rectangles for the part "blank-1"/],
    ["areas in another order than the parts", 7, (p) => { exchange(p, "answer-1-blank-1", "answer-1-blank-2"); exchange(p, "reach-1-blank-1", "reach-1-blank-2"); }, /"answer-1-blank-2" must come after "answer-1-blank-1"/],
    ["parts in another order than the blanks", 7, (_p, items) => items[0].answer.parts.reverse(), /question 1 has the blanks blank-1, blank-2, blank-3 and the answer parts blank-3, blank-2, blank-1/],
    ["a part too many", 7, (_p, items) => items[0].answer.parts.push({ name: "blank-4", kind: "whole-number", value: "5" }), /question 1 has no "answer" rectangle for the part "blank-4"/],
    ["two parts with one name", 7, (_p, items) => { items[0].answer.parts[1].name = "blank-1"; }, /question 1 has two answer parts with one name/],
    ["no part", 0, (_p, items) => { items[0].answer.parts = []; }, /question 1 has no answer part/],
    ["an area of no part", 7, (p) => { named(p, "answer-1-blank-2").part = null; }, /"answer-1-blank-2" belongs to no answer part/],
    ["a whole answer of no question", 7, (p) => p.regions.push({ id: `${p.id}/answer-9`, role: "answer", rect: { x: 300, y: 702, w: 72, h: 20 }, item: null, part: "ghost", ink: [] }), /"answer-9" belongs to no question of this page/],
    ["a reach of no question", 7, (p) => p.regions.push({ id: `${p.id}/reach-9`, role: "reach", rect: { x: 300, y: 702, w: 72, h: 20 }, item: null, part: "ghost", ink: [] }), /"reach-9" belongs to no question of this page/],
    ["a label of no question", 7, (p) => { named(p, "label-1").item = null; }, /"label-1" belongs to no question of this page/],
    ["a work area of a question on another page", 7, (p) => { const label = named(p, "label-1"); p.regions.push({ ...label, id: `${p.id}/work-1`, role: "work", item: "x", ink: [], rect: { x: 300, y: 702, w: 72, h: 20 } }); }, /"work-1" belongs to no question of this page/],
    ["a footer that belongs to a question", 7, (p, items) => { named(p, "footer").item = items[0].id; }, /"footer" must belong to no question/],
    ["a heading with a part", 7, (p) => { named(p, "heading").part = "answer"; }, /"heading" must belong to no question/],
    ["an area with the id of another page", 7, (p) => { const area = named(p, "answer-1-blank-2"); area.id = `foreign/${area.id}`; }, /"foreign\/[^"]*\/answer-1-blank-2" must be named "missing-numbers\/1\/back\/answer-1-blank-2"/],
    ["a label with the id of another page", 7, (p) => { named(p, "label-1").id = "other/label-1"; }, /"other\/label-1" must be named "missing-numbers\/1\/back\/label-1"/],
    ["a heading with the id of another page", 7, (p) => { named(p, "heading").id = "other/heading"; }, /"other\/heading" must be named "missing-numbers\/1\/back\/heading"/],
    ["an answer area with no outline", 7, (p) => { named(p, "answer-1-blank-2").ink = []; }, /"answer-1-blank-2" must have one outline, which is its rectangle/],
    ["an answer area of a line with no outline", 0, (p) => { named(p, "answer-1").ink = []; }, /"answer-1" must have one outline, which is its rectangle/],
    ["an answer area with two outlines", 5, (p) => { const { ink } = named(p, "answer-1"); ink.push(structuredClone(ink[0])); }, /"answer-1" must have one outline, which is its rectangle/],
    ["an outline that is smaller than its area", 5, (p) => { const [line] = named(p, "answer-1").ink; line.rect = { ...line.rect, w: line.rect.w - 2 }; }, /"answer-1" must have one outline, which is its rectangle/],
    ["a thin outline", 5, (p) => { const [line] = named(p, "answer-1").ink; if (line.kind === "outline") line.width = 0.1; }, /"answer-1" must have one outline, which is its rectangle/],
    ["an area of a part that is not there", 7, (p) => { named(p, "reach-1-blank-2").part = "quotient"; }, /"reach-1-blank-2" belongs to the answer part "quotient"/],
    ["a question with a part", 7, (p) => { named(p, "question-1").part = "blank-1"; }, /"question-1" belongs to the answer part "blank-1"/],
    ["an area with the name of another part", 7, (p) => { const area = named(p, "answer-1-blank-2"); area.id = area.id.replace("blank-2", "blank-9"); }, /answer-1-blank-9" must be named "missing-numbers\/1\/back\/answer-1-blank-2"/],
    ["an area whose name does not say its part", 7, (p) => { const area = named(p, "answer-1-blank-2"); area.id = area.id.replace("-blank-2", ""); }, /\/answer-1" must be named "missing-numbers\/1\/back\/answer-1-blank-2"/],
    ["two rectangles with one name", 7, (p) => { named(p, "answer-1-blank-2").id = named(p, "answer-1-blank-1").id; }, /two rectangles are named "answer-1-blank-1"/],
    ["an answer area in the reach of another blank", 7, (p) => { const area = named(p, "answer-1-blank-2"); area.rect = { ...area.rect, y: area.rect.y - 12 }; }, /"answer-1-blank-2" enters the reach "reach-1-blank-1"/],
    ["a reach over another reach", 7, (p) => { const reach = named(p, "reach-1-blank-1"); reach.rect = { ...reach.rect, h: reach.rect.h + 2 }; }, /"reach-1-blank-\d" enters the reach "reach-1-blank-\d"/],
    ["a term over a reach", 7, (p) => { const term = named(p, "question-1").ink.find((i) => i.kind === "text" && i.text === "10"); if (term) term.rect = { ...term.rect, y: term.rect.y + 20 }; }, /"question-1" enters the reach "reach-1-blank-1"|"question-1" and "answer-1-blank-1" overlap/],
    ["a number over a reach inside a line", 5, (p) => { const { ink } = named(p, "question-1"); ink[1].rect = { ...ink[1].rect, x: ink[1].rect.x + 4 }; }, /"question-1" enters the reach "reach-1"/],
    ["an answer in a blank", 7, (p) => write(named(p, "answer-1-blank-2"), "20"), /"answer-1-blank-2" must be empty/],
    ["an answer in the blank of a line", 5, (p) => write(named(p, "answer-1"), "1"), /"answer-1" must be empty/],
    ["an answer area that is too small for its own part", 7, (_p, items) => { items[0].answer.parts[1].value = "123456"; }, /"answer-1-blank-2" is 72 by 42 points and needs 100\.8 by 42/],
    ["a reach that is too small", 5, (p) => { const reach = named(p, "reach-1"); reach.rect = { ...reach.rect, w: reach.rect.w - 1 }; }, /"reach-1" does not leave enough space on the right of "answer-1"/],
    ["an answer area below its line", 0, (p) => { for (const name of ["answer-1", "reach-1"]) move(named(p, name), 0, 30); }, /"answer-1" is not in the line of its question/],
    ["an answer area far after its line", 0, (p) => { const question = named(p, "question-1"); question.rect = { ...question.rect, w: question.rect.w - 6 }; question.ink = question.ink.slice(0, 3); }, /"answer-1" is not in the line of its question/],
    ["an answer area before its line", 0, (p) => { const [question, answer] = [named(p, "question-1"), named(p, "answer-1")]; question.rect = { ...question.rect, x: answer.rect.x + answer.rect.w + 4, w: 10 }; question.ink = []; }, /"answer-1" is not in the line of its question/],
    ["three columns of blanks", 7, (p) => { for (const name of ["answer-1-blank-3", "reach-1-blank-3"]) move(named(p, name), 5, 0); }, /there are 3 answer columns and the limit is 2/],
    ["a question that prints another sign", 0, (p) => { const ink = named(p, "question-1").ink[1]; if (ink.kind === "text") ink.text = "+"; }, /question 1 prints "5\+1=" and must print "5×1="/],
    ["a blank that the face does not have", 0, (_p, items) => { items[0].face = { kind: "equation", tokens: [{ text: "5" }, { text: "×" }, { text: "1" }, { text: "=" }] }; }, /question 1 has the blanks  and the answer parts answer/],
  ])("%s", (_name, index, change, problem) => {
    expect(problemsAfter(index, change)).toMatch(problem);
  });

  it("is the same in a stack: one outline, which is the rectangle of the area", () => {
    const book = goodBook();
    find(book.pages[0], "answer").ink = [];
    expect(problemsOf(book)).toEqual(['Page 381: "answer-1" must have one outline, which is its rectangle.']);
  });

  it("is the same in a stack: one area with the name of no other part", () => {
    const book = goodBook();
    find(book.pages[0], "answer").part = "quotient";
    expect(problemsOf(book).join("\n")).toMatch(/question 1 has no "answer" rectangle for the part "answer"[^]*"answer-1" belongs to the answer part "quotient"/);
  });
});
