import { describe, expect, it } from "vitest";
import { homography, project, warpTransform, type Quad } from "./warp";

const QUAD: Quad = [186, 146, 629, 143, 180, 744, 629, 750];

describe("warp", () => {
  it("maps each corner of the box onto its corner of the quad", () => {
    const t = homography(541, 700, QUAD);
    const corners: [number, number][] = [[0, 0], [541, 0], [0, 700], [541, 700]];
    corners.forEach(([x, y], i) => {
      const [px, py] = project(t, x, y);
      expect(px).toBeCloseTo(QUAD[2 * i], 6);
      expect(py).toBeCloseTo(QUAD[2 * i + 1], 6);
    });
  });

  it("is the identity when the quad is the box itself", () => {
    expect(warpTransform(100, 50, [0, 0, 100, 0, 0, 50, 100, 50])).toBe("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
  });

  it("keeps parallel edges parallel for a scaled and moved box", () => {
    const t = homography(10, 10, [5, 5, 25, 5, 5, 25, 25, 25]);
    expect(project(t, 5, 5)).toEqual([15, 15]);
  });
});
