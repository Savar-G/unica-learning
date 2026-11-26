import { describe, expect, it } from "vitest";
import { limitReachToPhoto, renderAnswerCrop } from "@/lib/scan-answer-crops";
import { cropInPhoto, type Calibration, type Raster } from "@/lib/scan-calibration";
import type { PagePrintContract } from "@/lib/workbook-print-contract";

const size = { width: 100, height: 120 };
const corner = { x: 0, y: 0 };
const calibration: Calibration = {
  version: 2, revision: "test", photo: size,
  marks: { tl: corner, tr: corner, br: corner, bl: corner },
  transform: [1, 0, 0, 0, 1, 0, 0, 0, 1], quarterTurns: 0, pageFit: 1,
};
const contract: PagePrintContract = {
  version: 1, workbookId: "test", page: 1, label: null, day: null, pageOfDay: null,
  coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: size, cssPage: size, scale: { x: 1, y: 1 } },
  marks: { anchor: "outer-corner", order: ["tl", "tr", "br", "bl"], points: calibration.marks },
  fingerprints: { content: "test", image: "0".repeat(64) },
};
const photo: Raster = { ...size, channels: 1, data: new Uint8Array(size.width * size.height).fill(20) };

describe("answer crops", () => {
  it("limits reach to visible pixels without changing whether the printed box passes the old cut-off check", () => {
    const box = { x: 10, y: 50, width: 30, height: 30 };
    const reach = { x: 0, y: 35, width: 73, height: 60 };
    expect(cropInPhoto(calibration, contract, box)).toBe(true);
    expect(cropInPhoto(calibration, contract, reach, true)).toBe(false);
    const visible = limitReachToPhoto(calibration, contract, box, reach);
    expect(cropInPhoto(calibration, contract, visible, true)).toBe(true);
    expect(visible.x).toBeLessThan(box.x);
    expect(visible.x + visible.width).toBeGreaterThan(box.x + box.width);
    const crop = renderAnswerCrop(photo, calibration, contract, box, { box: visible, areas: [visible] });
    expect(crop.data.every(value => value === 20)).toBe(true);
  });

  it("masks ink in the envelope outside the individual question regions", () => {
    const box = { x: 10, y: 10, width: 60, height: 60 };
    const areas = [{ x: 10, y: 10, width: 60, height: 20 }, { x: 20, y: 50, width: 20, height: 20 }];
    const crop = renderAnswerCrop(photo, calibration, contract, box, { box, areas });
    const pixel = (x: number, y: number) => crop.data[y * crop.width + x];
    expect(pixel(55, 5)).toBe(20);
    expect(pixel(15, 45)).toBe(20);
    expect(pixel(55, 45)).toBe(255);
  });
});
