import { expect, it } from "vitest";
import { commentPosition } from "@/lib/workbook-comment-position";
it("R428-9 uses the centre for keyboard activation and bounds pointer coordinates", () => {
  const box = {left: 250, top: 300, width: 600, height: 800};
  expect(commentPosition(0, 0, 0, box)).toEqual({x: .5, y: .5});
  expect(commentPosition(1, 250, 300, box)).toEqual({x: 0, y: 0});
  expect(commentPosition(1, 0, 2000, box)).toEqual({x: 0, y: 1});
});
