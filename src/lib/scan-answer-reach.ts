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
  return boundedAnswerArea(region, question, questions, content, HORIZONTAL_REACH, VERTICAL_REACH);
}

/** Bound a crop extension by the print edge and adjoining regions. */
export function boundedAnswerArea(
  region: Pick<MarkingRegion, "id" | "box">,
  question: number,
  questions: readonly QuestionRegions[],
  content: Box,
  horizontal: number,
  vertical: number,
): Box {
  const { x, y, width, height } = region.box;
  const right = x + width, bottom = y + height;
  // A snap can move part of a printed box past the content edge. Keep the whole box.
  const maxLeft = Math.max(Math.min(x, content.x), x - horizontal);
  const maxTop = Math.max(Math.min(y, content.y), y - vertical);
  const maxRight = Math.min(Math.max(right, content.x + content.width), right + horizontal);
  const maxBottom = Math.min(Math.max(bottom, content.y + content.height), bottom + vertical);
  let left = maxLeft, top = maxTop, farRight = maxRight, farBottom = maxBottom;

  for (const other of questions) {
    const sameQuestion = question === other.number;
    for (const { id, box } of other.regions ?? []) {
      if (!box || (sameQuestion && id === region.id)) continue;
      const otherRight = box.x + box.width, otherBottom = box.y + box.height;
      const share = sameQuestion ? 1 : 0.5;
      // Check both possible expansions across the corner gap between questions.
      const across = sameQuestion ? 0 : HORIZONTAL_REACH;
      const down = sameQuestion ? 0 : VERTICAL_REACH;
      if (box.y - down < maxBottom && otherBottom + down > maxTop) {
        if (otherRight <= x) left = Math.max(left, x - (x - otherRight) * share);
        if (box.x >= right) farRight = Math.min(farRight, right + (box.x - right) * share);
      }
      if (box.x - across < maxRight && otherRight + across > maxLeft) {
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
    if (!snap) return region;
    const { reach, box } = region;
    return { ...region, box: snap.box, ...(reach && box ? { reach: { ...reach, x: reach.x + snap.box.x - box.x, y: reach.y + snap.box.y - box.y } } : {}) };
  }) ?? null;
}
