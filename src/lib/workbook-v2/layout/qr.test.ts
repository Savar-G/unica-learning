import { describe, expect, it } from "vitest";
import { qrSquares } from "./qr";

const BOX = { x: 100, y: 200, w: 57.6, h: 57.6 };

describe("the squares of a QR code", () => {
  it("keep four squares of white on each side of the box", () => {
    const squares = qrSquares(BOX, "https://unicalearning.com/tutor/p/example-front-381");
    if (typeof squares === "string") throw new Error(squares);
    const side = 57.6 / 41;
    for (const s of squares) {
      expect(s.rect.x).toBeGreaterThanOrEqual(100 + 4 * side - 1e-6);
      expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(157.6 - 4 * side + 1e-6);
      expect(s.rect.y).toBeGreaterThanOrEqual(200 + 4 * side - 1e-6);
      expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(257.6 - 4 * side + 1e-6);
    }
  });

  it.each([["a text that needs squares too small to scan", "x".repeat(90)], ["a text that no QR code holds", "x".repeat(5000)], ["no text", ""]])("refuses %s", (_name, text) => {
    expect(qrSquares(BOX, text)).toMatch(/QR code/);
  });
});
