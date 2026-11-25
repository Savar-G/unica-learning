import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PRINT_RULES, type PageModel, type Rect, type Region } from "../contract";
import { drawPage, paint, paintSmooth, toColourPng, toPng, type Canvas } from "../testing/raster";
import { factsBook, goodPages } from "../testing/sample";
import { flatGrey, inkOutside, strayInk } from "./blank";
import { checkImages } from "./images";
import { readPageImage, type PageImage } from "./page-image";

const pages = goodPages();
const [front, back] = pages;
const facts = factsBook().pages;
const named = (page: PageModel, name: string): Region => {
  const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const imageOf = ({ width, height, grey }: Canvas): PageImage => ({ width, height, low: grey, colour: null });
/** Where a page has ink that its model does not have, when a rectangle is painted on it. */
const placesWith = (page: PageModel, rect: Rect, value = 0): string[] => {
  const canvas = drawPage(page);
  paintSmooth(canvas, rect, value);
  return strayInk(page, imageOf(canvas)).map((s) => s.place);
};
const square = (x: number, y: number, side = 1): Rect => ({ x, y, w: side, h: side });
const middle = ({ x, y, w, h }: Rect): Rect => square(x + w / 2, y + h / 2);

it("the example pages have no ink but that of their models", () => {
  for (const page of [...pages, ...facts]) expect(strayInk(page, imageOf(drawPage(page)))).toEqual([]);
});

describe("a black square of one point", () => {
  const { x, y, w, h } = named(front, "answer-1").rect;
  const reach = named(front, "reach-1").rect;
  const qr = named(front, "qr").rect;
  it.each<[string, PageModel, Rect, string]>([
    ["in an answer area", front, square(x + w / 2, y + h / 2), '"answer-1"'],
    ["in an answer area, at its border", front, square(x + PRINT_RULES.answer.outline / 2, y + PRINT_RULES.answer.outline / 2), '"answer-1"'],
    ["in an answer area, at the other corner", front, square(x + w - PRINT_RULES.answer.outline / 2 - 1, y + h - PRINT_RULES.answer.outline / 2 - 1), '"answer-1"'],
    ["in a reach, on the left", front, square(reach.x, y + 5), '"reach-1"'],
    ["in a reach, on the right", front, square(reach.x + reach.w - 1, y + 5), '"reach-1"'],
    ["in a reach, beside the border of the answer area", front, square(x + w + PRINT_RULES.answer.outline / 2, y + 5), '"reach-1"'],
    ["in a reach, above", front, square(x + 5, reach.y + 5), '"reach-1"'],
    ["in a reach, below", front, square(x + 5, reach.y + reach.h - 1), '"reach-1"'],
    ["in a work area", front, middle(named(front, "work-3").rect), '"work-3"'],
    ["in the spine zone of a front page", front, square(40, 400), "the spine zone"],
    ["at the inner edge of the spine zone", front, square(89, 400), "the spine zone"],
    ["in the spine zone of a back page", back, square(612 - 89, 400), "the spine zone"],
    ["in the outer margin of a front page", front, square(612 - 36, 400), "the margin"],
    ["in the outer margin of a back page", back, square(35, 400), "the margin"],
    ["in the top margin", front, square(300, 35), "the margin"],
    ["in the bottom margin", front, square(300, 756), "the margin"],
    ["at the corner of the paper", front, square(0, 0), "the spine zone"],
    ["in the quiet zone of the QR code", front, square(qr.x + 1, qr.y + 20), '"qr"'],
    ["at the corner of the quiet zone of the QR code", front, square(qr.x + qr.w - 1, qr.y), '"qr"'],
    ["in the slot of a question", front, square(named(front, "slot-1").rect.x + 1, named(front, "slot-1").rect.y + 1), '"slot-1"'],
    ["beside a digit of a question", front, square(named(front, "question-1").rect.x + 4, named(front, "question-1").rect.y + 4), '"question-1"'],
    ["between two questions", front, square(330, 400), "no rectangle of the page"],
    ["beside a scan mark", front, square(named(front, "mark-tl").rect.x + 6, named(front, "mark-tl").rect.y + 6), '"mark-tl"'],
    ["in an answer area in a line", facts[0], middle(named(facts[0], "answer-7").rect), '"answer-7"'],
    ["in an answer area of a ladder", facts[8], middle(named(facts[8], "answer-1-blank-2").rect), '"answer-1-blank-2"'],
    ["in the reach of a ladder", facts[8], square(named(facts[8], "reach-1-blank-2").rect.x + 1, named(facts[8], "reach-1-blank-2").rect.y + 1), '"reach-1-blank-2"'],
  ])("%s is found", (_name, page, rect, place) => {
    // A pixel on an edge has its middle on one side of it, so the square can be in the place beside it too.
    const places = placesWith(page, rect);
    expect(places).toContain(place);
    expect(places.length).toBeLessThanOrEqual(2);
  });

  it("is found at each place of each zone, also when it is as light as ink can be", () => {
    const zones = (page: PageModel) => page.regions.filter((r) => ["answer", "reach", "work"].includes(r.role)).map((r) => r.rect)
      .concat([{ x: 0, y: 0, w: page.side === "front" ? 90 : 36, h: 792 }, { x: page.side === "front" ? 576 : 522, y: 0, w: page.side === "front" ? 36 : 90, h: 792 }, { x: 0, y: 0, w: 612, h: 36 }, { x: 0, y: 756, w: 612, h: 36 }]);
    const blank = new Map([front, back, facts[8]].map((page) => [page, drawPage(page)]));
    const part = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(fc.property(fc.constantFrom(...blank.keys()), fc.nat(), part, part, fc.constantFrom(0, 128, 244), (page, which, across, down, value) => {
      const all = zones(page);
      const zone = all[which % all.length];
      const at = square(zone.x + across * (zone.w - 1), zone.y + down * (zone.h - 1));
      // A square that touches the border of an answer area is not in the blank part of the zone.
      const borders = page.regions.filter((r) => r.role === "answer").map(({ rect }) => rect);
      const line = PRINT_RULES.answer.outline / 2;
      const touches = borders.some((b) => at.x < b.x + b.w + line && at.x + 1 > b.x - line && at.y < b.y + b.h + line && at.y + 1 > b.y - line && !(at.x >= b.x + line && at.x + 1 <= b.x + b.w - line && at.y >= b.y + line && at.y + 1 <= b.y + b.h - line));
      fc.pre(!touches);
      const canvas = blank.get(page);
      if (!canvas) throw new Error("no page");
      const copy = { ...canvas, grey: canvas.grey.slice() };
      paintSmooth(copy, at, value);
      expect(strayInk(page, imageOf(copy)).length).toBeGreaterThan(0);
    }), { numRuns: 60 });
  });

  it("of a grey of 244 is ink, and of 245 it is paper", () => {
    const { rect } = named(front, "answer-1");
    expect(placesWith(front, middle(rect), 244)).toEqual(['"answer-1"']);
    expect(placesWith(front, middle(rect), 245)).toEqual([]);
  });

  it("is named one time for each place, with the place in points", () => {
    const canvas = drawPage(front);
    for (const x of [150, 160, 170]) paint(canvas, square(x, 190, 3));
    paint(canvas, square(20, 20, 3));
    expect(checkImages([front], [toPng(canvas)])).toEqual([
      "Page 381: the image has ink that the model does not have, at (20, 20) in the spine zone.",
      'Page 381: the image has ink that the model does not have, at (150, 190) in "answer-1".',
    ]);
  });
});

it("a border that is thicker, or a text that leaves its place, is found", () => {
  const { x, y, w, h } = named(front, "answer-1").rect;
  expect(placesWith(front, { x: x - 1.5, y: y - 1.5, w: 3, h: h + 3 }).sort()).toEqual(['"answer-1"', '"reach-1"']);
  expect(placesWith(front, { x: x + 4, y: y - 4, w: 3, h: 3 }).length).toBeGreaterThan(0);
  expect(placesWith(front, { x: 500, y: 40, w: 60, h: 10 })).toEqual(["no rectangle of the page"]);
  expect(w).toBe(72);
});

it("a text over an answer area is found, also when the model has the text there", () => {
  const page: PageModel = { ...front, regions: front.regions.map((r) => (r.id.endsWith("/label-1") ? { ...r, ink: r.ink.map((i) => ({ ...i, rect: named(front, "answer-1").rect })) } : r)) };
  expect(strayInk(page, imageOf(drawPage(page))).map((s) => s.place)).toEqual(['"answer-1"']);
});

describe("ink in more than one place", () => {
  it("names every place: an answer area and the reach round it, on both sides", () => {
    for (const page of [front, back]) {
      const { x, y } = named(page, "answer-1").rect;
      const canvas = drawPage(page);
      paintSmooth(canvas, square(x - 5, y - 3));
      paintSmooth(canvas, square(x + 5, y + 5));
      expect(strayInk(page, imageOf(canvas)).map((s) => s.place).sort()).toEqual(['"answer-1"', '"reach-1"']);
    }
  });

  it("names every place of one mark that crosses the page", () => {
    const { y } = named(front, "answer-1").rect;
    const found = placesWith(front, { x: 0, y: y + 20, w: 612, h: 3 });
    expect(found).toEqual(expect.arrayContaining(['"answer-1"', '"reach-1"', '"work-1"', '"answer-2"', '"reach-2"', '"work-2"', "the spine zone", "the margin"]));
    expect(new Set(found).size).toBe(found.length);
  });

  it("names each zone of random pairs of zones, whichever holds the other", () => {
    const zones = front.regions.filter((r) => ["answer", "work"].includes(r.role));
    fc.assert(fc.property(fc.constantFrom(...zones), fc.constantFrom(...zones), (a, b) => {
      const canvas = drawPage(front);
      for (const zone of [a, b]) paintSmooth(canvas, middle(zone.rect));
      expect(new Set(strayInk(front, imageOf(canvas)).map((s) => s.place))).toEqual(new Set([a, b].map((z) => `"${z.id.slice(z.id.lastIndexOf("/") + 1)}"`)));
    }), { numRuns: 20 });
  });
});

describe("ink outside one rectangle", () => {
  it("is found, and ink inside it is not", () => {
    const canvas = drawPage({ ...front, regions: [] });
    const slot = { x: 48, y: 48, w: 236, h: 140 };
    paint(canvas, slot);
    expect(inkOutside(imageOf(canvas), slot)).toBeNull();
    paintSmooth(canvas, square(284, 100), 244);
    expect(inkOutside(imageOf(canvas), slot)).toMatchObject({ y: expect.closeTo(100, 0), x: expect.closeTo(284, 0) });
  });
});

describe("the colours of a page", () => {
  const small: PageModel = { ...front, size: { w: 270, h: 270 }, regions: [] };
  const problems = (colour: readonly [number, number, number]) => checkImages([small], [toColourPng(drawPage(small), [{ x: 120, y: 130, colour }])]).join("\n");

  it.each<[string, readonly [number, number, number]]>([["red", [255, 0, 0]], ["yellow", [255, 255, 0]], ["blue that is nearly black", [0, 0, 9]], ["white with a little blue", [255, 255, 250]]])("%s is a problem", (_name, colour) => {
    expect(problems(colour)).toContain("Page 381: the image has a colour that is not a grey, at (58, 62).");
  });

  it("a colour with a light grey value is ink in a blank zone: each part of the colour counts", () => {
    const yellow = readPageImage(toColourPng(drawPage(small), [{ x: 120, y: 130, colour: [255, 255, 0] }]));
    if (typeof yellow === "string") throw new Error(yellow);
    expect(yellow.low[130 * yellow.width + 120]).toBe(0);
    expect(strayInk(small, yellow)).toHaveLength(1);
  });

  it.each([0, 2, 3, 128, 200, 250, 252, 253])("an area of the grey %i is one of the greys of the page, or a problem", (value) => {
    const canvas = drawPage(small);
    paint(canvas, { x: 200, y: 200, w: 3, h: 3 }, value);
    expect(flatGrey(imageOf(canvas), [0, 255])?.grey ?? null).toBe(value < 3 || value > 252 ? null : value);
    expect(flatGrey(imageOf(canvas), [value, 255])).toBeNull();
  });

  it("the soft edge of black ink is not an area of grey", () => {
    for (const page of [front, facts[0]]) expect(flatGrey(imageOf(drawPage(page)), [0, 255])).toBeNull();
    const canvas = drawPage(small);
    for (let i = 0; i < 12; i++) paintSmooth(canvas, { x: 10 + 14 * i, y: 10 + 0.11 * i, w: 9, h: 0.3 + 0.13 * i });
    expect(flatGrey(imageOf(canvas), [0, 255])).toBeNull();
  });

  it("a page on grey paper, and a page with a grey fill, stop the book", () => {
    const paper = drawPage(front);
    paper.grey.forEach((v, i) => { if (v === 255) paper.grey[i] = 250; });
    expect(checkImages([front], [toPng(paper)])).toEqual(["Page 381: the image has the grey 250, which the model does not use, at (0, 0)."]);
    const fill = drawPage(front);
    const { ink } = named(front, "question-1");
    paint(fill, ink[4].rect, 60);
    expect(checkImages([front], [toPng(fill)])).toEqual(['Page 381: the image has no ink for a part of "question-1".']);
  });
});
