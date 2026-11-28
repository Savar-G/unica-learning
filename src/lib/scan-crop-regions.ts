import { markingRegions, type RegionQuestion } from "@/lib/scan-marking-regions";

/** The v2 publisher writes measured answer boxes in part order. Placement can use them before marking supports the item. */
export function cropRegions(question: RegionQuestion, v2: boolean) {
  if (!v2) return markingRegions(question);
  const { package: item, regions } = question;
  if (!item || !regions) return [];
  const boxes = regions.flatMap(({ id, kind, box, reach }) => kind === "box" && box ? [{ id, kind: "box" as const, box, reach }] : []);
  if (boxes.length !== regions.length) return [];
  if (boxes.every(box => box.reach !== undefined)) return boxes;
  // Early v2 rows have no measured reach. Use the same kinds that received bounded reach before the layout was stored.
  const marking = new Map(markingRegions(question).map(region => [region.id, region]));
  return boxes.map(box => box.reach === undefined ? marking.get(box.id) ?? box : box);
}
