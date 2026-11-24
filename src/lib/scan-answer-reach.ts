import type { MarkingRegion } from "@/lib/scan-marking-regions";
import type { Box, PagePrintContract, PrintedRegion } from "@/lib/workbook-print-contract";

type QuestionRegions = { number: number; regions: readonly PrintedRegion[] | null };

const HORIZONTAL_REACH = 40;
const VERTICAL_REACH = 15;

/** Older print contracts record the image boundary only. */
export function scanContentBounds({ coordinates }: PagePrintContract): Box {
  return coordinates.content ?? { x: 0, y: 0, ...coordinates.image };
}

/** The printed answer plus the space its handwriting may run into, in straightened image pixels. */
export function answerReach(
  region: Pick<MarkingRegion, "id" | "kind" | "box">,
  question: number,
  questions: readonly QuestionRegions[],
  content: Box,
): Box | undefined {
  if (region.kind !== "number" && region.kind !== "fraction" && region.kind !== "text") return undefined;
  const { x, y, width, height } = region.box;
  const right = x + width, bottom = y + height;
  // A snap can move part of a printed box past the content edge. Keep the whole box.
  const maxLeft = Math.max(Math.min(x, content.x), x - HORIZONTAL_REACH);
  const maxTop = Math.max(Math.min(y, content.y), y - VERTICAL_REACH);
  const maxRight = Math.min(Math.max(right, content.x + content.width), right + HORIZONTAL_REACH);
  const maxBottom = Math.min(Math.max(bottom, content.y + content.height), bottom + VERTICAL_REACH);
  let left = maxLeft, top = maxTop, farRight = maxRight, farBottom = maxBottom;

  for (const other of questions) {
    const sameQuestion = question === other.number;
    for (const { id, box } of other.regions ?? []) {
      if (!box || (sameQuestion && id === region.id)) continue;
      const otherRight = box.x + box.width, otherBottom = box.y + box.height;
      const share = sameQuestion ? 1 : 0.5;
      // Use the full potential span on the other axis, so corner approaches are also bounded.
      if (box.y < maxBottom && otherBottom > maxTop) {
        if (otherRight <= x) left = Math.max(left, x - (x - otherRight) * share);
        if (box.x >= right) farRight = Math.min(farRight, right + (box.x - right) * share);
      }
      if (box.x < maxRight && otherRight > maxLeft) {
        if (otherBottom <= y) top = Math.max(top, y - (y - otherBottom) * share);
        if (box.y >= bottom) farBottom = Math.min(farBottom, bottom + (box.y - bottom) * share);
      }
      // If the placed boxes already overlap, no additional ink can safely be claimed.
      if (box.x < right && otherRight > x && box.y < bottom && otherBottom > y) return region.box;
    }
  }
  return { x: left, y: top, width: farRight - left, height: farBottom - top };
}

/** Use the same placed regions when building crops and when reading the stored calibration. */
export function placedRegions(
  question: QuestionRegions,
  snaps: readonly { number: number; regionId: string; box: Box }[],
): readonly PrintedRegion[] | null {
  return question.regions?.map(region => {
    const snap = snaps.find(s => s.number === question.number && s.regionId === region.id);
    return snap ? { ...region, box: snap.box } : region;
  }) ?? null;
}
