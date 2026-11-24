import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { answerReach } from "@/lib/scan-answer-reach";
import type { PrintedRegion } from "@/lib/workbook-print-contract";

const box = { x: 100, y: 100, width: 150, height: 100 };
const page = { x: 0, y: 0, width: 400, height: 400 };
const own = { number: 1, regions: [{ id: "answer", kind: "box", box }] };
const answer = { id: "answer", kind: "number", box } as const;
const neighbour = (id: string, kind: string, x: number, y: number, width: number, height: number): PrintedRegion =>
  ({ id, kind, box: { x, y, width, height } });

describe("answer reach", () => {
  it.each(["number", "fraction", "text"] as const)("grows a %s answer by 40 px across and 15 px down each side", kind => {
    expect(answerReach({ ...answer, kind }, 1, [own], page)).toEqual({ x: 60, y: 85, width: 230, height: 130 });
  });

  it("uses half the gap to measured regions of other questions on all four sides", () => {
    const other = { number: 2, regions: [
      neighbour("answer", "box", 20, 100, 70, 100),
      neighbour("choice", "choice", 300, 100, 20, 100),
      neighbour("work", "work", 100, 60, 150, 30),
      neighbour("lower", "box", 100, 210, 150, 50),
    ] };
    expect(answerReach(answer, 1, [own, other], page)).toEqual({ x: 95, y: 95, width: 180, height: 110 });
  });

  it("bounds a diagonal approach before it reaches another question", () => {
    const other = { number: 2, regions: [neighbour("answer", "box", 270, 210, 75, 75)] };
    expect(answerReach(answer, 1, [own, other], page)).toEqual({ x: 60, y: 85, width: 200, height: 120 });
  });

  it("separates reaches even when neither diagonal box is inside the other's full reach", () => {
    const diagonal = { x: 310, y: 220, width: 150, height: 100 };
    const other = { number: 2, regions: [{ id: "answer", kind: "box", box: diagonal }] };
    const sheet = { ...page, width: 600 };
    const first = answerReach(answer, 1, [own, other], sheet)!;
    const second = answerReach({ ...answer, box: diagonal }, 2, [own, other], sheet)!;
    expect(first.x + first.width).toBe(second.x);
    expect(first.y + first.height).toBe(second.y);
  });

  it("contains the box, respects expansion limits and is independent of question order", () => {
    const measured = fc.record({ x: fc.integer({ min: 0, max: 300 }), y: fc.integer({ min: 0, max: 300 }),
      width: fc.integer({ min: 1, max: 100 }), height: fc.integer({ min: 1, max: 100 }) });
    fc.assert(fc.property(measured, fc.array(measured), (box, blockers) => {
      const questions = [{ number: 1, regions: [{ id: answer.id, kind: "box", box }] },
        ...blockers.map((b, i) => ({ number: i + 2, regions: [{ id: "blocker", kind: "box", box: b }] }))];
      const reach = answerReach({ ...answer, box }, 1, questions, page)!;
      expect(reach).toEqual(answerReach({ ...answer, box }, 1, questions.toReversed(), page));
      expect(box.x - reach.x).toBeGreaterThanOrEqual(0);
      expect(box.x - reach.x).toBeLessThanOrEqual(40);
      expect(box.y - reach.y).toBeGreaterThanOrEqual(0);
      expect(box.y - reach.y).toBeLessThanOrEqual(15);
      const right = reach.x + reach.width - box.x - box.width;
      const bottom = reach.y + reach.height - box.y - box.height;
      expect(right).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(40);
      expect(bottom).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(15);
    }));
  });

  it("stops at the edge of the question's own work, method and choice regions", () => {
    const question = { ...own, regions: [...own.regions,
      neighbour("scratch", "work", 90, 70, 200, 24),
      neighbour("method", "work", 100, 200, 150, 50),
      neighbour("choice", "choice", 70, 100, 20, 100),
    ] };
    expect(answerReach(answer, 1, [question], page)).toEqual({ x: 90, y: 94, width: 200, height: 106 });
  });

  it("clamps to the page edges", () => {
    const atEdge = { x: 5, y: 6, width: 245, height: 195 };
    expect(answerReach({ ...answer, box: atEdge }, 1, [], { x: 0, y: 0, width: 265, height: 210 }))
      .toEqual({ x: 0, y: 0, width: 265, height: 210 });
  });

  it("stops at the measured content edge within the page", () => {
    const content = { x: 95, y: 98, width: 170, height: 110 };
    expect(answerReach(answer, 1, [own], content)).toEqual(content);
  });

  it("preserves the printed box after snapping partly beyond the content edge", () => {
    const content = { x: 105, y: 101, width: 144, height: 98 };
    expect(answerReach(answer, 1, [own], content)).toEqual(box);
  });

  it.each(["choice", "method"] as const)("gives a %s no reach", kind => {
    expect(answerReach({ ...answer, kind }, 1, [own], page)).toBeUndefined();
  });

  it("adds no ink to an answer whose placed box already overlaps another region", () => {
    const other = { number: 2, regions: [neighbour("answer", "box", 249, 110, 30, 90)] };
    expect(answerReach(answer, 1, [own, other], page)).toEqual(box);
  });
});
