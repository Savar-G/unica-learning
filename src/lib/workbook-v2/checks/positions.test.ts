import { describe, expect, it } from "vitest";
import type { DrawnText, Position } from "../contract";
import { goodPages } from "../testing/sample";
import { checkPositions, checkTexts } from "./positions";

const pages = goodPages();
const reported = (): Position[] => pages.flatMap((p, i) => p.regions.map((g) => ({ id: g.id, sheet: i + 1, rect: { ...g.rect } })));

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
  const drawn = (): DrawnText[] => pages.flatMap((p, i) => p.regions.flatMap((r) => r.ink.flatMap((ink) => (ink.kind === "text" ? [{ sheet: i + 1, x: ink.rect.x, y: ink.rect.y, text: ink.text }] : []))));
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
    ["text that the model does not hold", [...drawn(), { sheet: 1, x: 300, y: 700, text: "72" }], /"72" on page 1 of the file is not in the model/],
    ["a text twice", [...drawn(), drawn()[0]], /is not in the model/],
    ["text with no place", change({ x: Number.NaN }), /was not drawn at its place/],
  ])("%s is a problem", (_name, texts, problem) => {
    expect(checkTexts(pages, texts).join("\n")).toMatch(problem);
  });
});
