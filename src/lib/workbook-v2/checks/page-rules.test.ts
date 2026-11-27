import { describe, expect, it } from "vitest";
import { mathToken, wordToken, type BookItem, type FlowToken, type Ink, type PageModel, type Region, type RegionRole } from "../contract";
import { divisionBook, factsBook, goodBook, inventedBook, placesBook, type GoodBook } from "../testing/sample";
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
    ["one answer part named like two blanks joined with a comma", 7, (_p, items) => { items[0].answer.parts = [{ name: "blank-1,blank-2,blank-3", kind: "whole-number", value: "15" }]; }, /question 1 has the blanks blank-1, blank-2, blank-3 and the answer parts blank-1,blank-2,blank-3/],
    ["a work area on a question worked in the head", 0, (p) => { const slot = named(p, "slot-1"); p.regions.push({ id: `${p.id}/work-1`, role: "work", rect: { x: slot.rect.x + 2, y: slot.rect.y + 2, w: 10, h: 10 }, item: slot.item, part: null, ink: [] }); }, /question 1 is worked in the head and must have no "work" rectangle/],
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

describe("flow text on a page", () => {
  const problemsWith = (tokens: FlowToken[], overOther = false): string => {
    const book = goodBook();
    const question = find(book.pages[0], "question");
    const { rect } = question;
    const ink: Ink = { kind: "flow", rect: { ...rect, h: 20 }, color: "black", tokens, size: 12, weight: 400, leading: 4 };
    question.ink = overOther ? [...question.ink, ink] : [ink];
    return problemsOf(book).join("\n");
  };

  it("with good tokens breaks only the rules that this question prints something else", () => {
    expect(problemsWith([wordToken("Mia"), wordToken("hand-woven"), mathToken("12 - 5")])).toMatch(/^Page 381: question 1 prints "Mia hand-woven 12 - 5" and must print "[^"]*"\.\n(Page 381: question 1 must print [^\n]*\n)+Page 381: question 1 prints flow text that its face does not have there\.$/);
  });

  it.each<[string, FlowToken[], RegExp]>([
    ["a character that the fonts do not hold", [wordToken("二")], /"question-1" has the text "二", which the fonts cannot print/],
    ["a word that is split in another place", [{ kind: "word", pieces: ["wo", "ven"] }], /"question-1" has the token "woven", which may not be split like that/],
    ["a word that is not split after its hyphen", [{ kind: "word", pieces: ["hand-woven"] }], /the token "hand-woven", which may not be split like that/],
    ["a word with a space", [wordToken("two words")], /the token "two words", which may not be split like that/],
    ["math in two pieces", [{ kind: "math", pieces: ["5 +", " 5"] }], /the token "5 \+ 5", which may not be split like that/],
    ["math with a space at its end", [mathToken("5 + ")], /the token "5 \+ ", which may not be split like that/],
    ["an empty word", [wordToken("")], /the token "", which may not be split like that/],
    ["a token with no piece", [{ kind: "math", pieces: [] }], /the token "", which may not be split like that/],
    ["no token", [], /"question-1" has flow text with no token/],
  ])("%s is a problem", (_name, tokens, problem) => expect(problemsWith(tokens)).toMatch(problem));

  it("over other ink is a problem", () => expect(problemsWith([wordToken("Mia")], true)).toMatch(/the text "Mia" of "question-1" is over other ink/));
});

describe("a question in a bracket", () => {
  // Page 7 has brackets with a remainder and two lines of work, page 5 facts, page 14 six lines of work.
  const good = divisionBook();
  const named = (page: PageModel, name: string): Region => {
    const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  const problemsAfter = (number: number, change: (page: PageModel, items: GoodBook["items"]) => unknown): string => {
    const page = structuredClone(good.pages[number - 1]);
    const items = structuredClone(good.items.filter((i) => i.id.startsWith(`${page.id}/`)));
    change(page, items);
    return checkPage(page, items).join("\n");
  };
  /** The texts of the question: R, the number outside, the sign and the digits inside. */
  const textAt = (page: PageModel, index: number) => {
    const ink = named(page, "question-1").ink.filter((i) => i.kind === "text")[index];
    if (ink?.kind !== "text") throw new Error("no text");
    return ink;
  };
  const both = (page: PageModel, part: string, dx: number, dy: number) => ["answer", "reach"].forEach((role) => move(named(page, `${role}-1-${part}`), dx, dy));

  it("breaks no rule on any page of the example book of divisions, with full sides", () => {
    expect(good.pages.flatMap((p) => checkPage(p, good.items))).toEqual([]);
    const sides = (page: PageModel) => `${page.template} ${page.regions.filter((r) => r.role === "slot").length}`;
    expect(good.pages.filter((p) => p.side === "front").map(sides)).toEqual(["facts-2x10 20", "remainders-1x10 10", "brackets-2x6 12", "brackets-1x4 4", "brackets-2x4 8", "brackets-2x3 6", "brackets-1x3 3"]);
    expect(good.pages.filter((p) => p.side === "back").map(sides)).toEqual(["facts-2x10 20", "remainders-1x10 10", "brackets-1x4 4", "brackets-2x6 12", "brackets-2x3 6", "brackets-2x4 8", "brackets-1x3 3"]);
  });

  it("has its areas in one or two columns and in one line, and a work area with room for its lines", () => {
    for (const [i, columns] of [[2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2]]) expect(new Set(good.pages[i].regions.filter((r) => r.role === "answer").map((r) => r.rect.x)).size).toBe(columns);
    expect(good.pages[4].regions.filter((r) => r.role === "work")).toEqual([]);
    for (const page of [good.pages[12], good.pages[13]]) for (const { rect } of page.regions.filter((r) => r.role === "work")) expect(rect.h).toBeGreaterThanOrEqual(6 * 18);
  });

  it.each<[string, number, (page: PageModel, items: GoodBook["items"]) => unknown, RegExp]>([
    ["no work area", 7, (p) => { p.regions = p.regions.filter((r) => !r.id.endsWith("/work-1")); }, /question 1 has no "work" rectangle/],
    ["two work areas", 7, (p) => p.regions.push({ ...named(p, "work-1") }), /question 1 has 2 "work" rectangles/],
    ["a work area that is too low for its lines", 7, (p) => { const w = named(p, "work-1"); w.rect = { ...w.rect, h: 35 }; }, /"work-1" is 35 points high and 2 lines of work need 36/],
    ["a work area that is too low for six lines", 14, (p) => { const w = named(p, "work-3"); w.rect = { ...w.rect, h: 107 }; }, /"work-3" is 107 points high and 6 lines of work need 108/],
    ["a work area of one point", 7, (p) => { const w = named(p, "work-1"); w.rect = { ...w.rect, w: 1 }; }, /"work-1" does not stand below all digits of its question/],
    ["a work area that starts after the first digit", 7, (p) => { const w = named(p, "work-1"); w.rect = { ...w.rect, x: textAt(p, 2).rect.x + 1, w: 200 }; }, /"work-1" does not stand below all digits of its question/],
    ["a work area that ends before the last digit", 14, (p) => { const w = named(p, "work-3"); w.rect = { ...w.rect, w: 100 }; }, /"work-3" does not stand below all digits of its question/],
    ["a work area far below the question", 7, (p) => { const w = named(p, "work-1"); w.rect = { ...w.rect, y: w.rect.y + 25, h: 36 }; }, /"work-1" is not below its question/],
    ["a work area beside the question", 7, (p) => { const w = named(p, "work-1"); w.rect = { x: 400, y: w.rect.y - 60, w: 80, h: 60 }; }, /"work-1" is not below its question/],
    ["a work area in a reach", 7, (p) => { const w = named(p, "work-1"); w.rect = { ...w.rect, y: w.rect.y - 70 }; }, /"work-1" enters the reach "reach-1-quotient"/],
    ["ink in the work area", 7, (p) => named(p, "work-1").ink.push({ kind: "fill", rect: named(p, "work-1").rect, color: "black" }), /"work-1" must be empty/],
    ["a digit that is not below its area", 7, (p) => { const t = textAt(p, 4); t.rect = { ...t.rect, x: t.rect.x + 60 }; }, /question 1 must print "\d" at \([\d., ]+, 24 by 28\)/],
    ["a digit left of its area", 7, (p) => { const t = textAt(p, 3); t.rect = { ...t.rect, x: t.rect.x - 5 }; }, /question 1 must print "\d" at \([\d., ]+, 24 by 28\)/],
    ["an area far above the number", 7, (p) => [3, 4].forEach((i) => { const t = textAt(p, i); t.rect = { ...t.rect, y: t.rect.y + 13 }; }), /question 1 must print "\d" at \([\d., ]+, 24 by 28\)/],
    ["more digits inside than stand below the area", 7, (_p, [item]) => { if (item.face.kind === "bracket") item.face.inside = "1234"; }, /"answer-1-quotient" is not directly above the number in its bracket/],
    ["the area of the remainder in another line", 7, (p) => both(p, "remainder", 0, 4), /"answer-1-remainder" is not in the line of "answer-1-quotient"/],
    ["the areas in the other order", 7, (p) => { const [a, b] = ["answer-1-quotient", "answer-1-remainder"].map((n) => named(p, n)); [a.rect, b.rect] = [b.rect, a.rect]; }, /"answer-1-remainder" must come after "answer-1-quotient"/],
    ["no area of the remainder", 7, (p) => { p.regions = p.regions.filter((r) => !r.id.endsWith("/answer-1-remainder")); }, /question 1 has no "answer" rectangle for the part "remainder"/],
    ["the letter R in a reach", 7, (p) => { const t = textAt(p, 0); t.rect = { ...t.rect, x: t.rect.x - 12 }; }, /"question-1" enters the reach "reach-1-quotient"/],
    ["no letter R", 7, (p) => { textAt(p, 0).text = " "; }, /question 1 prints " \d\)\d\d" and must print "R\d\)\d\d"/],
    ["another sign", 7, (p) => { textAt(p, 2).text = "("; }, /and must print "R\d\)\d\d"/],
    ["two digits exchanged", 7, (p) => { const [a, b] = [textAt(p, 3), textAt(p, 4)]; a.text = `${a.text}${b.text}`; b.text = "1"; }, /question 1 prints/],
    ["blanks that are not the parts", 7, (_p, [item]) => { item.answer.parts.reverse(); }, /question 1 has the blanks quotient, remainder and the answer parts remainder, quotient/],
    ["a face that has no remainder", 7, (_p, [item]) => { if (item.face.kind === "bracket") item.face.above.length = 1; }, /has the blanks quotient and the answer parts quotient, remainder/],
    ["a third column of areas", 7, (p) => both(p, "remainder", 6, 0), /3 answer columns/],
    ["an area that is too narrow", 5, (p) => { const a = named(p, "answer-1"); a.rect = { ...a.rect, w: 71 }; }, /"answer-1" is 71 by 42 points and needs 72 by 42/],
  ])("%s stops the page", (_name, number, change, problem) => expect(problemsAfter(number, change)).toMatch(problem));

  it("needs no work area when it is worked in the head", () => {
    expect(problemsAfter(5, (p, [item]) => { if (item.face.kind === "bracket") item.face.workLines = 1; })).toMatch(/question 1 has no "work" rectangle/);
  });
});

describe("a question of fields", () => {
  // Page 1 has questions of 2 rows, page 3 of 3 rows and page 4 of 4 rows, two of them below another one.
  const good = placesBook();
  const named = (page: PageModel, name: string): Region => {
    const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  const problemsAfter = (number: number, change: (page: PageModel, items: GoodBook["items"]) => unknown): string => {
    const page = structuredClone(good.pages[number - 1]);
    const items = structuredClone(good.items.filter((i) => i.id.startsWith(`${page.id}/`)));
    change(page, items);
    return checkPage(page, items).join("\n");
  };
  /** The prompt is the first text of a question, then the label of each row. */
  const textAt = (page: PageModel, name: string, index: number) => {
    const ink = named(page, name).ink.filter((i) => i.kind === "text")[index];
    if (ink?.kind !== "text") throw new Error("no text");
    return ink;
  };
  const both = (page: PageModel, part: string, dx: number, dy: number) => ["answer", "reach"].forEach((role) => move(named(page, `${role}-1-${part}`), dx, dy));
  const face = (items: GoodBook["items"], number = 1) => {
    const found = items.find((i) => i.number === number)?.face;
    if (found?.kind !== "fields") throw new Error("no fields");
    return found;
  };

  it("breaks no rule on any page of the example book of place value, with full sides", () => {
    expect(good.pages.flatMap((p) => checkPage(p, good.items))).toEqual([]);
    expect(good.pages.map((p) => `${p.template} ${p.regions.filter((r) => r.role === "slot").length}`)).toEqual(["places-2x3 6", "places-2x3 6", "places-2x2 4", "places-2x2 4"]);
  });

  it.each<[string, number, (page: PageModel, items: GoodBook["items"]) => unknown, RegExp]>([
    ["an empty label", 1, (p, items) => { face(items).rows[0].label = ""; textAt(p, "question-1", 1).text = ""; }, /question 1 has an empty label in the row of "tens"/],
    ["a label of spaces", 1, (p, items) => { face(items).rows[1].label = "  "; textAt(p, "question-1", 2).text = "  "; }, /question 1 has an empty label in the row of "ones"/],
    ["an empty prompt", 1, (p, items) => { face(items).prompt = ""; textAt(p, "question-1", 0).text = ""; }, /question 1 has an empty prompt/],
    ["a label of another row", 3, (p) => { const [a, b] = [textAt(p, "question-1", 1), textAt(p, "question-1", 2)]; [a.text, b.text] = [b.text, a.text]; }, /question 1 prints "\d+tenshundredsones" and must print "\d+hundredstensones"/],
    ["a label that the face does not have", 1, (p) => { textAt(p, "question-1", 1).text = "ten"; }, /question 1 prints "\d+tenones" and must print "\d+tensones"/],
    ["a label in the reach", 1, (p) => { const t = textAt(p, "question-1", 1); t.rect = { ...t.rect, w: t.rect.w + 6 }; }, /"question-1" enters the reach "reach-1-tens"/],
    ["a label in another line than its area", 1, (p) => { const t = textAt(p, "question-1", 2); t.rect = { ...t.rect, y: t.rect.y + 4 }; }, /question 1 must print "ones" at/],
    ["a prompt far above the rows", 1, (p) => { const t = textAt(p, "question-1", 0); t.rect = { ...t.rect, y: t.rect.y - 4 }; }, /question 1 must print "\d+" at/],
    ["no line above a question below another one", 4, (p) => { const q = named(p, "question-3"); q.ink = q.ink.filter((i) => i.kind !== "fill"); }, /question 3 must print a line at/],
    ["a line above the first question", 4, (p) => { const q = named(p, "question-1"); q.ink.unshift({ kind: "fill", rect: { ...q.rect, h: 1.2 }, color: "black" }); }, /question 1 prints a line that its face does not have there/],
    ["the areas in the other order", 3, (p) => { const [a, b] = ["answer-1-hundreds", "answer-1-tens"].map((n) => named(p, n)); [a.rect, b.rect] = [b.rect, a.rect]; }, /"answer-1-tens" must come after "answer-1-hundreds"/],
    ["blanks that are not the parts", 3, (_p, [item]) => { item.answer.parts.reverse(); }, /question 1 has the blanks hundreds, tens, ones and the answer parts ones, tens, hundreds/],
    ["no area of a row", 4, (p) => { p.regions = p.regions.filter((r) => !r.id.endsWith("/answer-1-ones")); }, /question 1 has no "answer" rectangle for the part "ones"/],
    ["an area below its question", 1, (p) => both(p, "ones", 0, 60), /"answer-1-ones" is not in the line of its question/],
    ["a third column of areas", 1, (p) => both(p, "ones", -6, 0), /3 answer columns/],
    ["an area that is too narrow", 4, (p) => { const a = named(p, "answer-1-thousands"); a.rect = { ...a.rect, w: 71 }; }, /"answer-1-thousands" is 71 by 42 points and needs 72 by 42/],
    ["an area that is too low", 2, (p) => { const a = named(p, "answer-2-ones"); a.rect = { ...a.rect, h: 41 }; }, /"answer-2-ones" is 72 by 41 points and needs 72 by 42/],
    ["a reach that is too small on the left", 3, (p) => { const g = named(p, "reach-1-tens"); g.rect = { ...g.rect, x: g.rect.x + 1, w: g.rect.w - 1 }; }, /"reach-1-tens" does not leave enough space on the left of "answer-1-tens"/],
    ["a label that the fonts cannot print", 1, (p, items) => { face(items).rows[0].label = "tens✓"; textAt(p, "question-1", 1).text = "tens✓"; }, /"question-1" has the text "tens✓", which the fonts cannot print/],
    ["a label of a size that is too small", 1, (p) => { textAt(p, "question-1", 1).size = 15; }, /question 1 must print "tens" at/],
    ["a label that is aligned to the left", 1, (p) => { textAt(p, "question-1", 1).align = "left"; }, /question 1 must print "tens" at/],
    ["a prompt that is aligned to the right", 1, (p) => { textAt(p, "question-1", 0).align = "right"; }, /question 1 must print "\d+" at/],
  ])("%s stops the page", (_name, number, change, problem) => expect(problemsAfter(number, change)).toMatch(problem));
});

describe("a bar model", () => {
  // Page 3 has 2 or 3 bars, then 4 to 6; page 4 has 2 to 4 bars, then 5 or 6.
  const good = inventedBook();
  const named = (page: PageModel, name: string): Region => {
    const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  const problemsAfter = (number: number, change: (page: PageModel, items: GoodBook["items"]) => unknown): string => {
    const page = structuredClone(good.pages[number - 1]);
    const items = structuredClone(good.items.filter((i) => i.id.startsWith(`${page.id}/`)));
    change(page, items);
    return checkPage(page, items).join("\n");
  };
  const face = (items: GoodBook["items"], number = 1) => {
    const found = items.find((i) => i.number === number)?.face;
    if (found?.kind !== "figure") throw new Error("no figure");
    return found;
  };
  const inkOf = (page: PageModel, kind: Ink["kind"], index: number, name = "question-1") => {
    const ink = named(page, name).ink.filter((i) => i.kind === kind)[index];
    if (!ink) throw new Error(`no ${kind} ${index}`);
    return ink;
  };
  const textAt = (page: PageModel, index: number) => {
    const ink = inkOf(page, "text", index);
    if (ink.kind !== "text") throw new Error("no text");
    return ink;
  };
  const bars = (items: GoodBook["items"]) => face(items).figure.parts.length;

  it("breaks no rule on any page of the invented book, with full sides of one answer column", () => {
    expect(good.pages.flatMap((p) => checkPage(p, good.items))).toEqual([]);
    expect(good.pages.slice(2).map((p) => `${p.template} ${p.regions.filter((r) => r.role === "slot").length} ${new Set(p.regions.filter((r) => r.role === "answer").map((r) => r.rect.x)).size}`)).toEqual(["figures-1x4 4 1", "figures-1x4 4 1", "stories-1x3 3 1", "stories-1x3 3 1"]);
  });

  it.each<[string, number, (page: PageModel, items: GoodBook["items"]) => unknown, RegExp]>([
    ["an empty part", 3, (p, items) => { face(items).figure.parts[0] = ""; textAt(p, 0).text = ""; }, /question 1 has an empty part in bar 1/],
    ["a part of spaces", 3, (p, items) => { face(items).figure.parts[1] = "  "; textAt(p, 1).text = "  "; }, /question 1 has an empty part in bar 2/],
    ["an empty label of the total", 3, (p, items) => { const f = face(items); textAt(p, f.figure.parts.length).text = ""; f.figure.totalLabel = ""; }, /question 1 has an empty label of the total/],
    ["an empty prompt", 3, (p, items) => { const f = face(items); textAt(p, f.figure.parts.length + 1).text = ""; f.prompt = ""; }, /question 1 has an empty prompt/],
    ["a figure with no bar", 3, (p, items) => { const f = face(items); const q = named(p, "question-1"); q.ink = q.ink.slice(2 * f.figure.parts.length); f.figure.parts = []; }, /question 1 has a figure with no bar/],
    ["a bar that is wider than the others", 3, (p) => { const [one, two] = [inkOf(p, "outline", 0), inkOf(p, "outline", 1)]; one.rect = { ...one.rect, w: one.rect.w + 4 }; two.rect = { ...two.rect, x: two.rect.x + 4, w: two.rect.w - 4 }; }, /question 1 must print an outline at/],
    ["a bar with no outline", 3, (p) => { const q = named(p, "question-1"); q.ink = q.ink.filter((i) => i !== inkOf(p, "outline", 0)); }, /question 1 must print an outline at/],
    ["a bar too many", 4, (p) => { const q = named(p, "question-1"); const bar = inkOf(p, "outline", 0); q.ink.push({ ...bar, rect: { ...bar.rect, y: bar.rect.y + 0 } }); }, /question 1 prints an outline that its face does not have there/],
    ["a part in another bar", 3, (p, items) => { const t = textAt(p, 0); const w = 288 / bars(items); t.rect = { ...t.rect, x: t.rect.x + w }; }, /question 1 must print "\d+" at|over other ink/],
    ["a part on the border of its bar", 3, (p) => { const t = textAt(p, 0); t.rect = { ...t.rect, x: t.rect.x - 4, w: t.rect.w + 4 }; }, /the text "\d+" of "question-1" is over other ink/],
    ["a part at the left of its bar", 3, (p) => { textAt(p, 0).align = "left"; }, /question 1 must print "\d+" at/],
    ["no tick at the left end of the bracket", 3, (p) => { const q = named(p, "question-1"); q.ink = q.ink.filter((i) => i !== inkOf(p, "fill", 0)); }, /question 1 must print a line at/],
    ["a bracket line that is too short", 3, (p) => { const l = inkOf(p, "fill", 2); l.rect = { ...l.rect, w: l.rect.w - 10 }; }, /question 1 must print a line at/],
    ["a bracket that touches the bars", 3, (p) => { for (const i of [0, 1, 2]) { const l = inkOf(p, "fill", i); l.rect = { ...l.rect, y: l.rect.y - 4 }; } }, /question 1 must print a line at/],
    ["the label of the total at the left", 3, (p, items) => { const t = textAt(p, bars(items)); t.rect = { ...t.rect, x: t.rect.x - 100 }; }, /question 1 must print "\?" at/],
    ["the prompt at the left", 3, (p, items) => { textAt(p, bars(items) + 1).align = "left"; }, /question 1 must print "Total =" at/],
    ["the prompt in the reach", 3, (p, items) => { const t = textAt(p, bars(items) + 1); t.rect = { ...t.rect, w: t.rect.w + 6 }; }, /"question-1" enters the reach "reach-1"|must print "Total =" at/],
    ["the bars in the line of the total", 3, (p, items) => { for (let i = 0; i < bars(items); i++) { const [o, t] = [inkOf(p, "outline", i), textAt(p, i)]; o.rect = { ...o.rect, y: o.rect.y + 50 }; t.rect = { ...t.rect, y: t.rect.y + 50 }; } }, /question 1 must print an outline at/],
    ["an area that is too narrow", 3, (p) => { const a = named(p, "answer-1"); a.rect = { ...a.rect, w: 71 }; a.ink = [{ ...a.ink[0], rect: a.rect }]; }, /"answer-1" is 71 by 42 points and needs 72 by 42/],
    ["an area out of the column of the others", 3, (p) => { for (const n of ["answer-2", "reach-2"]) move(named(p, n), -6, 0); }, /there are 2 answer columns and the limit is 1/],
    ["a whole question shifted left into a second answer column", 3, (p) => { for (const n of ["answer-2", "reach-2", "question-2"]) move(named(p, n), -8, 0); }, /there are 2 answer columns and the limit is 1/],
    ["a work area on a bar model", 3, (p) => { const slot = named(p, "slot-1"); p.regions.push({ id: `${p.id}/work-1`, role: "work", rect: { x: slot.rect.x + 2, y: slot.rect.y + 2, w: 10, h: 10 }, item: slot.item, part: null, ink: [] }); }, /question 1 is worked in the head and must have no "work" rectangle/],
    ["a bar part containing the row separator", 3, (p, items) => { face(items).figure.parts[0] = "19 | 19"; textAt(p, 0).text = "19 | 19"; }, /question 1 has "\|" in bar 1/],
    ["a total label containing the row separator", 3, (p, items) => { const f = face(items); f.figure.totalLabel = "? | ?"; textAt(p, f.figure.parts.length).text = "? | ?"; }, /question 1 has "\|" in the label of the total/],
    ["a prompt containing the row separator", 3, (p, items) => { const f = face(items); f.prompt = "Total | ="; textAt(p, f.figure.parts.length + 1).text = "Total | ="; }, /question 1 has "\|" in the prompt/],
    ["a label of the question beside the total", 3, (p) => move(named(p, "label-1"), 0, 60), /question 1: its label is at/],
    ["a part that the fonts cannot print", 3, (p, items) => { face(items).figure.parts[0] = "1✓"; textAt(p, 0).text = "1✓"; }, /"question-1" has the text "1✓", which the fonts cannot print/],
  ])("%s stops the page", (_name, number, change, problem) => expect(problemsAfter(number, change)).toMatch(problem));
});

describe("the time log", () => {
  // Sheet 1 of the invented book starts a day; sheet 2 does not.
  const good = inventedBook();
  const [first, back, other] = good.pages;
  const log = (page: PageModel) => page.regions.find((r) => r.role === "capture");
  const problemsAfter = (page: PageModel, change: (page: PageModel) => unknown): string => {
    const changed = structuredClone(page);
    change(changed);
    return checkPage(changed, good.items).join("\n");
  };
  const labelOf = (page: PageModel, index: number) => {
    const ink = log(page)!.ink.filter((i) => i.kind === "text")[index];
    if (ink?.kind !== "text") throw new Error("no label");
    return ink;
  };
  const boxOf = (page: PageModel, index: number) => log(page)!.ink.filter((i) => i.kind === "outline")[index];
  /** The time log of the first page, put on another page with the names of that page. */
  const copyTo = (page: PageModel) => {
    const capture = first.captures[0];
    const id = `${page.id}/time-log`;
    page.captures = [{ ...structuredClone(capture), id }];
    page.regions.push({ ...structuredClone(log(first)!), id });
  };

  it("is on the front page of the first sheet of a day only, with a start and a finish box", () => {
    expect(good.pages.map((p) => p.captures.length)).toEqual([1, 0, 0, 0, 1, 0]);
    expect(first.captures).toEqual([{ id: `${first.id}/time-log`, kind: "time-log", rect: { x: 111.5, y: 700, w: 256, h: 36 }, fields: [
      { name: "start", rect: { x: 158.5, y: 705, w: 72, h: 26 }, reach: { x: 153.5, y: 700, w: 82, h: 36 } },
      { name: "finish", rect: { x: 290.5, y: 705, w: 72, h: 26 }, reach: { x: 285.5, y: 700, w: 82, h: 36 } },
    ] }]);
    expect(log(first)?.ink.map((i) => (i.kind === "text" ? i.text : i.kind))).toEqual(["Start", "outline", "Finish", "outline"]);
    expect(log(first)).toMatchObject({ id: `${first.id}/time-log`, role: "capture", item: null, part: null });
  });

  it("is never an answer: no item, no answer area and no answer column holds it", () => {
    const columns = (page: PageModel) => new Set(page.regions.filter((r) => r.role === "answer").map((r) => r.rect.x)).size;
    expect(columns(first)).toBe(columns(back));
    expect(JSON.stringify(good.items)).not.toMatch(/time-log|Start|Finish/);
    expect(first.regions.filter((r) => r.role === "answer" || r.role === "reach").some((r) => r.id.includes("time-log"))).toBe(false);
  });

  it.each<[string, PageModel, (p: PageModel) => unknown, RegExp]>([
    ["a time log on a back page", back, copyTo, /a back page has no time log/],
    ["a time log on a front page that does not start a day passes", other, copyTo, /^$/],
    ["two time logs", first, (p) => { p.captures.push({ ...p.captures[0], id: `${p.id}/time-log-2` }); }, /the page has 2 captures and may have one time log/],
    ["a capture of another kind", first, (p) => { (p.captures[0] as { kind: string }).kind = "score"; }, /the time log has the kind "score"/],
    ["a capture with another id", first, (p) => { p.captures[0].id = `${p.id}/times`; }, /the time log is named ".*\/times" and must be named ".*\/time-log"/],
    ["the fields in the other order", first, (p) => p.captures[0].fields.reverse(), /the time log has the fields finish, start and must have start, finish, in this order/],
    ["one field named start,finish in the spine zone", first, (p) => { p.captures[0].fields = [{ name: "start,finish", rect: { x: 10, y: 705, w: 72, h: 26 }, reach: { x: 5, y: 700, w: 82, h: 36 } }]; }, /the time log has the fields start,finish and must have start, finish, in this order[^]*the time log has the box "start" at \(10,/],
    ["no finish field", first, (p) => p.captures[0].fields.pop(), /the time log has the fields start and must have start, finish/],
    ["a box that is not where the capture says", first, (p) => { const b = boxOf(p, 0); b.rect = { ...b.rect, x: b.rect.x + 1 }; }, /the time log must print an outline in \(158\.5, 705, 72 by 26\)/],
    ["a capture that is not where the box is", first, (p) => { const f = p.captures[0].fields[1]; f.rect = { ...f.rect, y: f.rect.y + 1 }; }, /the time log has the box "finish" at .* and it must be at \(290\.5, 705, 72 by 26\)/],
    ["a reach that is too small", first, (p) => { const f = p.captures[0].fields[0]; f.reach = { ...f.reach, w: f.reach.w - 2 }; }, /the time log has the clear space of "start" at/],
    ["no box", first, (p) => { log(p)!.ink = log(p)!.ink.filter((i) => i.kind !== "outline"); }, /the time log must print an outline in/],
    ["the labels in the other order", first, (p) => { const [a, b] = [labelOf(p, 0), labelOf(p, 1)]; [a.text, b.text] = [b.text, a.text]; }, /the time log prints "Finish", "Start" and must print "Start", "Finish"/],
    ["the label rectangles swapped while keeping ink order", first, (p) => { const [a, b] = [labelOf(p, 0), labelOf(p, 1)]; [a.rect, b.rect] = [b.rect, a.rect]; }, /the time log must print a text of 11 points and weight 600 at the right in \(111\.5, 705, 40 by 26\) saying "Start"/],
    ["a label of another size", first, (p) => { labelOf(p, 1).size = 12; }, /the time log must print a text of 11 points and weight 600 at the right in/],
    ["a label at the left", first, (p) => { labelOf(p, 0).align = "left"; }, /the time log must print a text of 11 points/],
    ["a mark in a box", first, (p) => { log(p)!.ink.push({ kind: "fill", rect: { x: 170, y: 712, w: 4, h: 4 }, color: "black" }); }, /the time log prints a line that it does not have there/],
    ["a label in the clear space of a box", first, (p) => { const t = labelOf(p, 1); t.rect = { ...t.rect, x: t.rect.x - 12 }; }, /the time log must print a text of 11 points and weight 600 at the right in \(243\.5, 705, 40 by 26\)/],
    ["a time log that is moved up into the questions", first, (p) => { const r = log(p)!; r.rect = { ...r.rect, y: r.rect.y - 60 }; r.ink = r.ink.map((i) => ({ ...i, rect: { ...i.rect, y: i.rect.y - 60 } })); }, /the time log is at \(111\.5, 640, 256 by 36\) and must be at \(111\.5, 700, 256 by 36\)/],
    ["a time log in the spine zone", first, (p) => move(log(p)!, -30, 0), /"time-log" enters the spine zone/],
    ["a time log over the QR code", first, (p) => move(log(p)!, 200, 0), /"time-log" and "qr" overlap|"qr" and "time-log" overlap/],
    ["a time log with no capture", first, (p) => { p.captures = []; }, /time-log prints a capture that the page does not have/],
    ["a capture with no rectangle", first, (p) => { p.regions = p.regions.filter((r) => r.role !== "capture"); }, /the time log has no rectangle that prints it/],
    ["a time log that belongs to a question", first, (p) => { log(p)!.item = `${p.id}/1`; }, /"time-log" must belong to no question/],
  ])("%s", (name, page, change, problem) => {
    const found = problemsAfter(page, change);
    if (name.endsWith("passes")) expect(found).toBe("");
    else expect(found).toMatch(problem);
  });
});

describe("what a question prints", () => {
  // One question of each form of a face: the first one on each template, the forms with a blank in another place, and a
  // sequence that stands below another one.
  const books = [goodBook(), factsBook(), divisionBook(), placesBook(), inventedBook()];
  const formOf = ({ face }: BookItem) => (face.kind === "column" || face.kind === "story" ? face.kind : face.kind === "fields" ? "fields" : face.kind === "figure" ? `figure ${face.figure.parts.length < 4 ? "of few" : "of many"} bars` : `${face.kind} ${(face.kind === "bracket" ? face.above : face.tokens).map((t) => ("text" in t ? "t" : "_")).join("")}`);
  const linesOf = (page: PageModel, item: BookItem) => page.regions.find((r) => r.item === item.id && r.role === "question")!.ink.filter((i) => i.kind === "fill").length;
  const cases = new Map(books.flatMap(({ pages, items }) => pages.flatMap((page) => items.filter((i) => i.id.startsWith(`${page.id}/`)).map((item) => [`${page.template}, ${formOf(item)}, ${linesOf(page, item)} lines`, { page, item }] as const))).reverse());

  it("is looked at for each face, with and without its line", () => {
    const names = [...cases.keys()];
    expect(new Set([...cases.values()].map(({ item }) => item.face.kind))).toEqual(new Set(["column", "equation", "sequence", "bracket", "fields", "figure", "story"]));
    expect(names.filter((n) => n.startsWith("stories-1x3"))).toEqual(["stories-1x3, story, 0 lines"]);
    expect(names.filter((n) => n.startsWith("figures-1x4"))).toEqual(expect.arrayContaining(["figures-1x4, figure of few bars, 3 lines", "figures-1x4, figure of many bars, 3 lines"]));
    expect(names.filter((n) => n.startsWith("column") || n.startsWith("bracket")).every((n) => n.endsWith("1 lines"))).toBe(true);
    expect(["0 lines", "1 lines"].map((end) => names.some((n) => n.startsWith("sequences-2x2") && n.endsWith(end)))).toEqual([true, true]);
    expect(names).toEqual(expect.arrayContaining(["blanks-1x10, equation _tttt, 0 lines", "blanks-1x10, equation tt_tt, 0 lines", "remainders-1x10, equation tttt_t_, 0 lines", "brackets-1x3, bracket _t_, 1 lines", "brackets-2x6, bracket _, 1 lines",
      "places-2x3, fields, 0 lines", "places-2x3, fields, 1 lines", "places-2x2, fields, 0 lines", "places-2x2, fields, 1 lines"]));
  });

  /** Each change of one printed part. A change that leaves the part as it is gives null. */
  const CHANGES: readonly [string, (ink: Ink) => Ink | null][] = [
    ...([["right", 1, 0], ["left", -1, 0], ["down", 0, 1], ["up", 0, -1]] as const).map(([way, dx, dy]): [string, (ink: Ink) => Ink] => [`moved ${way}`, (ink) => ({ ...ink, rect: { ...ink.rect, x: ink.rect.x + dx, y: ink.rect.y + dy } })]),
    ["shorter on the right", (ink) => ({ ...ink, rect: { ...ink.rect, w: ink.rect.w - 1 } })],
    ["shorter on the left", (ink) => ({ ...ink, rect: { ...ink.rect, x: ink.rect.x + 1, w: ink.rect.w - 1 } })],
    ["thinner", (ink) => ({ ...ink, rect: { ...ink.rect, h: ink.rect.h - 0.6 } })],
    ["longer", (ink) => ({ ...ink, rect: { ...ink.rect, w: ink.rect.w + 1 } })],
    ...[0, -22, 15.9, Number.NaN, 30.1].map((size): [string, (ink: Ink) => Ink | null] => [`in size ${size}`, (ink) => (ink.kind === "text" ? { ...ink, size } : null)]),
    ["with a character less", (ink) => (ink.kind === "text" ? { ...ink, text: ink.text.slice(0, -1) } : null)],
    ["of another kind", (ink) => (ink.kind === "fill" ? { kind: "outline", rect: ink.rect, color: ink.color, width: 0.75 } : null)],
  ];

  /** The frame of both sides: the rectangle, and the page. */
  const FRAME = [0, 1].flatMap((index) => ["mark-tl", "mark-tr", "mark-br", "mark-bl", "heading", "instruction", "footer"].map((name): [string, string, PageModel] => [goodBook().pages[index].side, name, goodBook().pages[index]]));
  const MORE: typeof CHANGES = [
    ["in another size", (ink) => (ink.kind === "text" ? { ...ink, size: ink.size + 1 } : null)],
    ["in another weight", (ink) => (ink.kind === "text" ? { ...ink, weight: ink.weight === 600 ? 400 : 600 } : null)],
    ["at another end", (ink) => (ink.kind === "text" ? { ...ink, align: ink.align === "left" ? "right" : "left" } : null)],
  ];
  /** The changes of the ink of one rectangle that pass. */
  const passing = (page: PageModel, id: string, items: BookItem[]): string[] => {
    const after = (change: (ink: Ink[]) => Ink[]) => checkPage({ ...page, regions: page.regions.map((r) => (r.id === id ? { ...r, ink: change([...r.ink]) } : r)) }, items);
    const own = page.regions.find((r) => r.id === id)!;
    expect(after((ink) => ink)).toEqual([]);
    return own.ink.flatMap((ink, at) => [
      ...[...CHANGES, ...MORE].flatMap(([name, change]) => { const changed = change(ink); return changed && after((all) => all.with(at, changed)).length === 0 ? [`${name}: ${JSON.stringify(ink)}`] : []; }),
      ...(after((all) => all.toSpliced(at, 1)).length === 0 ? [`removed: ${JSON.stringify(ink)}`] : []),
      ...(after((all) => [...all, ink]).length === 0 ? [`twice: ${JSON.stringify(ink)}`] : []),
    ]);
  };

  it.each(FRAME)("is looked at in the frame too: %s, %s", (_side, name, page) => {
    const { items } = goodBook();
    expect(passing(page, `${page.id}/${name}`, items)).toEqual([]);
    // The whole rectangle in another place, or in another size, with its ink.
    for (const change of [(r: Region) => move(r, 1, 0), (r: Region) => move(r, 0, -1), (r: Region) => { r.rect = { ...r.rect, w: r.rect.w + 1 }; }]) {
      const changed = structuredClone(page);
      change(changed.regions.find((r) => r.id === `${page.id}/${name}`)!);
      expect(checkPage(changed, items)).not.toEqual([]);
    }
  });

  it("has all texts of an equation at most a little before its area", () => {
    const { pages, items } = factsBook();
    const after = (dx: number) => checkPage({ ...pages[0], regions: pages[0].regions.map((r) => (r.id.endsWith("/question-1") ? { ...r, rect: { ...r.rect, x: r.rect.x + dx }, ink: r.ink.map((i) => ({ ...i, rect: { ...i.rect, x: i.rect.x + dx } })) } : r)) }, items).filter((p) => p.includes("question 1 must print"));
    expect(after(0)).toEqual([]);
    for (const dx of [-1, -3, 2.5]) expect(after(dx).length).toBe(4);
  });

  it.each([...cases])("has its number beside its first line: %s", (_name, { page, item }) => {
    const items = books.flatMap((b) => b.items).filter((i) => i.id.startsWith(`${page.id}/`));
    const label = page.regions.find((r) => r.item === item.id && r.role === "label")!;
    expect(passing(page, label.id, items)).toEqual([]);
    for (const [dx, dy] of [[0, 4], [0, -4], [1, 0]]) {
      const changed = structuredClone(page);
      move(changed.regions.find((r) => r.id === label.id)!, dx, dy);
      expect(checkPage(changed, items).join()).toMatch(/its label is at/);
    }
  });

  it.each<[string, (p: PageModel) => unknown, RegExp]>([
    ["a scan mark with no ink", (p) => { find(p, "scan-mark", 1).ink = []; }, /^Page 381: the scan mark "mark-tr" must print a line in \(562\.5, 36, 13\.5 by 2\)\.$/m],
    ["a scan mark with one line", (p) => { find(p, "scan-mark").ink.pop(); }, /the scan mark "mark-tl" must print a line in \(90, 36, 2 by 13\.5\)/],
    ["a scan mark that is turned", (p) => { const r = find(p, "scan-mark"); r.ink[0].rect = { ...r.ink[0].rect, y: r.rect.y + r.rect.h - 2 }; }, /the scan mark "mark-tl" prints a line that it does not have there/],
    ["a heading of size 0", (p) => { const [ink] = find(p, "heading").ink; if (ink.kind === "text") ink.size = 0; }, /^Page 381: the heading must print a text of 15 points and weight 600 at the left in \(111\.5, 36, 443 by 20\)\.$/m],
    ["an instruction that is drawn as a flow", (p) => { const r = find(p, "instruction"); r.ink = [{ kind: "flow", rect: r.rect, color: "black", tokens: p.instruction.split(" ").map(wordToken), size: 12, weight: 400, leading: 4 }]; }, /the instruction prints flow text that it does not have there/],
    ["a label in another place of its slot", (p) => move(find(p, "label"), 0, 100), /^Page 381: question 1: its label is at \(90, 206, 24 by 28\) and must be at \(90, 106, 24 by 28\)\.$/m],
  ])("%s is a problem", (_name, change, problem) => {
    const book = goodBook();
    change(book.pages[0]);
    expect(problemsOf(book).join("\n")).toMatch(problem);
  });

  it.each([...cases])("must be there, at its place, in its size: %s", (_name, { page: good, item }) => {
    const items = books.flatMap((b) => b.items).filter((i) => i.id.startsWith(`${good.id}/`));
    const after = (change: (ink: Ink[]) => Ink[]): string[] => checkPage({ ...good, regions: good.regions.map((r) => (r.item === item.id && r.role === "question" ? { ...r, ink: change([...r.ink]) } : r)) }, items);
    const own = good.regions.find((r) => r.item === item.id && r.role === "question")!;
    expect(after((ink) => ink)).toEqual([]);
    const passed = own.ink.flatMap((ink, at) => [
      ...CHANGES.flatMap(([name, change]) => { const changed = change(ink); return changed && after((all) => all.with(at, changed)).length === 0 ? [`${name}: ${JSON.stringify(ink)}`] : []; }),
      ...(after((all) => all.toSpliced(at, 1)).length === 0 ? [`removed: ${JSON.stringify(ink)}`] : []),
      ...(after((all) => [...all, ink]).length === 0 ? [`twice: ${JSON.stringify(ink)}`] : []),
    ]);
    expect(passed).toEqual([]);
    // Two texts of one size that change places, in the same order of the ink.
    const texts = own.ink.flatMap((ink, at) => (ink.kind === "text" ? [{ ink, at }] : []));
    for (const [i, one] of texts.entries()) for (const two of texts.slice(i + 1)) {
      if (one.ink.text === two.ink.text || one.ink.rect.w !== two.ink.rect.w || one.ink.rect.h !== two.ink.rect.h) continue;
      expect(after((all) => all.with(one.at, { ...one.ink, rect: two.ink.rect }).with(two.at, { ...two.ink, rect: one.ink.rect }))).not.toEqual([]);
    }
    const { x, y, w } = own.rect;
    expect(after((all) => [...all, { kind: "fill", rect: { x, y, w, h: 0.1 }, color: "black" }]).join()).toMatch(/prints a line that its face does not have there/);
  });
});

describe("the work area of a stack", () => {
  it.each<[string, (w: Region) => unknown]>([["one point wide", (w) => { w.rect = { ...w.rect, w: 1 }; }], ["one point high", (w) => { w.rect = { ...w.rect, h: 1 }; }], ["a little too narrow", (w) => { w.rect = { ...w.rect, w: 37.9 }; }], ["a little too low", (w) => { w.rect = { ...w.rect, h: 139.9 }; }]])("may not be %s", (_name, change) => {
    const book = goodBook();
    change(find(book.pages[0], "work"));
    expect(problemsOf(book).join()).toMatch(/"work-1" is [\d.]+ by [\d.]+ points and needs 38 by 140/);
  });
});
