import { describe, expect, it } from "vitest";
import type { PageModel, Rect, Region, RegionRole } from "../contract";
import { goodPages } from "../testing/sample";

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
    expect(texts(one(front, "footer"))).toEqual(["Level 3 (Grade 3 work) · Page 381"]);
    expect(texts(one(back, "footer"))).toEqual(["Level 3 (Grade 3 work) · Page 382"]);
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
