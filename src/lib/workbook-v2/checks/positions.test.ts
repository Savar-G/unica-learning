import { describe, expect, it } from "vitest";
import { mathToken, wordToken, type DrawnText, type PageModel, type Position } from "../contract";
import { checkTexts } from "../testing/drawn-checks";
import { reportedPositions, reportedTexts } from "../testing/fake-typesetter";
import { goodPages } from "../testing/sample";
import { checkPositions } from "./positions";

const pages = goodPages();
const reported = (): Position[] => reportedPositions(pages);

describe("the positions that the typesetter reports", () => {
  it("equal the model", () => {
    expect(checkPositions(pages, reported())).toEqual([]);
  });

  it("may differ by less than a hundredth of a point", () => {
    const list = reported();
    list[0].rect.x += 0.009;
    expect(checkPositions(pages, list)).toEqual([]);
  });

  it.each<[string, (list: Position[]) => Position[], RegExp]>([
    ["moved right", (l) => { l[3].rect.x += 0.02; return l; }, /is at \(.*\) and the model puts it at/],
    ["moved down", (l) => { l[3].rect.y += 0.02; return l; }, /is at \(.*\) and the model puts it at/],
    ["wider", (l) => { l[3].rect.w += 0.02; return l; }, /is at \(.*\) and the model puts it at/],
    ["taller", (l) => { l[3].rect.h += 0.02; return l; }, /is at \(.*\) and the model puts it at/],
    ["on another page", (l) => { l[3].sheet = 2; return l; }, /is on page 2 of the file and the model puts it on page 1/],
    ["not drawn", (l) => l.slice(1), /was not drawn/],
    ["drawn twice", (l) => [...l, l[0]], /was drawn twice/],
    ["not in the model", (l) => [...l, { ...l[0], id: "stray" }], /"stray" is not in the model/],
    ["not a number", (l) => { l[3].rect.x = Number.NaN; return l; }, /is at \(.*\) and the model puts it at/],
  ])("a rectangle that is %s is a problem", (_name, change, problem) => {
    expect(checkPositions(pages, change(reported())).join("\n")).toMatch(problem);
  });
});

describe("the text that the typesetter reports", () => {
  const drawn = (): DrawnText[] => reportedTexts(pages);
  const change = (text: Partial<DrawnText>) => drawn().map((d, i) => (i === 3 ? { ...d, ...text } : d));

  it("equals the model", () => {
    expect(drawn().length).toBeGreaterThan(80);
    expect(checkTexts(pages, drawn())).toEqual([]);
    expect(checkTexts(pages, drawn().reverse())).toEqual([]);
  });

  it.each<[string, DrawnText[], RegExp]>([
    ["other digits", change({ text: "77" }), /prints ".*" and the typesetter drew "77"/],
    ["text in another place", change({ x: 0 }), /was not drawn at its place/],
    ["text on another page", change({ sheet: 2 }), /was not drawn at its place/],
    ["text left out", drawn().slice(1), /was not drawn at its place/],
    ["text that the model does not hold", [...drawn(), { ...drawn()[0], x: 300, y: 700, text: "72" }], /"72" on page 1 of the file is not in the model/],
    ["a text twice", [...drawn(), drawn()[0]], /is not in the model/],
    ["text with no place", change({ x: Number.NaN }), /was not drawn at its place/],
  ])("%s is a problem", (_name, texts, problem) => {
    expect(checkTexts(pages, texts).join("\n")).toMatch(problem);
  });

  const flow: PageModel = { ...pages[0], regions: [pages[0].regions[4], { ...pages[0].regions[5], ink: [{ kind: "flow", rect: pages[0].regions[5].rect, color: "black", tokens: [wordToken("Mia"), wordToken("hand-woven"), mathToken("5 + 5")], size: 12, weight: 400, leading: 4 }] }] };
  it.each<[string, (all: DrawnText[]) => unknown, boolean]>([
    ["as the model says", () => {}, true],
    ["with a piece left out", (all) => all.splice(2, 1), false],
    ["with a piece more", (all) => all.push(all[1]), false],
    ["with another piece", (all) => { all[4] = { ...all[4], text: "5 + 6" }; }, false],
    ["with two pieces in each other's place", (all) => all.splice(2, 2, all[3], all[2]), false],
    ["with a word that is broken in another place", (all) => all.splice(1, 1, { ...all[1], text: "Mi" }, { ...all[1], text: "a" }), false],
  ])("flow text %s", (_name, edit, good) => {
    const all = reportedTexts([flow]);
    edit(all);
    expect(checkTexts([flow], all).length === 0).toBe(good);
  });
});
