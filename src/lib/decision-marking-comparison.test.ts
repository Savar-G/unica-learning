import { describe, expect, it } from "vitest";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import type { QuestionPackage } from "@/lib/question-package";
import type { PrintedRegion } from "@/lib/workbook-print-contract";
import { DecisionError, type DecisionClient } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { openRouterDecisionClient } from "@/lib/decision-openrouter";
import { markingRegions } from "@/lib/scan-marking-regions";
import {
  THRESHOLDS,
  askAll,
  comparisonItems,
  comparisonReport,
  costCap,
  cropRect,
  imageSize,
  modelReport,
  regionQuestion,
  reportMarkdown,
  type AskResult,
  type SetManifest,
  type SetPhoto,
  type TruthResult,
} from "@/lib/decision-marking-comparison";

// The synthetic second-opinion comparison (#851) through its public interface: made-up Robin packages, fake decisions.

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

  it("refuses a set that is not synthetic", () => {
    const m = { ...manifest(), identity: { containsRealData: true } } as unknown as SetManifest;
    expect(() => comparisonItems(m)).toThrow(/synthetic-set-required/);
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
      return { photo: i.photo, itemId: i.itemId, regionId: r.regionId, yes: y, error: y === null ? "timeout" as const : null, ms: 100, usd: 0.00001, provider: "TypeSafe" };
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
      return new Response(JSON.stringify({ model, answers: { shows: { type: "noul", noul: replies.get(result) } }, usage: { input_tokens: 900, output_tokens: 0, cost: 0.00004 }, id: "gen-dec-x", provider: model === "a" ? "TypeSafe" : "Google AI Studio" }), { status: 200 });
    };
    const image = async (item: (typeof items)[number], region: (typeof items)[number]["regions"][number]) => {
      const data = new TextEncoder().encode(`${item.photo}/${item.itemId}/${region.regionId}`);
      byImage.set(`data:image/jpeg;base64,${Buffer.from(data).toString("base64")}`, item.result);
      return { data, estimateUsd: 0.0001 };
    };
    const cap = costCap(1);
    const all: Record<string, AskResult[]> = {};
    for (const model of ["a", "b"]) all[model] = await askAll({ items, client: openRouterDecisionClient({ apiKey: "fake", model, provider: "fake", fetch: fetchFor(model) }), image, cap });
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
    expect(md).toContain("| a | 0.50 | 100.0% | yes |");
    expect(md).toContain("## Parent rows left out");
    expect(report.cap).toMatchObject({ maxUsd: 1, stopped: false });
    expect(report.cap!.spentUsd).toBeCloseTo(24 * 0.00004, 10);
    expect(md).toContain("Cost cap: USD 1; spent USD 0.000960.");
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
    const out = await askAll({ items, client, image: async () => ({ data: new Uint8Array([1]), estimateUsd: 0 }), cap: costCap(1), concurrency: 1 });
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
      { photo: right.photo, itemId: right.itemId, regionId: "answer", yes: 0.9, error: null, ms: 100, usd: 0.00001, provider: "TypeSafe" },
      { photo: wrong.photo, itemId: wrong.itemId, regionId: "answer", yes: null, error: "timeout", message: "time is up", ms: 20_000, usd: null, provider: null },
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

describe("the cost cap (#851 review, finding 3)", () => {
  const { items } = comparisonItems(manifest());

  /** A client whose request number n costs costs[n] (null: no cost) and answers after `delayMs`; it records the cap at each call. */
  function costedClient(costs: (number | null)[], cap: ReturnType<typeof costCap>, delayMs = 0) {
    const calls: { spent: number; reserved: number }[] = [];
    let inFlight = 0;
    const seen = { peak: 0 };
    const client: DecisionClient & { calls: typeof calls; seen: typeof seen } = {
      model: "m", calls, seen,
      async decide() {
        const n = calls.length;
        calls.push({ spent: cap.spentUsd, reserved: cap.reservedUsd });
        seen.peak = Math.max(seen.peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        inFlight--;
        return { answers: { shows: noul(0.9) }, usd: costs[Math.min(n, costs.length - 1)], provider: "fake", id: null };
      },
    };
    return client;
  }
  const image = (estimates: number[]) => {
    let n = 0;
    return async () => ({ data: new Uint8Array([1]), estimateUsd: estimates[Math.min(n++, estimates.length - 1)] });
  };

  it("stops at the cost cap: a USD 0.10 cap, a request estimated at USD 0.05 that costs USD 0.20", async () => {
    const cap = costCap(0.1);
    const client = costedClient([0.2], cap);
    const out = await askAll({ items, client, image: image([0.05]), cap, concurrency: 1 });
    expect(client.calls).toHaveLength(1);
    expect(out[0]).toMatchObject({ error: null, usd: 0.2 });
    expect(out.slice(1).every((r) => r.error === "budget" && r.message === "stopped at the cost cap")).toBe(true);
    expect(cap).toMatchObject({ spentUsd: 0.2, reservedUsd: 0, stopped: true });
    const md = reportMarkdown(comparisonReport({ items, leftOut: [], photos: 3, fake: false, results: { m: out }, cap }));
    expect(md).toContain("The run stopped at the cost cap");
  });

  it("with concurrent requests, admits no request whose reservation does not fit beside the ones in flight, and stops when a cost passes its reservation", async () => {
    const cap = costCap(0.1);
    const client = costedClient([0.2], cap, 20);
    const out = await askAll({ items, client, image: image([0.05]), cap, concurrency: 3 });
    // Two reservations of USD 0.05 fit under USD 0.10 together and are both in flight before any cost arrives; the third
    // waits, then the run stops.
    expect(client.calls).toEqual([{ spent: 0, reserved: 0.1 }, { spent: 0, reserved: 0.1 }]);
    expect(client.seen.peak).toBe(2);
    expect(out.filter((r) => r.error === "budget")).toHaveLength(out.length - 2);
    expect(cap).toMatchObject({ spentUsd: 0.4, reservedUsd: 0, stopped: true });
  });

  it("with costs within their reservations and 4 requests in flight, never admits past the cap and spends at most the cap", async () => {
    const cap = costCap(1);
    const client = costedClient([0.125], cap, 10);
    const out = await askAll({ items, client, image: image([0.25]), cap, concurrency: 4 });
    expect(client.seen.peak).toBe(4);
    for (const c of client.calls) expect(c.spent + c.reserved).toBeLessThanOrEqual(1);
    expect(cap.stopped).toBe(false);
    expect(cap.spentUsd).toBeLessThanOrEqual(1);
    expect(out.reduce((sum, r) => sum + (r.usd ?? 0), 0)).toBe(cap.spentUsd);
    expect(out.some((r) => r.error === "budget" && r.message === "not admitted: the cost cap is full")).toBe(true);
  });

  it("reserves 2 x the highest cost seen when that is above the estimate", async () => {
    // Request 1: estimate and cost USD 0.25. Then estimates of USD 0.0625 each reserve USD 0.50: 6 requests fit under USD 1.
    const cap = costCap(1);
    const client = costedClient([0.25, 0.0625], cap);
    const out = await askAll({ items, client, image: image([0.25, 0.0625]), cap, concurrency: 1 });
    expect(client.calls).toHaveLength(6);
    expect(out.filter((r) => r.error === "budget")).toHaveLength(out.length - 6);
    expect(cap).toMatchObject({ spentUsd: 0.5625, stopped: false });
  });

  it("counts a missing cost as its reservation", async () => {
    const cap = costCap(1);
    const client = costedClient([null], cap);
    await askAll({ items, client, image: image([0.25]), cap, concurrency: 1 });
    expect(client.calls).toHaveLength(4);
    expect(cap).toMatchObject({ spentUsd: 1, reservedUsd: 0, stopped: false });
  });

  it("counts the cost of a failed request that OpenRouter charged", async () => {
    const cap = costCap(1);
    const client = fakeDecisionClient({ answer: () => { throw new DecisionError("unavailable", "503", 0.125); } });
    const out = await askAll({ items: items.slice(0, 2), client, image: image([0.25]), cap, concurrency: 1 });
    expect(out.map((r) => [r.error, r.usd])).toEqual([["unavailable", 0.125], ["unavailable", 0.125]]);
    expect(cap.spentUsd).toBe(0.25);
  });
});
