import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mathToken, wordToken, type DrawnText, type FlowToken, type Ink, type PageModel } from "../contract";
import { checkFit } from "../testing/drawn-checks";
import { textProblem } from "./fit";
import type { PlacedText } from "./texts";
import { reportedTexts } from "../testing/fake-typesetter";
import { factsBook, goodPages } from "../testing/sample";

const pages = goodPages();
/** The report of the example pages with one change in the text at this place of the list. */
const reported = (text: string, change: (d: DrawnText) => unknown): DrawnText[] => {
  const all = structuredClone(reportedTexts(pages));
  const found = all.find((d) => d.text === text);
  if (!found) throw new Error(`no "${text}"`);
  change(found);
  return all;
};
const HEADING = "3-20 · Multiplying 2 digits by 1 digit";
const wide = (w: number) => (d: DrawnText) => { const middle = (d.start.x + d.end.x) / 2; const left = d.start.x; d.natural.w = w; d.start.x = d.text === "×" || /^\d$/.test(d.text) ? middle - w / 2 : left; d.end.x = d.start.x + w; };

describe("a text on one line", () => {
  it("fits its place on every example page", () => {
    expect(checkFit(pages, reportedTexts(pages))).toEqual([]);
    const { pages: facts } = factsBook();
    expect(checkFit(facts, reportedTexts(facts))).toEqual([]);
  });

  it.each<[string, string, (d: DrawnText) => unknown, string]>([
    ["a heading that is too wide", HEADING, wide(480), `Page 381: the text "${HEADING}" of "heading" is 480 points wide and its place is 443.`],
    ["an instruction that is too wide", "Multiply. Start with the ones.", wide(487), 'Page 381: the text "Multiply. Start with the ones." of "instruction" is 487 points wide and its place is 486.'],
    ["a label that is too wide", "1", (d) => { d.natural.w = 25; d.end.x = d.start.x + 25; }, 'Page 381: the text "1" of "label-1" is 25 points wide and its place is 24.'],
    ["a sign that is too wide for its cell", "×", wide(24.2), 'Page 381: the text "×" of "question-1" is 24.2 points wide and its place is 24.'],
    ["a text that is too high", "×", (d) => { d.natural.above = 19; }, 'Page 381: the text "×" of "question-1" is 30 points high and its place is 28.'],
    ["a text that goes too far below its line", "×", (d) => { d.natural.below = 10.5; }, 'Page 381: the text "×" of "question-1" is 29 points high and its place is 28.'],
    ["a text on two lines", HEADING, (d) => { d.end.y += 14; }, `Page 381: the text "${HEADING}" of "heading" is not on one line.`],
    ["a text that is drawn narrower than it wants", "×", (d) => { d.start.x += 2; d.end.x -= 2; }, 'Page 381: the text "×" of "question-1" is drawn 4 points wide and wants 8.'],
    ["a text that is drawn wider than it wants", "×", (d) => { d.start.x -= 2; d.end.x += 2; }, 'Page 381: the text "×" of "question-1" is drawn 12 points wide and wants 8.'],
    ["a smaller text", HEADING, (d) => { d.size = 14; }, `Page 381: the text "${HEADING}" of "heading" has the size 14 and the weight 600, and the model says 15 and 600.`],
    ["a bolder text", "×", (d) => { d.weight = 600; }, 'Page 381: the text "×" of "question-1" has the size 22 and the weight 600, and the model says 22 and 400.'],
    ["a text that is not at the left", HEADING, (d) => { d.start.x += 1; d.end.x += 1; }, `Page 381: the text "${HEADING}" of "heading" starts at (112.5, 50) and the model puts it at (111.5, 50).`],
    ["a text that is not in the middle", "×", (d) => { d.start.x -= 1; d.end.x -= 1; }, 'Page 381: the text "×" of "question-1" starts at (165, 152) and the model puts it at (166, 152).'],
    ["a text that is not at its height", "×", (d) => { d.start.y -= 1; d.end.y -= 1; }, 'Page 381: the text "×" of "question-1" starts at (166, 151) and the model puts it at (166, 152).'],
  ])("%s is a problem", (_name, text, change, problem) => {
    expect(checkFit(pages, reported(text, change))).toEqual([problem]);
  });

  it("that fits with nothing to spare is no problem", () => {
    expect(checkFit(pages, reported(HEADING, wide(443)))).toEqual([]);
    expect(checkFit(pages, reported("×", wide(24)))).toEqual([]);
    expect(checkFit(pages, reported("×", (d) => { d.natural.above = 18; d.natural.below = 10; }))).toEqual([]);
  });

  it("at the right of its place is looked at too", () => {
    const back = checkFit(pages, reported("Level 3 · Page 382", (d) => { d.start.x -= 1; d.end.x -= 1; }));
    expect(back).toEqual([expect.stringMatching(/^Page 382: the text "Level 3 · Page 382" of "footer" starts at/)]);
    expect(checkFit(pages, reported("Level 3 · Page 382", (d) => { d.natural.w = 400; d.start.x = d.end.x - 400; }))).toEqual([expect.stringMatching(/"footer" is 400 points wide and its place is 377\.4\.$/)]);
  });

  it.each<[string, (d: DrawnText) => unknown]>([
    ["a width", (d) => { d.natural.w = Number.NaN; }], ["a height", (d) => { d.natural.above = Number.NaN; }], ["a depth", (d) => { d.natural.below = Number.NaN; }], ["a height of capitals", (d) => { d.natural.capitals = Number.NaN; }],
    ["a start", (d) => { d.start.x = Number.NaN; }], ["an end", (d) => { d.end.y = Number.NaN; }], ["a size", (d) => { d.size = Number.NaN; }], ["a weight", (d) => { d.weight = Number.NaN; }],
  ])("with %s that is no number does not pass", (_name, change) => {
    expect(checkFit(pages, reported(HEADING, change))).not.toEqual([]);
  });
});

describe("flow text", () => {
  const words = (...all: string[]) => all.map(wordToken);
  const page = (tokens: FlowToken[], w = 44, h = 60): PageModel => {
    const ink: Ink = { kind: "flow", rect: { x: 100, y: 100, w, h }, color: "black", tokens, size: 12, weight: 400, leading: 4 };
    return { ...pages[0], regions: [{ id: `${pages[0].id}/question-1`, role: "question", rect: ink.rect, item: null, part: null, ink: [ink] }] };
  };
  const problems = (model: PageModel, change: (all: DrawnText[]) => unknown = () => {}) => {
    const all = reportedTexts([model]);
    change(all);
    return checkFit([model], all);
  };
  const at = (d: DrawnText, x: number, y: number) => { d.start = { x, y }; d.end = { x: x + d.natural.w, y }; };

  it("is split after each hyphen of a word, and math is not split", () => {
    expect(wordToken("twenty-one-year-old").pieces).toEqual(["twenty-", "one-", "year-", "old"]);
    expect(mathToken("12 - 5 =").pieces).toEqual(["12 - 5 ="]);
  });

  it("that wraps inside its place is no problem", () => {
    expect(problems(page([...words("Mia", "has", "twenty-one", "pens,"), mathToken("21 - 5 = 16")]))).toEqual([]);
    expect(problems(page(words("one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "more", "words"), 44, 56))).toEqual([]);
  });

  it.each<[string, FlowToken[], (all: DrawnText[]) => unknown, string]>([
    ["a word that is too wide", words("Mia", "extraordinarily"), (all) => { all[1].natural.w = 45; at(all[1], 100, 120); }, 'Page 381: the token "extraordinarily" of "question-1" is 45 points wide and its place is 44.'],
    ["a part of a word that is too wide", words("Mia", "hand-woven"), (all) => { all[2].natural.w = 45; at(all[2], 100, 120); }, 'Page 381: the token "hand-woven" of "question-1" is 45 points wide in the part "woven" and its place is 44.'],
    ["math that is too wide", [mathToken("10 + 20 + 30")], (all) => { all[0].natural.w = 50; all[0].end.y += 12; }, 'Page 381: the token "10 + 20 + 30" of "question-1" is 50 points wide and its place is 44.'],
    ["a block that is too high", words("one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "more", "words", "now", "here", "to", "make", "it", "far", "too", "high", "long"), () => {}, 'Page 381: the token "long" of "question-1" is below its place.'],
    ["a token above its place", words("one"), (all) => at(all[0], 100, 105), 'Page 381: the token "one" of "question-1" is above its place.'],
    ["a token that starts left of its place", words("one"), (all) => at(all[0], 99, 108), 'Page 381: the token "one" of "question-1" is not inside its place.'],
    ["a token that ends right of its place", words("one", "two"), (all) => at(all[1], 137, 108), 'Page 381: the token "two" of "question-1" is not inside its place.'],
    ["a token that is broken into lines", [mathToken("5 + 5")], (all) => { all[0].end.y += 12; }, 'Page 381: the token "5 + 5" of "question-1" is not on one line.'],
    ["a token that is drawn narrower", words("one"), (all) => { all[0].end.x -= 2; }, 'Page 381: the token "one" of "question-1" is drawn 6 points wide and wants 8.'],
    ["a smaller token", words("one"), (all) => { all[0].size = 9; }, 'Page 381: the token "one" of "question-1" has the size 9 and the weight 400, and the model says 12 and 400.'],
    ["a token over the one before it", words("one", "two"), (all) => at(all[1], 104, 108), 'Page 381: the token "two" of "question-1" is -4 points after the piece before it and must be 4.'],
    ["a token with more space before it", words("one", "two"), (all) => at(all[1], 112.2, 108), 'Page 381: the token "two" of "question-1" is 4.2 points after the piece before it and must be 4.'],
    ["a token with no space before it", words("one", "two"), (all) => at(all[1], 108, 108), 'Page 381: the token "two" of "question-1" is 0 points after the piece before it and must be 4.'],
    ["a gap inside a token", words("hand-woven"), (all) => at(all[1], 108.2, 108), 'Page 381: the token "hand-woven" of "question-1" is 0.2 points after the piece before it and must be 0.'],
    ["a token above the one before it", words("one", "two", "three", "four", "five"), (all) => at(all[4], 100, 108), 'Page 381: the token "five" of "question-1" is -44 points after the piece before it and must be 4.'],
    ["a line that does not start at the left", words("one", "two", "three", "four", "five"), (all) => at(all[4], 100.2, 120), 'Page 381: the token "five" of "question-1" starts a line that is not at the left.'],
    ["a line that is 0.2 points too low", words("one", "two", "three", "four", "five"), (all) => at(all[4], 100, 120.2), 'Page 381: the token "five" of "question-1" is on a line 12.2 points below the one before it and must be 12.'],
    ["a line that is 0.2 points too high", words("one", "two", "three", "four", "five"), (all) => at(all[4], 100, 119.8), 'Page 381: the token "five" of "question-1" is on a line 11.8 points below the one before it and must be 12.'],
    ["a first line that is too low", words("one", "two"), (all) => all.forEach((d) => at(d, d.start.x, 108.2)), 'Page 381: the token "one" of "question-1" does not start at the corner of its place.'],
    ["a first line that starts right of its place", words("one", "two"), (all) => all.forEach((d) => at(d, d.start.x + 0.2, 108)), 'Page 381: the token "one" of "question-1" does not start at the corner of its place.'],
    ["text that is not drawn as a flow", words("one"), (all) => { all[0].flow = null; }, 'Page 381: the token "one" of "question-1" is not flow text.'],
  ])("%s is a problem", (_name, tokens, change, problem) => {
    expect(problems(page(tokens), change)).toContain(problem);
  });

  it("with no number in its report does not pass", () => {
    for (const change of [(d: DrawnText) => { d.natural.w = Number.NaN; }, (d: DrawnText) => { d.start.x = Number.NaN; }, (d: DrawnText) => { d.start.y = Number.NaN; }, (d: DrawnText) => { d.natural.below = Number.NaN; }, (d: DrawnText) => { d.natural.above = Number.NaN; }, (d: DrawnText) => { if (d.flow) d.flow.space = Number.NaN; }]) expect(problems(page(words("one", "two")), (all) => change(all[1]))).not.toEqual([]);
  });
});

describe("the fit of any text", () => {
  const [page] = goodPages();
  /** A text of these sizes, drawn where its place and its alignment say. */
  const placed = (rect: { x: number; y: number; w: number; h: number }, align: "left" | "center" | "right", n: { w: number; capitals: number; above: number; below: number }): PlacedText => {
    const ink = { kind: "text" as const, rect, color: "black", text: "8", size: 12, weight: 400, align };
    const x = rect.x + { left: 0, center: (rect.w - n.w) / 2, right: rect.w - n.w }[align];
    const y = rect.y + (rect.h + n.capitals) / 2;
    const drawn: DrawnText = { sheet: 1, x: rect.x, y: rect.y, text: "8", size: 12, weight: 400, start: { x, y }, end: { x: x + n.w, y }, natural: n, flow: null };
    return { page, region: page.regions[4], ink, drawn };
  };
  const sizes = fc.record({ x: fc.double({ min: 0, max: 500, noNaN: true }), y: fc.double({ min: 0, max: 700, noNaN: true }), w: fc.double({ min: 1, max: 400, noNaN: true }), capitals: fc.double({ min: 1, max: 30, noNaN: true }), up: fc.double({ min: 0, max: 5, noNaN: true }), down: fc.double({ min: 0, max: 10, noNaN: true }), align: fc.constantFrom("left" as const, "center" as const, "right" as const) });
  /** The height that a text needs: its capitals in the middle, and the part that goes further from the middle. */
  const high = ({ capitals, up, down }: { capitals: number; up: number; down: number }) => 2 * Math.max(up + capitals / 2, capitals / 2 + down);

  it("fits a place of its size exactly, and not one that is smaller by more than a hundredth of a point", () => {
    fc.assert(fc.property(sizes, fc.double({ min: 0.011, max: 5, noNaN: true }), fc.boolean(), (s, less, wide) => {
      const n = { w: s.w, capitals: s.capitals, above: s.capitals + s.up, below: s.down };
      const exact = { x: s.x, y: s.y, w: s.w, h: high(s) };
      expect(textProblem(placed(exact, s.align, n))).toBeNull();
      const small = wide ? { ...exact, w: exact.w - less } : { ...exact, h: exact.h - less };
      expect(textProblem(placed(small, s.align, n))).toMatch(wide ? / points wide and its place is / : / points high and its place is /);
    }), { numRuns: 100, seed: 137 });
  });
});
