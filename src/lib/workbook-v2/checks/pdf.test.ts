import { describe, expect, it } from "vitest";
import { mathToken, wordToken, type Ink, type PageModel } from "../contract";
import { checkPdf } from "../testing/drawn-checks";
import { fillOf, pagesPdf, pdfFile, pdfPageOf, type FakePage } from "../testing/fake-pdf";
import { reportedTexts } from "../testing/fake-typesetter";
import { factsBook, goodPages } from "../testing/sample";

const pages = goodPages();
const [front] = pages;
const texts = reportedTexts(pages);
/** The problems of the front page alone, when its part of the PDF is another one. */
const problems = (change: (page: FakePage) => unknown, options?: Parameters<typeof pdfFile>[1]) => {
  const page = pdfPageOf(front);
  change(page);
  return checkPdf([front], reportedTexts([front]), pdfFile([page], options));
};
/** The first command that draws a text, an outline or a fill of the page, after the paper. */
const indexOf = ({ commands }: FakePage, sign: string) => commands.findIndex((c, i) => i > 0 && c.includes(sign));
const edit = (sign: string, from: string | RegExp, to: string) => (page: FakePage) => {
  const i = indexOf(page, sign);
  const changed = page.commands[i].replace(from, to);
  if (changed === page.commands[i]) throw new Error("no change");
  page.commands[i] = changed;
};

describe("the PDF of a book", () => {
  it("draws exactly the model", () => {
    expect(checkPdf(pages, texts, pagesPdf(pages))).toEqual([]);
    const { pages: facts } = factsBook();
    expect(checkPdf(facts, reportedTexts(facts), pagesPdf(facts))).toEqual([]);
  });

  it("draws flow text piece by piece", () => {
    const ink: Ink = { kind: "flow", rect: { x: 100, y: 100, w: 44, h: 60 }, color: "black", tokens: [wordToken("hand-woven"), mathToken("5 + 5")], size: 12, weight: 400, leading: 4 };
    const flow: PageModel = { ...front, regions: [{ ...front.regions[4], ink: [ink] }] };
    expect(checkPdf([flow], reportedTexts([flow]), pagesPdf([flow]))).toEqual([]);
    const other: PageModel = { ...flow, regions: [{ ...front.regions[4], ink: [{ ...ink, tokens: [wordToken("hand-woven"), mathToken("5 + 6")] }] }] };
    expect(checkPdf([flow], reportedTexts([flow]), pagesPdf([other]))).toEqual([expect.stringMatching(/^Page 381: the PDF draws the text "5 \+ 6" at .* and the model has the text "5 \+ 5" at/)]);
  });

  it("may hold its drawing commands packed, and kerning", () => {
    expect(problems(edit("Tm", /\[<(\w{4})(\w{4})(\w{4})/, "[<$1>20<$2>-25<$3>5<"), { packed: true })).toEqual([]);
  });

  it("may move a letter as far as the kerning of its fonts", () => {
    expect(problems(edit("Tm", /\[<(\w{4})(\w{4})(\w{4})(\w{4})(\w{4})(\w{4})(\w{4})/, "[<$1>160<$2>-30<$3>-30<$4>-30<$5>-30<$6>-30<$7>-10<"))).toEqual([]);
  });

  it.each<[string, (page: FakePage) => unknown, RegExp]>([
    ["has a page of another size", (p) => { p.w = 611; }, /^Page 381: the page of the PDF is 611 by 792 points and must be 612 by 792\.$/],
    ["is turned", (p) => { p.more = "/Rotate 90"; }, /^The PDF has a page with "Rotate", which no page of a book has\.$/],
    ["has a note on it", (p) => { p.more = "/Annots[]"; }, /^The PDF has a page with "Annots"/],
    ["is cut", (p) => { p.more = "/CropBox[0 0 300 300]"; }, /^The PDF has a page with "CropBox"/],
    ["draws a text in another place", edit("Tm", /-1 111\.5 /, "-1 112.5 "), /^Page 381: the PDF draws the text "3-20 · [^"]*" at \(112\.5, 50\) with 15 points and weight 600 and the model has the text "3-20 · [^"]*" at \(111\.5, 50\) with 15 points and weight 600\.$/],
    ["draws a text in another size", edit("Tm", " 15 Tf", " 14 Tf"), /with 14 points and weight 600 and the model has/],
    ["draws a text in another weight", edit("Tm", "/f1x", "/f0x"), /with 15 points and weight 400 and the model has/],
    ["draws another digit", edit("<0032>", "<0032>", "<0033>"), /^Page 381: the PDF draws the text "3" at .* and the model has the text "2" at/],
    ["draws a text wider than it wants", edit("Tm", "x38x15", "x37x15"), /^Page 381: the PDF draws the text "3-20 · .*" 8\.22 points wide and it wants 8\.$/],
    ["moves a letter and moves it back", edit("Tm", /\[<(\w{4})(\w{4})/, "[<$1>200<$2>-200<"), /^The PDF moves a letter 200 thousandths of its size, which no font of a book does\.$/],
    ["moves a letter the other way and back", edit("Tm", /\[<(\w{4})(\w{4})/, "[<$1>-40<$2>40<"), /^The PDF moves a letter -40 thousandths/],
    ["moves a letter in small steps", edit("Tm", /\[<(\w{4})(\w{4})/, "[<$1>100 100<$2>-30<"), /^The PDF moves a letter 200 thousandths/],
    ["moves its first letter", edit("Tm", "Tm[<", "Tm[100<"), /^The PDF moves the start of a text\.$/],
    ["moves after its last letter", edit("Tm", /\]TJ/, " 0.5]TJ"), /^The PDF moves the end of a text\.$/],
    ["moves a shape after its path", (p) => { const i = p.commands.length - 1; p.commands[i] = p.commands[i].replace(/\nf\n/, "\nq 1 0 0 -1 5 5 cm f Q\n"); }, /^The PDF has a shape that is not painted at once\.$/],
    ["leaves a text out", (p) => p.commands.splice(indexOf(p, "Tm"), 1), /^Page 381: the PDF draws the text "Multiply.*and the model has the text "3-20/],
    ["leaves the last square out", (p) => p.commands.pop(), /^Page 381: the PDF draws nothing and the model has a fill at/],
    ["draws a square more", (p) => p.commands.push(fillOf({ x: 300, y: 300, w: 1, h: 1 }, 792)), /^Page 381: the PDF draws a fill at \(300, 300, 1 by 1\) and the model has nothing\.$/],
    ["draws a thicker border", edit(" w 4 M", "0.75 w", "3 w"), /^Page 381: the PDF draws an outline of 3 at .* and the model has an outline of 0\.75 at/],
    ["draws a border in another place", edit(" w 4 M", /-1 134 /, "-1 135 "), /draws an outline of 0\.75 at \(135, 178, 72 by 42\) and the model has an outline of 0\.75 at \(134, 178, 72 by 42\)/],
    ["draws a smaller fill", (p) => { const i = p.commands.length - 1; p.commands[i] = p.commands[i].replace(/(\d+\.\d+) 0 l/, "1 0 l"); }, /the PDF draws a (fill|shape)|The PDF has a shape/],
    ["draws in grey", edit("Tm", "0 scn", "0.5 scn"), /^Page 381: the PDF draws the text "3-20[^"]*" in the grey 0\.5, which the model does not use\.$/],
    ["draws a fill in white", (p) => { const i = p.commands.length - 1; p.commands[i] = p.commands[i].replace("0 scn", "1 scn"); }, /^Page 381: the PDF draws a fill .* in the grey 1, which the model does not use\.$/],
    ["draws a border in grey", edit(" w 4 M", "0 SCN", "0.9 SCN"), /in the grey 0\.9/],
    ["has grey paper", (p) => { p.commands[0] = p.commands[0].replace("1 scn", "0.98 scn"); }, /^Page 381: the paper of the PDF is not white\.$/],
    ["has no paper", (p) => p.commands.shift(), /^Page 381: the paper of the PDF is not white\.$/],
    ["draws nothing", (p) => { p.commands = []; }, /^Page 381: the paper of the PDF is not white\.$/],
    ["turns a text", edit("Tm", "q 1 0 0 -1", "q 0 1 1 0"), /^The PDF turns, tilts or scales what it draws\.$/],
    ["scales a fill", (p) => { p.commands.push(fillOf({ x: 300, y: 300, w: 1, h: 1 }, 792).replace("q 1 0 0 -1", "q 2 0 0 -2")); }, /^The PDF turns, tilts or scales what it draws\.$/],
    ["draws a shape that is no rectangle", (p) => p.commands.push("q 1 0 0 -1 0 0 cm/c0 cs 0 scn 0 0 m 5 0 l 5 5 l\nh\nf\nQ"), /^The PDF has a shape that is not a rectangle\.$/],
    ["draws text as outlines", edit("Tm", "0 Tr", "1 Tr"), /^The PDF has the drawing command "Tr" with 1, which no page of a book has\.$/],
    ["cuts what it draws", (p) => p.commands.unshift("0 0 m 5 0 l 5 5 l 0 5 l h W n"), /^The PDF has the drawing command "W", which no page of a book has\.$/],
    ["draws a picture", (p) => p.commands.push("/x0 Do"), /^The PDF has the drawing command "Do"/],
    ["draws a colour", edit("Tm", "0 scn", "1 0 0 scn"), /^The PDF has a colour that is not a grey\.$/],
    ["has see-through ink", (p) => p.commands.push("/g0 gs"), /^The PDF has the drawing command "gs"/],
    ["has a character that it does not name", edit("<0032>", "<0032>", "<4444>"), /^The PDF has a character that it does not name\.$/],
    ["has a font that it does not name", edit("Tm", "/f1x", "/g1x"), /^The PDF has a font that it does not name\.$/],
    ["has a command with no end", (p) => p.commands.push("(abc"), /^The PDF cannot be read\.$/],
  ])("%s: the book stops", (_name, change, problem) => {
    const found = problems(change);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(problem);
  });

  it("has a colour space of more than grey: the book stops", () => {
    expect(problems(() => {}, { colours: 3 })).toEqual(["The PDF has a colour that is not a grey."]);
  });

  it("does something when it is opened: the book stops", () => {
    expect(problems(() => {}, { catalog: "/OpenAction 2 0 R" })).toEqual(['The PDF has a catalog with "OpenAction", which no page of a book has.']);
  });

  it("has pages too few, too many or in another order: the book stops", () => {
    expect(checkPdf(pages, texts, pagesPdf([front]))).toEqual(["The PDF has 1 pages and the book has 2."]);
    expect(checkPdf(pages, texts, pagesPdf([...pages, front]))).toEqual(["The PDF has 3 pages and the book has 2."]);
    expect(checkPdf(pages, texts, pagesPdf([...pages].reverse()))).toHaveLength(2);
  });

  it.each<[string, Uint8Array]>([
    ["no bytes", new Uint8Array()],
    ["text", Buffer.from("%PDF-1.7 nothing")],
    ["half of a file", pagesPdf(pages).subarray(0, 9000)],
    ["a table in another place", Buffer.from(Buffer.from(pagesPdf(pages)).toString("latin1").replace(/startxref\n\d+/, "startxref\n17"), "latin1")],
    ["a page tree with no end", Buffer.from(Buffer.from(pagesPdf(pages)).toString("latin1").replace(/Kids\[\d+ 0 R/, "Kids[2 0 R"), "latin1")],
    ["an object that is not there", Buffer.from(Buffer.from(pagesPdf(pages)).toString("latin1").replace(/Kids\[\d+ 0 R/, "Kids[999 0 R"), "latin1")],
  ])("%s is no PDF of a book", (_name, pdf) => {
    expect(checkPdf(pages, texts, pdf)).toEqual(["The PDF cannot be read."]);
  });
});
