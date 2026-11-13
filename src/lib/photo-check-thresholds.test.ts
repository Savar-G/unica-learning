import { describe, expect, it } from "vitest";
import { DecisionError, attemptCostBound } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { parseMaxUsd, runThresholdSet } from "@/lib/photo-check-thresholds";

// Review of PR #874, finding 2: the threshold script must keep to --max-usd. Failing inputs: a cap of 0 (it sent a
// request), and a positive cap with answers that give no usage.cost (unpriced attempts used none of the cap).
const photos = Array.from({ length: 6 }, (_, n) => ({ id: `p${n}`, problem: n < 2, image: async () => new Uint8Array([1]) }));
const BOUND = attemptCostBound("typesafe/jev-1.14");

describe("the photo check's threshold run under --max-usd", () => {
  it("a cap of 0 sends nothing", async () => {
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }), usd: 0.0002 });
    const { rows } = await runThresholdSet({ photos, question: "blurry", client, maxUsd: 0 });
    expect(client.requests).toHaveLength(0);
    expect(rows.every((r) => r.error === "budget" && r.yes === null)).toBe(true);
  });

  it("an answer with no cost counts at its attempt bound, so unpriced requests stop at the cap", async () => {
    // A cap of 2.5 bounds: two unpriced requests use 2 bounds, and the third does not fit.
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }), usd: null });
    const { rows, cap } = await runThresholdSet({ photos, question: "blurry", client, maxUsd: BOUND * 2.5, runs: 2 });
    expect(client.requests).toHaveLength(2);
    expect(cap.spentUsd).toBeCloseTo(BOUND * 2, 12);
    expect(rows.filter((r) => r.error === "budget")).toHaveLength(10);
  });

  it("a failed request with no cost is charged at its bound too; a priced one at its cost", async () => {
    const client = fakeDecisionClient({ answer: () => { throw new DecisionError("unavailable", "no", null, 1); } });
    const failed = await runThresholdSet({ photos: photos.slice(0, 1), question: "blurry", client, maxUsd: 1 });
    expect(failed.cap.spentUsd).toBeCloseTo(BOUND, 12);
    const priced = await runThresholdSet({ photos, question: "blurry", client: fakeDecisionClient({ answer: () => ({ blurry: noul(0.1) }), usd: 0.0002 }), maxUsd: 1 });
    expect(priced.cap.spentUsd).toBeCloseTo(0.0012, 12);
    expect(priced.rows.map((r) => r.yes)).toEqual([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  });

  it("refuses a cap that is not a finite number of at least 0", () => {
    for (const bad of [undefined, "", "abc", "-1", "NaN", "Infinity"]) expect(() => parseMaxUsd(bad)).toThrow(/at least 0/);
    expect(parseMaxUsd("0")).toBe(0);
    expect(parseMaxUsd("0.5")).toBe(0.5);
  });
});
