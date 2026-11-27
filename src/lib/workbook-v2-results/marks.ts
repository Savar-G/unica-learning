// The effective first tries of a child's v2 questions, from marking's canonical set (docs/scan-marking.md, "Effective
// results"). A v2 question's package id is "v2:<engine item id>" (workbook-v2-publish/package-copy.ts). Our team's mark
// change replaces the effective result: it corrects the reading of the first try. A child's own correction is never in
// this set, so it never changes a first try.
import type { EffectiveMark } from "@/lib/scan-marking";
import type { ChildMark } from "./types";

export const V2_ITEM_PREFIX = "v2:";

/** The marked v2 questions of an effective set. A question still waiting for a reading (or a parent check) is unmarked. */
export function childMarksFrom(effective: readonly Pick<EffectiveMark, "expected" | "observation">[]): ChildMark[] {
  return effective.flatMap(({ expected, observation }) => {
    const { workbookId, itemId } = expected.identity;
    const result = observation.result;
    if (!itemId.startsWith(V2_ITEM_PREFIX) || result === null || observation.state === "pending" || observation.state === "parent-pending") return [];
    return [{ workbookId, itemId: itemId.slice(V2_ITEM_PREFIX.length), firstTry: result }];
  });
}
