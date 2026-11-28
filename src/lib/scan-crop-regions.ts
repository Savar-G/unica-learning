import { markingRegions, type RegionQuestion } from "@/lib/scan-marking-regions";

/** The v2 publisher writes measured answer boxes in part order. Placement can use them before marking supports the item. */
export function cropRegions(question: RegionQuestion, v2: boolean) {
  if (!v2) return markingRegions(question);
  const { package: item, regions } = question;
  if (!item || !regions) return [];
  const boxes = regions.flatMap(({ id, kind, box, reach }) => kind === "box" && box ? [{ id, kind: "box" as const, box, reach }] : []);
  return boxes.length === regions.length ? boxes : [];
}
