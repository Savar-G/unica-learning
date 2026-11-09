import { describe, expect, it } from "vitest";
import { compareWorkbookPreviews, type ComparablePreview } from "./workbook-preview-comparison";

const preview = (): ComparablePreview => ({
  childId: "child", workbookId: "book", selection: { unit: "1", skill: "count", step: 1 }, cutoff: 1,
  consumedVersions: [{ key: "a", firstVersion: 1, effectiveVersion: 1 }],
  decision: { action: "advance", target: { unit: "1", skill: "count", step: 2 } } as ComparablePreview["decision"],
  plan: { newSteps: [], days: [{ day: 1, pages: [{ number: 1, type: "practice" }] }] } as unknown as ComparablePreview["plan"],
});
describe("saved preview comparison", () => {
  it("reports new and changed marks and changed pages without claiming causation", () => {
    const a = preview(), b = structuredClone(a);
    b.cutoff = 2;
    b.consumedVersions = [{ key: "a", firstVersion: 1, effectiveVersion: 2 }, { key: "b", firstVersion: 1, effectiveVersion: 1 }];
    b.plan.days[0].pages[0].type = "warm-up";
    expect(compareWorkbookPreviews(a, b)).toMatchObject({ newMarks: [{ key: "b" }], changedMarks: [{ key: "a" }], removedMarks: [], changedPages: [{ day: 1, page: 1 }], stepsChanged: false });
  });
  it("lists added, removed and moved steps", () => {
    const a = preview(), b = structuredClone(a);
    a.plan.newSteps = [{ unit: "1", skill: "count", step: 1, day: 1, track: "A" }, { unit: "1", skill: "add", step: 1, day: 2, track: "A" }];
    b.plan.newSteps = [{ unit: "1", skill: "count", step: 1, day: 3, track: "A" }, { unit: "1", skill: "subtract", step: 1, day: 4, track: "B" }];
    expect(compareWorkbookPreviews(a, b)).toMatchObject({ stepsChanged: true,
      removedSteps: [{ skill: "add", step: 1 }], addedSteps: [{ skill: "subtract", step: 1 }],
      movedSteps: [{ before: { skill: "count", day: 1 }, after: { skill: "count", day: 3 } }] });
  });
  it("refuses a different child, book, skill or reversed time", () => {
    const a = preview();
    for (const b of [{ ...preview(), childId: "other" }, { ...preview(), workbookId: "other" }, { ...preview(), selection: { ...a.selection, step: 2 } }, { ...preview(), cutoff: 0 }]) {
      expect(compareWorkbookPreviews(a, b)).toBeNull();
    }
  });
});
