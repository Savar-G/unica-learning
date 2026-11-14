import { FROZEN_KIT } from "@/lib/scan-marking-physical";
import { describe, expect, it } from "vitest";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import type { QuestionPackage } from "@/lib/question-package";
import type { PrintedRegion } from "@/lib/workbook-print-contract";
import { DecisionError, attemptCostBound, type DecisionClient, type DecisionResult } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { openRouterDecisionClient } from "@/lib/decision-openrouter";
import { markingRegions } from "@/lib/scan-marking-regions";
import {
  THRESHOLDS,
  askAll,
  PHYSICAL_MIN_ITEMS,
  comparisonItems,
  comparisonReport,
  comparisonWinner,
  physicalComparisonSet, checkPhysicalImages,
  physicalShortfall,
  winnerMarkdown,
  costCap,
  cropRect,
  imageSize,
  modelReport,
  regionQuestion,
  reportMarkdown,
  type AskResult,
  type ComparisonReport,
  type ModelReport,
  type PhysicalSetFile,
  type SetManifest,
  type SetPhoto,
  type TruthResult,
} from "@/lib/decision-marking-comparison";

// The synthetic second-opinion comparison (#851) through its public interface: made-up Robin packages, fake decisions.

const JEV = "typesafe/jev-1.14", GEMINI = "google/gemini-decision-1";
const pkg = (name: keyof typeof fixtures.packages) => structuredClone(fixtures.packages[name]) as unknown as QuestionPackage;
const box = (id: string, kind: PrintedRegion["kind"], x: number): PrintedRegion => ({ id, kind, box: { x, y: 100, width: 100, height: 80 } }) as PrintedRegion;
const question = (number: number, name: keyof typeof fixtures.packages) => {
  const p = pkg(name);
  const regions = p.item!.regions.map((r, n) => box(r.id, r.kind, 100 + n * 150));
  return { number, package: p, regions };
};
const page = [question(1, "whole"), question(2, "circle"), question(3, "spot-the-error"), question(4, "two-ways")];
const photo = (id: string, results: [TruthResult, TruthResult, TruthResult]): SetPhoto => ({
  id, clear: true, image: { path: `photos/${id}.jpg`, width: 1275, height: 1650 },
  frame: { pageNumber: 3, questions: page },
  truth: [
    { itemId: page[0].package.id, format: "whole", result: results[0] },
    { itemId: page[1].package.id, format: "circle", result: results[1] },
    { itemId: page[2].package.id, format: "spot-the-error", result: results[2] },
    { itemId: page[3].package.id, format: "two-ways", result: "parent" },
  ],
});
const manifest = (): SetManifest => ({
  synthetic: true, identity: { containsRealData: false },
  photos: [photo("synthetic-right", ["right", "right", "right"]), photo("synthetic-wrong", ["wrong", "wrong", "wrong"]), photo("synthetic-blank", ["blank", "blank", "uncertain"])],
});

describe("the region questions (#851)", () => {
  it("states the key in every accepted form with the unit, never a known wrong answer", () => {
    const p = pkg("whole");
    p.answer = { value: { type: "number", value: 48 }, accepted: [{ type: "fraction", numerator: 96, denominator: 2 }], unit: "cm" };
    const [region] = markingRegions({ package: p, regions: [box("answer", "box", 100)] });
    const q = regionQuestion(region, p, true);
    expect(q.instructions).toBe("Does this box show 48 cm or 96/2 cm?");
    expect(q.yes).toMatch(/exactly this answer/);
    expect(q.no).toMatch(/blank box/);
    expect(q.no).toMatch(/crossed out/);
    expect(q.no).toMatch(/two answers/);
    const wrong = (p.wrongAnswers ?? []).map((w) => String((w.value as { value?: unknown }).value));
    expect(wrong.length).toBeGreaterThan(0);
    for (const w of wrong) expect(JSON.stringify(q)).not.toContain(w);
  });

  it("asks a fraction in its form, a choice by its option, and leaves another box's accepted forms out", () => {
    const fraction = pkg("fraction");
    const [f] = markingRegions({ package: fraction, regions: [box("answer", "box", 100)] });
    expect(regionQuestion(f, fraction, true).instructions).toBe("Does this box show 1/9?");
    const spot = pkg("spot-the-error");
    const [right, fix] = markingRegions({ package: spot, regions: [box("right", "choice", 100), box("fix", "box", 300)] });
    expect(regionQuestion(right, spot, true).instructions).toBe('The options printed in this box are: "Yes", "No". Is option "No" the one ticked?');
    expect(regionQuestion(fix, spot, false).instructions).toBe("Does this box show 70000?");
    const circle = pkg("circle");
    const [c] = markingRegions({ package: circle, regions: [box("answer", "choice", 100)] });
    expect(regionQuestion(c, circle, false).instructions).toMatch(/Is option "true" the one circled\?$/);
  });
});

describe("the comparison rows (#851)", () => {
  it("asks each scored region of each item, and lists the parent rows and leaves them out", () => {
    const { items, leftOut } = comparisonItems(manifest());
    expect(items).toHaveLength(9);
    expect(items.filter((i) => i.result === "right").map((i) => i.regions.map((r) => r.regionId))).toEqual([["answer"], ["answer"], ["right", "fix"]]);
    expect(leftOut).toEqual(["synthetic-right", "synthetic-wrong", "synthetic-blank"].map((p) => ({ photo: p, itemId: page[3].package.id, format: "two-ways" })));
  });

  it("refuses a set that holds real child data", () => {
    const m = { ...manifest(), identity: { containsRealData: true } } as unknown as SetManifest;
    expect(() => comparisonItems(m)).toThrow(/made-up-child-set-required/);
  });

  it("crops each box with a margin inside the page, at a size inside Jev's limits (each side 280 to 1,568 px)", () => {
    expect(cropRect({ x: 512.5, y: 401.4, width: 100, height: 100 }, { width: 1275, height: 1650 })).toEqual({ left: 497, top: 386, width: 131, height: 131 });
    expect(cropRect({ x: 0, y: 0, width: 50, height: 20 }, { width: 1275, height: 1650 })).toMatchObject({ left: 0, top: 0 });
    for (const [w, h] of [[131, 131], [420, 86], [2000, 40], [1500, 1600]]) {
      const s = imageSize(w, h);
      expect(Math.min(s.canvas.width, s.canvas.height)).toBeGreaterThanOrEqual(280);
      expect(Math.max(s.canvas.width, s.canvas.height)).toBeLessThanOrEqual(1568);
      expect(s.canvas.width * s.canvas.height).toBeLessThanOrEqual(2_458_624);
      expect(s.canvas.width * s.canvas.height).toBeGreaterThanOrEqual(78_400);
    }
  });
});

describe("the comparison report (#851)", () => {
  const { items } = comparisonItems(manifest());
  const results = (yes: (itemResult: string, regionId: string) => number | null): AskResult[] =>
    items.flatMap((i) => i.regions.map((r) => {
      const y = yes(i.result, r.regionId);
      return { photo: i.photo, itemId: i.itemId, regionId: r.regionId, yes: y, error: y === null ? "timeout" as const : null, ms: 100, usd: 0.00001, costKnown: true, provider: "TypeSafe" };
    }));

  it("confirms an item only when every region is at or above the threshold; the lowest 0-false-Right threshold and its confirm rate", () => {
    // Right items: 0.97, except one region of the spot-the-error item at 0.9. A wrong item reaches 0.95, a blank 0.6.
    const r = modelReport("m", items, results((result, region) => (result === "right" ? (region === "right" ? 0.9 : 0.97) : result === "wrong" ? 0.95 : result === "blank" ? 0.6 : 0.2)), 3);
    expect(r.rightItems).toBe(3);
    expect(r.falseRightCandidates).toEqual({ wrong: 3, blank: 2, uncertain: 1 });
    expect(r.thresholds).toHaveLength(50);
    const at = (t: number) => r.thresholds.find((x) => x.threshold === t)!;
    expect(at(0.5)).toMatchObject({ confirmed: 3, falseRight: 5, falseRightBy: { wrong: 3, blank: 2, uncertain: 0 } });
    expect(at(0.95)).toMatchObject({ confirmed: 2, falseRight: 3 });
    expect(r.lowestZeroFalseRight).toBe(0.96);
    expect(r.confirmRateAtLowest).toBe(0.6667);
    expect(r.passes).toBe(false);
    expect(r.reliability.find((b) => b.band === "0.9-1.0")).toEqual({ band: "0.9-1.0", items: 6, right: 3, rightRate: 0.5 });
    expect(r.latencyMs).toEqual({ p50: 100, p95: 100 });
  });

  it("counts an error as not confirmed at every threshold, and passes the bar at 80% confirmed with 0 false Right", () => {
    const r = modelReport("m", items, results((result, region) => (result === "right" ? (region === "fix" ? null : 0.99) : 0.1)), 3);
    expect(r.errors).toEqual({ timeout: 1 });
    expect(r.thresholds.every((t) => t.confirmed === 2)).toBe(true);
    expect(r.lowestZeroFalseRight).toBe(0.5);
    expect(r.passes).toBe(false);
    const ok = modelReport("m", items, results((result) => (result === "right" ? 0.99 : 0.1)), 3);
    expect(ok).toMatchObject({ lowestZeroFalseRight: 0.5, confirmRateAtLowest: 1, passes: true });
  });

  it("a fake HTTP run of both models needs no key and gives a complete report", async () => {
    const replies = new Map<string, number>([["right", 0.98], ["wrong", 0.3], ["blank", 0.05], ["uncertain", 0.4]]);
    const byImage = new Map<string, string>();
    const fetchFor = (model: string): typeof globalThis.fetch => async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { state: [string, { image_url: { url: string } }] };
      const result = byImage.get(body.state[1].image_url.url)!;
      return new Response(JSON.stringify({ model, answers: { shows: { type: "noul", noul: replies.get(result) } }, usage: { input_tokens: 900, output_tokens: 0, cost: 0.00004 }, id: "gen-dec-x", provider: model === JEV ? "TypeSafe" : "Google AI Studio" }), { status: 200 });
    };
    const image = async (item: (typeof items)[number], region: (typeof items)[number]["regions"][number]) => {
      const data = new TextEncoder().encode(`${item.photo}/${item.itemId}/${region.regionId}`);
      byImage.set(`data:image/jpeg;base64,${Buffer.from(data).toString("base64")}`, item.result);
      return data;
    };
    const cap = costCap(1);
    const all: Record<string, AskResult[]> = {};
    for (const model of [JEV, GEMINI]) all[model] = await askAll({ items, client: openRouterDecisionClient({ apiKey: "fake", model, provider: "fake", fetch: fetchFor(model) }), image, cap });
    const report = comparisonReport({ items, leftOut: comparisonItems(manifest()).leftOut, photos: 3, fake: true, results: all, cap });

    expect(report.requestsPerModel).toBe(12);
    expect(report.items).toEqual({ right: 3, wrong: 3, blank: 2, uncertain: 1 });
    expect(report.leftOut).toHaveLength(3);
    for (const m of report.models) {
      expect(m.requests).toBe(12);
      expect(m.errors).toEqual({});
      expect(m.thresholds.map((t) => t.threshold)).toEqual(THRESHOLDS);
      expect(m.lowestZeroFalseRight).toBe(0.5);
      expect(m.confirmRateAtLowest).toBe(1);
      expect(m.reliability).toHaveLength(10);
      expect(m.costUsd).toBeCloseTo(12 * 0.00004, 10);
      expect(m.latencyMs.p50).not.toBeNull();
    }
    expect(report.models.map((m) => Object.keys(m.providers))).toEqual([["TypeSafe"], ["Google AI Studio"]]);
    const md = reportMarkdown(report);
    expect(md).toContain("fake HTTP");
    expect(md).toContain("| typesafe/jev-1.14 | 0.50 | 100.0% | yes |");
    expect(md).toContain("## Rows left out (parent or team-marked two ways)");
    expect(report.cap).toMatchObject({ maxUsd: 1, stopped: false });
    expect(report.cap!.spentUsd).toBeCloseTo(24 * 0.00004, 10);
    expect(md).toContain("Cost cap: USD 1; spent USD 0.000960 (known costs");
    expect(md).not.toContain("stopped at the cost cap");
  });

  it("records each error kind from the client and never sends the request text a wrong answer", async () => {
    const kinds = ["refused", "blocked", "malformed", "unavailable"] as const;
    let n = 0;
    const client = fakeDecisionClient({
      answer: () => {
        const k = kinds[n++ % 5];
        if (k) throw new DecisionError(k, k);
        return { shows: noul(0.9) };
      },
    });
    const out = await askAll({ items, client, image: async () => new Uint8Array([1]), cap: costCap(1), concurrency: 1 });
    expect(out.slice(0, 5).map((r) => r.error)).toEqual(["refused", "blocked", "malformed", "unavailable", null]);
    expect(client.requests.every((r) => r.input.some((p) => p.type === "image") && Object.keys(r.questions).join() === "shows")).toBe(true);
    expect(client.requests.some((r) => JSON.stringify(r.questions).includes("49"))).toBe(false);
  });
});

describe("an incomplete comparison (#851 review, finding 1)", () => {
  it("does not pass when a non-right request failed: one right item at 0.9, one wrong item that timed out", () => {
    const { items: all } = comparisonItems(manifest());
    const right = all.find((i) => i.photo === "synthetic-right" && i.format === "whole")!;
    const wrong = all.find((i) => i.photo === "synthetic-wrong" && i.format === "whole")!;
    const results: AskResult[] = [
      { photo: right.photo, itemId: right.itemId, regionId: "answer", yes: 0.9, error: null, ms: 100, usd: 0.00001, costKnown: true, provider: "TypeSafe" },
      { photo: wrong.photo, itemId: wrong.itemId, regionId: "answer", yes: null, error: "timeout", message: "time is up", ms: 20_000, usd: null, costKnown: false, provider: null },
    ];
    const r = modelReport("m", [right, wrong], results, 2);
    // The numbers alone look perfect: 0 false Right and 100% confirmed at 0.50.
    expect(r.lowestZeroFalseRight).toBe(0.5);
    expect(r.confirmRateAtLowest).toBe(1);
    expect(r.failedRequests).toEqual({ right: 0, wrong: 1, blank: 0, uncertain: 0 });
    expect(r.incomplete).toBe("incomplete: 1 non-right requests failed");
    expect(r.passes).toBe(false);
    const md = reportMarkdown(comparisonReport({ items: [right, wrong], leftOut: [], photos: 2, fake: false, results: { m: results } }));
    expect(md).toContain("| m | 0.50 | 100.0% | no (incomplete: 1 non-right requests failed) |");

    // An errored right row is not confirmed and does not make the comparison incomplete.
    const rightFailed = modelReport("m", [right, wrong], [{ ...results[0], yes: null, error: "timeout" }, { ...results[1], yes: 0.1, error: null }], 2);
    expect(rightFailed).toMatchObject({ failedRequests: { right: 1, wrong: 0, blank: 0, uncertain: 0 }, incomplete: null, confirmRateAtLowest: 0, passes: false });
  });
});

describe("the cost cap (#851 review, finding 3 and re-check A and B)", () => {
  const { items } = comparisonItems(manifest());
  /** The most one Jev attempt can cost: 262,144 tokens at USD 0.042 per million. */
  const B = 262_144 * 0.042 / 1e6;
  const image = async () => new Uint8Array([1]);

  /**
   * A Jev client with `maxAttempts` attempts whose request number n reports cost costs[n] and `unpriced` attempts with no
   * cost, and answers after `delayMs`; it records the cap at each call and the most requests in flight.
   */
  function costedClient(cap: ReturnType<typeof costCap>, o: { costs: (number | null)[]; unpriced?: number; maxAttempts?: number; delayMs?: number; model?: string }) {
    const calls: { spent: number; reserved: number }[] = [];
    let inFlight = 0;
    const seen = { peak: 0 };
    const client: DecisionClient & { calls: typeof calls; seen: typeof seen } = {
      model: o.model ?? JEV, maxAttempts: o.maxAttempts ?? 1, calls, seen,
      async decide(): Promise<DecisionResult> {
        const n = calls.length;
        calls.push({ spent: cap.spentUsd, reserved: cap.reservedUsd });
        seen.peak = Math.max(seen.peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, o.delayMs ?? 0));
        inFlight--;
        const unpriced = o.unpriced ?? 0;
        return { answers: { shows: noul(0.9) }, usd: o.costs[Math.min(n, o.costs.length - 1)], unpricedAttempts: unpriced, costKnown: unpriced === 0, provider: "fake", id: null };
      },
    };
    return client;
  }

  it("bounds a request by the pinned prices: the whole context at the prompt price, times the most attempts", () => {
    expect(attemptCostBound(JEV)).toBeCloseTo(B, 12);
    expect(attemptCostBound(GEMINI)).toBeCloseTo(262_144 * 0.1 / 1e6, 12);
    expect(() => attemptCostBound("someone/other-model")).toThrow(/not in the pinned model table/);
  });

  it("never spends past a USD 0.10 cap at concurrency 1, even when every request is charged the most it can cost", async () => {
    const cap = costCap(0.1);
    const client = costedClient(cap, { costs: [B] });
    const out = await askAll({ items, client, image, cap, concurrency: 1 });
    // 9 bounds fit under USD 0.10 (9 x 0.011010048 = 0.0991); the 10th does not, so it is never sent.
    expect(client.calls).toHaveLength(9);
    for (const c of client.calls) expect(c.spent + c.reserved).toBeLessThanOrEqual(0.1);
    expect(cap.spentUsd).toBeLessThanOrEqual(0.1);
    expect(cap.spentUsd).toBeCloseTo(9 * B, 12);
    expect(cap.stopped).toBe(false);
    expect(out.filter((r) => r.error === "budget").every((r) => r.message === "not admitted: the cost cap is full")).toBe(true);
  });

  it("never spends past a USD 0.10 cap at concurrency 4, with requests in flight before any cost arrives", async () => {
    const cap = costCap(0.1);
    const client = costedClient(cap, { costs: [B], delayMs: 10 });
    await askAll({ items, client, image, cap, concurrency: 4 });
    expect(client.seen.peak).toBe(4);
    // At each call, the money spent plus every reservation in flight (this one included) is at most the cap.
    for (const c of client.calls) expect(c.spent + c.reserved).toBeLessThanOrEqual(0.1);
    expect(client.calls).toHaveLength(9);
    expect(cap.spentUsd).toBeLessThanOrEqual(0.1);
    expect(cap.reservedUsd).toBe(0);
  });

  it("reserves the bound times the most attempts, so a client with a retry takes two bounds", async () => {
    const cap = costCap(0.1);
    const client = costedClient(cap, { costs: [0.001], maxAttempts: 2, delayMs: 10 });
    await askAll({ items, client, image, cap, concurrency: 8 });
    // 4 reservations of 2 x 0.011010048 fit under USD 0.10 at once (0.0881); a 5th does not.
    expect(client.seen.peak).toBe(4);
    for (const c of client.calls) expect(c.spent + c.reserved).toBeLessThanOrEqual(0.1);
  });

  it("refuses a model that is not in the pinned table", async () => {
    const cap = costCap(1);
    await expect(askAll({ items, client: costedClient(cap, { costs: [0.001], model: "someone/other-model" }), image, cap })).rejects.toThrow(/not in the pinned model table/);
  });

  it("stops the run when a cost is above its bound (the pinned prices are out of date), as a safety check", async () => {
    const cap = costCap(0.1);
    const client = costedClient(cap, { costs: [0.02] });
    const out = await askAll({ items, client, image, cap, concurrency: 1 });
    expect(client.calls).toHaveLength(1);
    expect(out.slice(1).every((r) => r.error === "budget" && r.message === "stopped at the cost cap")).toBe(true);
    expect(cap).toMatchObject({ spentUsd: 0.02, reservedUsd: 0, stopped: true });
    expect(reportMarkdown(comparisonReport({ items, leftOut: [], photos: 3, fake: false, results: { [JEV]: out }, cap }))).toContain("The run stopped at the cost cap");
  });

  it("settles an attempt with no cost at its whole bound, and the report counts the request under missing cost", async () => {
    const cap = costCap(0.1);
    // One request of two attempts: one gave USD 0.003, one gave no cost.
    const client = costedClient(cap, { costs: [0.003], unpriced: 1, maxAttempts: 2 });
    const out = await askAll({ items: items.slice(0, 1), client, image, cap, concurrency: 1 });
    expect(out[0]).toMatchObject({ usd: 0.003, costKnown: false });
    expect(cap.spentUsd).toBeCloseTo(0.003 + B, 12);
    const report = modelReport(JEV, items.slice(0, 1), out, 1);
    expect(report.costMissing).toBe(1);
    expect(report.costUsd).toBeCloseTo(0.003, 12);
    expect(reportMarkdown(comparisonReport({ items: items.slice(0, 1), leftOut: [], photos: 1, fake: false, results: { [JEV]: out }, cap }))).toContain("1 requests with a missing cost");
  });

  it("counts the cost of a failed request that OpenRouter charged", async () => {
    const cap = costCap(1);
    const client = fakeDecisionClient({ answer: () => { throw new DecisionError("unavailable", "503", 0.004); } });
    const out = await askAll({ items: items.slice(0, 2), client, image, cap, concurrency: 1 });
    expect(out.map((r) => [r.error, r.usd, r.costKnown])).toEqual([["unavailable", 0.004, true], ["unavailable", 0.004, true]]);
    expect(cap.spentUsd).toBe(0.008);
  });
});

describe("the real-photo set (#853)", () => {
  const entry = (file: string, device: string, status: string, results: [TruthResult, TruthResult, TruthResult]) => ({
    mapping: { file, device }, status, reason: status === "ready" ? null : "qr",
    photo: { ...photo(`synthetic-physical-${file}`, results), image: { ...photo(`synthetic-physical-${file}`, results).image, sha256: "a".repeat(64) }, truth: [...photo("x", results).truth.slice(0, 3), { itemId: page[3].package.id, format: "two-ways", result: "right" as TruthResult }] },
  });
  const file = (devices = ["iphone"]): PhysicalSetFile => ({
    version: "robin-physical-v2", proofClass: "physical-input", kit: { ...FROZEN_KIT }, devices,
    photos: [entry("iphone-page-3.jpg", "iphone", "ready", ["right", "wrong", "blank"]), entry("iphone-page-3-blurry.jpg", "iphone", "refused", ["right", "right", "right"])],
  });

  it("asks only the photos the page check accepted, names them by file, and records the phones", () => {
    const set = physicalComparisonSet(file());
    expect(set.manifest.synthetic).toBe(false);
    expect(set.manifest.photos.map((p) => p.id)).toEqual(["iphone-page-3.jpg"]);
    expect(set.refused).toEqual([{ file: "iphone-page-3-blurry.jpg", reason: "qr" }]);
    expect(set).toMatchObject({ devices: ["iphone"], bothPhones: false });
    expect(physicalComparisonSet(file(["iphone", "android"])).bothPhones).toBe(true);
    expect(() => physicalComparisonSet({ ...file(), version: "robin-physical-v1" })).toThrow(/physical-set-required/);
  });

  it("refuses anything but the real photos of the Robin kit before a key is read (#853 review)", () => {
    // A local fake control only with a fake run; the proof class is kept for the report.
    expect(() => physicalComparisonSet({ ...file(), proofClass: "local-fake" })).toThrow(/physical-set-proof-class/);
    expect(physicalComparisonSet({ ...file(), proofClass: "local-fake" }, { allowFake: true }).proofClass).toBe("local-fake");
    expect(physicalComparisonSet(file()).proofClass).toBe("physical-input");
    expect(() => physicalComparisonSet({ ...file(), proofClass: undefined })).toThrow(/physical-set-proof-class/);
    expect(() => physicalComparisonSet({ ...file(), kit: { ...FROZEN_KIT, "rendered-workbook.json": "0".repeat(64) } })).toThrow(/not-the-robin-kit/);
    const other = file(); const first = other.photos[0];
    const child = { ...other, photos: [{ ...first, photo: { ...first.photo, truth: first.photo.truth.map((t) => ({ ...t, itemId: t.itemId.replace(/^[^:]+/, "11111111-1111-4111-8111-111111111111") })) } }] };
    expect(() => physicalComparisonSet(child)).toThrow(/physical-set-not-robin/);
    const unhashed = { ...other, photos: [{ ...first, photo: { ...first.photo, image: { ...first.photo.image, sha256: undefined } } }] };
    expect(() => physicalComparisonSet(unhashed)).toThrow(/image-hash-required/);
    expect(() => checkPhysicalImages(file(), () => "b".repeat(64))).toThrow(/image-changed/);
    expect(() => checkPhysicalImages(file(), () => "a".repeat(64))).not.toThrow();
  });

  it("leaves a labelled two-ways item out (our team marks it) instead of asking its method regions", () => {
    const { items, leftOut } = comparisonItems(physicalComparisonSet(file()).manifest);
    expect(items.map((i) => i.result)).toEqual(["right", "wrong", "blank"]);
    expect(leftOut).toEqual([{ photo: "iphone-page-3.jpg", itemId: page[3].package.id, format: "two-ways" }]);
  });

  it("refuses a set with fewer than 40 wrong or 20 blank items", () => {
    const items = (wrong: number, blank: number) => [...Array(wrong).fill("wrong"), ...Array(blank).fill("blank")].map((result, n) => ({ photo: "p", clear: true, itemId: `i${n}`, number: n, format: "whole", result, regions: [] }));
    expect(PHYSICAL_MIN_ITEMS).toEqual({ wrong: 40, blank: 20 });
    expect(physicalShortfall(items(40, 20))).toBeNull();
    expect(physicalShortfall(items(33, 17))).toBe("physical-set-too-few-items: 33 wrong (needs 40), 17 blank (needs 20)");
    expect(physicalShortfall(items(40, 19))).toMatch(/19 blank/);
  });

  it("says in the report which phones and which photos were refused", () => {
    const set = physicalComparisonSet(file());
    const { items, leftOut } = comparisonItems(set.manifest);
    const md = reportMarkdown(comparisonReport({ items, leftOut, photos: 1, fake: false, results: {}, physical: set }));
    expect(md).toContain("Real phone photos of the made-up Robin booklet (iphone)");
    expect(md).toContain("iphone-page-3-blurry.jpg: qr");
    expect(md).toContain("One phone only: Android not tested.");
    expect(md).not.toContain("Synthetic ink");
  });
});

describe("the winner (#853)", () => {
  // A model whose false Right is 0 from `zeroFrom` up, and whose confirm rate falls from `confirm` by 0.01 a step.
  const model = (name: string, zeroFrom: number, confirm: number, incomplete: string | null = null) => ({
    model: name, incomplete,
    thresholds: THRESHOLDS.map((threshold) => ({ threshold, confirmed: 0, confirmRate: Math.round((confirm - (threshold - 0.5)) * 100) / 100, falseRight: threshold >= zeroFrom ? 0 : 1, falseRightBy: { wrong: 0, blank: 0, uncertain: 0 } })),
  }) as unknown as ModelReport;
  const report = (physical: boolean, models: ModelReport[], o: { fake?: boolean; bothPhones?: boolean } = {}) =>
    ({ synthetic: !physical, physical: physical ? { devices: ["iphone"], bothPhones: o.bothPhones ?? true, refused: [] } : null, fake: !!o.fake, models }) as unknown as ComparisonReport;

  it("takes the lowest threshold that passes on both sets, and the higher real-photo confirm rate between models", () => {
    const syn = report(false, [model(JEV, 0.6, 0.99), model(GEMINI, 0.55, 0.99)]);
    // Gemini's real photos reach 0 false Right at 0.62, where it confirms only 73%: below the bar.
    const real = report(true, [model(JEV, 0.65, 0.99), model(GEMINI, 0.62, 0.85)]);
    const w = comparisonWinner(syn, real);
    expect(w.winner).toEqual({ model: JEV, threshold: 0.65, syntheticConfirmRate: 0.84, physicalConfirmRate: 0.84 });
    expect(w.candidates).toHaveLength(1);
    expect(w.notes).toEqual([`${GEMINI}: no threshold passes the bar on both sets.`]);
  });

  it("prefers the higher confirm rate on the real photos when both pass", () => {
    const w = comparisonWinner(report(false, [model(JEV, 0.5, 0.99), model(GEMINI, 0.5, 0.99)]), report(true, [model(JEV, 0.6, 0.95), model(GEMINI, 0.55, 0.99)]));
    expect(w.winner?.model).toBe(GEMINI);
    expect(w.candidates.map((c) => c.model).sort()).toEqual([GEMINI, JEV].sort());
    expect(winnerMarkdown(w)).toContain(`Winner: ${GEMINI} at threshold 0.55`);
  });

  it("names no winner for a fake run, an incomplete model, or no passing threshold, and flags a one-phone set", () => {
    expect(comparisonWinner(report(false, [model(JEV, 0.5, 0.99)]), report(true, [model(JEV, 0.5, 0.99)], { fake: true })).winner).toBeNull();
    const inc = comparisonWinner(report(false, [model(JEV, 0.5, 0.99)]), report(true, [model(JEV, 0.5, 0.99, "incomplete: 2 non-right requests failed")]));
    expect(inc.winner).toBeNull();
    expect(inc.notes.join(" ")).toMatch(/real incomplete: 2/);
    const none = comparisonWinner(report(false, [model(JEV, 0.9, 0.5)]), report(true, [model(JEV, 0.9, 0.5)], { bothPhones: false }));
    expect(none.winner).toBeNull();
    expect(winnerMarkdown(none)).toContain("No model passes the bar on both sets.");
    expect(none.notes[0]).toMatch(/one phone only/);
    expect(() => comparisonWinner(report(true, []), report(true, []))).toThrow(/winner-needs/);
  });
});
