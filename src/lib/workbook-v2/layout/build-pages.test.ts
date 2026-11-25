import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import type { PageModel, Rect, Region, RegionRole } from "../contract";
import wideBook from "../fixtures/book-4-digits.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import { goodPages } from "../testing/sample";
import { TEMPLATES } from "./templates";

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
    if (plan.ok) expect(Math.max(...plan.items.map((i) => i.answer.value.length))).toBe(5);
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
    for (const page of wide) {
      regions(page, "work").forEach(({ rect }, i) => {
        const reach = regions(page, "reach")[i].rect;
        expect(rect.x).toBeGreaterThan(reach.x + reach.w);
        expect([rect.w, rect.h]).toEqual([38, 140]);
      });
    }
  });

  it("uses the only template that 5 digit places fit", () => {
    expect([...TEMPLATES.values()].map((t) => [t.id, t.digits])).toEqual([["columns-2x4", 3], ["columns-2x4-wide", 5]]);
  });
});
