import { describe, expect, it, vi } from "vitest";
import { historyFixture } from "./workbook-progress-history.fixture";
import { readWorkbookProgressHistory } from "./workbook-progress-history";
import { newEvidenceSince, preparationState, validatePlannerEvidence, type FrozenNextBookSnapshot } from "./next-book-snapshot";

vi.mock("server-only", () => ({}));

describe("next-book snapshot primitives", () => {
  // Falsifiers: a job can hold past the deadline, a foreign version can be consumed, or an old mark is counted again.
  it("waits for captured jobs and stops waiting at the deadline", () => {
    expect(preparationState(1000, 1000, ["finished"])).toBe("ready");
    expect(preparationState(1000, 1_800_999, ["waiting"])).toBe("waiting");
    expect(preparationState(1000, 1_801_000, ["waiting"])).toBe("ready");
    expect(() => preparationState(1000, 999, [])).toThrow("invalid-clock");
  });

  it("accepts only unique effective versions in the scoped history", async () => {
    const f = historyFixture(10, 8);
    const result = await readWorkbookProgressHistory(f.store, f.input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    const item = result.history.originals[0].first.observation;
    const i = item.identity;
    const key = JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
    const used = { key, version: item.resultVersion };
    const frozen = { history: result.history, evidence: [{ ...used, day: 1, pageId: i.pageId }] } as FrozenNextBookSnapshot;
    expect(validatePlannerEvidence(frozen, [used])).toBe(true);
    expect(validatePlannerEvidence({ ...frozen, evidence: [] }, [used])).toBe(false);
    expect(validatePlannerEvidence(frozen, [used, used])).toBe(false);
    expect(validatePlannerEvidence(frozen, [{ ...used, version: used.version + 1 }])).toBe(false);
    const held = result.held[0].original.first.observation;
    const h = held.identity;
    expect(validatePlannerEvidence(frozen, [{ key: JSON.stringify([h.workbookId, h.printedRevision, h.pageId, h.itemId]), version: held.resultVersion }])).toBe(false);
  });

  it("counts new versions and pages once and refuses a regressed source", () => {
    const used = [{ key: "a", version: 2 }, { key: "b", version: 1 }];
    const current = [{ key: "a", version: 2, day: 7, pageId: "p7" }, { key: "b", version: 2, day: 8, pageId: "p8" },
      { key: "c", version: 1, day: 8, pageId: "p8" }, { key: "d", version: 1, day: 9, pageId: "p9" }];
    expect(newEvidenceSince(used, current)).toEqual({ days: [8, 9], pages: 2, items: 3 });
    expect(newEvidenceSince(current.map(({ key, version }) => ({ key, version })), current)).toEqual({ days: [], pages: 0, items: 0 });
    expect(() => newEvidenceSince(used, [{ ...current[0], version: 1 }])).toThrow("evidence-regressed");
    expect(() => newEvidenceSince(used, [current[0], current[0]])).toThrow("invalid-evidence");
  });
});
