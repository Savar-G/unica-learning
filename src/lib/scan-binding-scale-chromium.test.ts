import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Raster } from "@/lib/scan-calibration";
import { drawDigit } from "@/lib/scan-synthetic";
import { calibrate, chromium, photoOf, SIZE } from "@/lib/scan-binding-chromium-harness";
import { describeMatrixPart, matrixBooks, matrixConditions, partOfFile, PARTS, shownInPart } from "@/lib/scan-binding-scale-matrix";

const ctx = describeMatrixPart(import.meta.url);

describe("the plan of the page matrix", () => {
  // What a photo of the page really looks like, from its corners alone: its label could say one thing and show another.
  const shape = ({ corners: [tl, tr, br, bl] }: { corners: { x: number; y: number }[] }) => {
    const bottom = Math.hypot(br.x - bl.x, br.y - bl.y), top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    return `fills ${((bottom * 11) / 8.5 / SIZE.height).toFixed(2)}, turned ${((Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI).toFixed(1)}, top narrower by ${(bottom - top).toFixed(0)}`;
  };
  const rows = (full: boolean) => matrixConditions(full).map((c) => `${c.scale} ${c.angle}: ${shape(c)}`);
  const three = (scale: string, fills: string) => [
    `${scale} upright: fills ${fills}, turned 0.0, top narrower by 0`,
    `${scale} rotated 7 degrees: fills ${fills}, turned 7.0, top narrower by 0`,
    `${scale} tilted: fills ${fills}, turned 0.0, top narrower by 180`,
  ];
  const largest = "0.95 upright: fills 0.95, turned 0.0, top narrower by 0";

  it("holds the smallest, middle and largest scale, and upright, rotated and tilted", () => {
    expect(rows(false)).toEqual([...three("0.5", "0.50"), ...three("0.77", "0.77"), largest]);
    expect(rows(true)).toEqual([...three("0.5", "0.50"), ...three("0.6", "0.60"), ...three("0.7", "0.70"), ...three("0.77", "0.77"), ...three("0.85", "0.85"), largest]);
  });

  it("shows each page in one part, and each part has one test file", () => {
    expect(matrixBooks(false)).toEqual([["U4", 2], ["U16", 3], ["U26", 1]]);
    expect(matrixBooks(true)).toEqual([["U4", 6], ["U16", 12], ["U26", 6]]);
    const files = readdirSync(import.meta.dirname).filter((f) => f.startsWith("scan-binding-scale") && f.endsWith(".test.ts"));
    const parts = files.map(partOfFile);
    expect([...parts].sort()).toEqual([1, 2, 3]);
    expect(PARTS).toBe(3);
    const shown = (pages: number, full: boolean) => parts.flatMap((part) => shownInPart(part!, pages, full)).sort((a, b) => a - b);
    for (const pages of [1, 2, 3, 5, 6, 7, 24]) for (const full of [false, true]) {
      expect(shown(pages, full), `${pages} pages`).toEqual(Array.from({ length: pages }, (_, i) => i));
    }
    expect([1, 2, 3].map((part) => shownInPart(part, 6, false))).toEqual([[0, 3], [1, 4], [2, 5]]);
    // 42 photos, and 210 comparisons with another page.
    expect(matrixConditions(false).length * shown(6, false).length).toBe(42);
    expect(matrixConditions(false).length * shown(6, false).length * 5).toBe(210);
  });
});

describe.skipIf(!chromium)("writing outside the answer boxes", () => {
  it("writing that runs a little past the answer boxes does not refuse the right page", async () => {
    // Children overrun. Disproved if the comparison needs a spotless page.
    const shown = (await ctx.realPages("U16", ["Day 1"], 4)).filter((p) => p.plan.crops.length > 0);
    for (const p of shown) for (const over of [2, 5, 10]) {
      const r: Raster = { ...p.grey, data: p.grey.data.slice() };
      p.plan.crops.forEach((c, i) => drawDigit(r, { x: c.box.x - over, y: c.box.y - over, width: c.box.width + 2 * over, height: c.box.height + 2 * over }, (i * 3 + 1) % 10, 20));
      expect(calibrate(await photoOf(r), p).status, `${p.key} over ${over}`).toBe("calibrated");
    }
  }, 200_000);
});
