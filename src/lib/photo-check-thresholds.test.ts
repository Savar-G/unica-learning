import { describe, expect, it } from "vitest";
import { DecisionError, attemptCostBound } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { kindThreshold, parseMaxUsd, runKindSet, runThresholdSet, type KindRow } from "@/lib/photo-check-thresholds";

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

describe("the real-photo threshold of each kind (#856)", () => {
  const row = (photo: string, kind: KindRow["kind"], glare: number, run = 1): KindRow => ({ run, photo, kind, probabilities: { blurry: 0.05, glare, shadow: 0.1, faint: 0.02 }, ms: 1, error: null, usd: 0, unpriced: 0 });
  const clear = [row("c1", "clear", 0.1), row("c2", "clear", 0.2)];

  it("sits in the middle of the clean thresholds that catch the most, and ships with 5 photos and 80% caught", () => {
    const glare = ["g1", "g2", "g3", "g4"].map((id) => row(id, "glare", 0.9)).concat(row("g5", "glare", 0.6));
    const t = kindThreshold([...clear, ...glare], "glare");
    // 0.50 to 0.60 catch all five; their middle is 0.55.
    expect(t).toMatchObject({ threshold: 0.55, caught: 5, photos: 5, enough: true, passes: true, tied: [0.5, 0.6] });
  });

  it("never ships on fewer than 5 photos of the kind, counting each photo once over runs", () => {
    const glare = [1, 2, 3].flatMap((run) => ["g1", "g2"].map((id) => row(id, "glare", 0.9, run)));
    expect(kindThreshold([...clear, ...glare], "glare")).toMatchObject({ caught: 6, rows: 6, photos: 2, enough: false, passes: false });
  });

  it("fails a kind its photos do not stand out in, and sets no threshold for a kind with no photos", () => {
    const glare = ["g1", "g2", "g3", "g4", "g5"].map((id, n) => row(id, "glare", n === 0 ? 0.9 : 0.1));
    expect(kindThreshold([...clear, ...glare], "glare")).toMatchObject({ caught: 1, photos: 5, passes: false });
    expect(kindThreshold(clear, "faint")).toMatchObject({ threshold: null, photos: 0, passes: false });
  });

  it("asks all four questions about each photo in one request", async () => {
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.1), glare: noul(0.8), shadow: noul(0.2), faint: noul(0.05) }) });
    const { rows } = await runKindSet({ client, maxUsd: 1, photos: [{ id: "p", kind: "glare", image: async () => new Uint8Array([1]) }] });
    expect(client.requests).toHaveLength(1);
    expect(Object.keys(client.requests[0].questions).sort()).toEqual(["blurry", "faint", "glare", "shadow"]);
    expect(rows[0]).toMatchObject({ kind: "glare", probabilities: { glare: 0.8 }, error: null });
  });
});
