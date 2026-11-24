import { describe, expect, it } from "vitest";
import type { Ink, PageModel, Region, RegionRole } from "../contract";
import { goodBook, type GoodBook } from "../testing/sample";
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
