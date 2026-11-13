import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { DecisionError } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import {
  activePageGates, checkRenderedPages, decisionPageGateChecker, pageGateChecker, pageGateKey, pageGateMark, pageGateTerms,
  PAGE_GATE_MAX_SIDE, PAGE_GATE_THRESHOLDS, scaledPage, type PageGateChecker, type PageGateTerms, type StoredPageGate,
} from "@/lib/workbook-page-gates";

// #859: the page layout gate through its public interface, with the fake decision client and real PNG images.

const page = async (width: number, height: number) => new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer());
const on: PageGateTerms = {
  text_cut_off: { enabled: true, threshold: 0.5 },
  overlap: { enabled: true, threshold: 0.5 },
  box_too_small: { enabled: false, threshold: null, reason: "test: off" },
};
const signal = () => new AbortController().signal;

describe("the page layout gate", () => {
  it("is off for every model until it is calibrated, so a run asks nothing", () => {
    for (const model of Object.keys(PAGE_GATE_THRESHOLDS)) expect(activePageGates(pageGateTerms(model))).toEqual([]);
    expect(activePageGates(pageGateTerms("some/other-model"))).toEqual([]);
    const client = fakeDecisionClient({ answer: () => { throw new Error("must not be asked"); } });
    expect(pageGateChecker(client)).toBeNull();
    expect(decisionPageGateChecker({ DECISIONS_OPENROUTER_API_KEY: "synthetic" })).toBeNull();
  });

  it("sends one scaled page image and only the gates that are on, and flags a page at or above a threshold", async () => {
    const client = fakeDecisionClient({ answer: () => ({ text_cut_off: noul(0.8), overlap: noul(0.1) }) });
    const checker = pageGateChecker(client, on)!;
    const row = await checker.check(7, await page(2550, 3300), signal());
    expect(client.requests).toHaveLength(1);
    const [request] = client.requests;
    expect(Object.keys(request.questions).sort()).toEqual(["overlap", "text_cut_off"]);
    expect(request.input).toHaveLength(1);
    const image = request.input[0];
    if (image.type !== "image") throw new Error("not an image");
    const size = await sharp(image.data).metadata();
    expect(Math.max(size.width!, size.height!)).toBe(PAGE_GATE_MAX_SIDE);
    expect(row).toMatchObject({ callKey: "page:7", questionId: "page-7", outcome: "flag", flags: ["text_cut_off"], probabilities: { text_cut_off: 0.8, overlap: 0.1 } });
    expect(pageGateMark(row)).toMatchObject({ outcome: "flag", flags: ["text_cut_off"], reason: expect.stringContaining("text may be cut off") });
  });

  it("passes a clean page, and never scales a small page up", async () => {
    const client = fakeDecisionClient({ answer: () => ({ text_cut_off: noul(0.1), overlap: noul(0.49) }) });
    const row = await pageGateChecker(client, on)!.check(2, await page(800, 1000), signal());
    expect(row.outcome).toBe("pass");
    expect(pageGateMark(row)).toBeNull();
    const image = client.requests[0].input[0];
    if (image.type !== "image") throw new Error("not an image");
    expect((await sharp(image.data).metadata()).width).toBe(800);
    expect((await sharp(await scaledPage(await page(1000, 4000))).metadata()).height).toBe(PAGE_GATE_MAX_SIDE);
  });

  it("stores an errored request as unknown, which flags the page for review", async () => {
    const client = fakeDecisionClient({ answer: () => { throw new DecisionError("unavailable", "synthetic outage"); } });
    const row = await pageGateChecker(client, on)!.check(3, await page(100, 100), signal());
    expect(row).toMatchObject({ outcome: "unknown", flags: [], callKey: "page:3" });
    expect(pageGateMark(row)?.outcome).toBe("unknown");
  });
});

describe("checking a run's rendered pages", () => {
  const fake = (outcome: (n: number) => StoredPageGate["outcome"]) => {
    const asked: number[] = [];
    const checker: PageGateChecker = {
      model: "typesafe/jev-1.14",
      check: async (n) => {
        asked.push(n);
        const o = outcome(n);
        return { callKey: pageGateKey(n), questionId: `page-${n}`, model: "typesafe/jev-1.14", thresholdVersion: 1, outcome: o, flags: o === "flag" ? ["overlap"] : [], probabilities: {}, reason: null };
      },
    };
    return { checker, asked };
  };
  const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, png: new Uint8Array([i]) }));

  it("asks each page once, in page order, saves each row before the next, and does not ask a stored page again", async () => {
    const { checker, asked } = fake((n) => (n === 2 ? "flag" : "pass"));
    const saved: string[] = [];
    const stored: StoredPageGate[] = [{ callKey: "page:3", questionId: "page-3", model: "typesafe/jev-1.14", thresholdVersion: 1, outcome: "flag", flags: ["text_cut_off"], probabilities: {}, reason: null }];
    const { rows } = await checkRenderedPages(checker, stored, [...pages(4)].reverse(), async (row) => { saved.push(row.callKey); }, signal());
    expect(asked).toEqual([1, 2, 4]);
    expect(saved).toEqual(["page:1", "page:2", "page:4"]);
    expect([...rows.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(rows.get(3)?.flags).toEqual(["text_cut_off"]);
    expect(rows.get(2)?.outcome).toBe("flag");
  });

  it("stops asking after 10 requests when more than 20% errored", async () => {
    const { checker, asked } = fake((n) => (n <= 3 ? "unknown" : "pass"));
    const { rows, unavailable } = await checkRenderedPages(checker, [], pages(20), async () => {}, signal());
    expect(asked).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.size).toBe(10);
    expect(unavailable).toBe(true);
  });

  it("stops the pass when a save fails", async () => {
    const { checker, asked } = fake(() => "pass");
    await expect(checkRenderedPages(checker, [], pages(3), async () => { throw new Error("lease lost"); }, signal())).rejects.toThrow("lease lost");
    expect(asked).toEqual([1]);
  });
});
