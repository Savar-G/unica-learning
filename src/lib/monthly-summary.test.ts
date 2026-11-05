import { describe, expect, it } from "vitest";
import { memorySummaryQuota, monthLabel, renderMonthlySummary, renderSlots, summaryDocument, summaryFileName, SUMMARY_BOTTOM } from "@/lib/monthly-summary";
import type { MonthlySummaryView } from "@/lib/parent-view";
import { fakePrintEngine } from "@/lib/print-engine-fake";

// The monthly summary PDF (#562), through its public interface, with the fake print engine.

const full: MonthlySummaryView = {
  firstName: "Leah", schoolGrade: 3, month: "2026-10", madeOn: "2026-11-05",
  level: { working: 4, earlySign: false, testedOn: "2026-09-10" },
  areas: [
    { area: "number", name: "Number and operations", level: 4, label: "ahead", earlySign: false },
    { area: "fractions", name: "Fractions and decimals", level: 2, label: "building-up", earlySign: true },
  ],
  mailed: [{ number: 2, shippedOn: "2026-10-14" }],
  daysScanned: 7, mayaCalls: 3,
  next: { earliest: "2026-10-28", latest: "2026-11-15" },
};
const empty: MonthlySummaryView = { ...full, level: null, areas: [], mailed: [], daysScanned: 0, mayaCalls: 0, next: null };
/** The words a parent reads, without tags or style. */
const words = (v: MonthlySummaryView) => summaryDocument(v).replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");

describe("the summary page", () => {
  it("prints one Letter sheet through the print engine and gives the PDF and its page image", async () => {
    const engine = fakePrintEngine();
    const out = await renderMonthlySummary({ view: full, engine });
    expect(out.status).toBe("rendered");
    expect(engine.jobs).toHaveLength(1);
    expect(engine.jobs[0]).toMatchObject({ sheets: 1, page: { width: 816, height: 1056 }, scale: 150 / 96 });
    if (out.status === "rendered") {
      expect(new TextDecoder().decode(out.pdf)).toBe("%PDF-fake");
      expect(new TextDecoder().decode(out.png)).toBe("png-1");
    }
  });

  it("holds the level, the area bars, the month's workbooks, scanned days, Maya calls and the next book's range", () => {
    const text = words(full);
    for (const s of [
      "Leah, October 2026", "Made on November 5, 2026", "Working at Grade 4", "Ahead", "In Grade 3 at school. From the test on September 10, 2026.",
      "Level by area", "Number and operations", "Fractions and decimals", "Building up · Early sign", "The line marks the school grade, Grade 3.",
      "Early sign: too few answers in this area to be sure.", "Workbook mailed Workbook 2, on October 14", "Days of work scanned 7", "Calls with Maya 3",
      "What comes next", "Next workbook: October 28 to November 15, 2026", "An estimate.",
    ]) expect(text).toContain(s);
  });

  it("hides every section with no data, and says so when nothing is left", () => {
    const text = words(empty);
    for (const s of ["Level", "Level by area", "Workbook", "Days of work", "Maya", "What comes next"]) expect(text.replace("Monthly summary", "")).not.toContain(s);
    expect(text).toContain("There is nothing to show for October 2026 yet.");
    // One section alone: only the calls.
    const calls = words({ ...empty, mayaCalls: 1 });
    expect(calls).toContain("Calls with Maya 1");
    expect(calls).not.toContain("Days of work scanned");
    expect(calls).not.toContain("nothing to show");
    // Area bars need the level they came with.
    expect(words({ ...full, level: null })).not.toContain("Level by area");
  });

  it("an estimated level says Early sign", () => {
    expect(words({ ...full, level: { ...full.level!, earlySign: true } })).toContain("Early sign: the test had too few answers to be sure of this level.");
    expect(words(full)).not.toContain("sure of this level");
  });

  it("names the child, never she or her, and shows no percent, wrong answers or other children", () => {
    for (const v of [full, empty, { ...full, level: { ...full.level!, earlySign: true } }]) {
      const text = words(v);
      expect(text).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
      expect(text).not.toMatch(/%|percent|wrong|other children|average|transcript|photo/i);
      expect(text).not.toMatch(/\u2014/);
    }
  });

  it("escapes the child's name", () => {
    const html = summaryDocument({ ...full, firstName: `<img src=x onerror="a">` });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;");
  });

  it("embeds the given fonts", () => {
    const html = summaryDocument(full, { sans: new Uint8Array([1, 2]), mono: new Uint8Array([3]) });
    expect(html).toContain(`font-family:"Summary Sans"`);
    expect(html).toContain("data:font/woff2;base64,AQI=");
  });
});

describe("one page, never cut off", () => {
  it("fails when the content runs past the page's bottom margin", async () => {
    const engine = fakePrintEngine({ rects: { "1 summary-end": { x: 64, y: SUMMARY_BOTTOM, width: 688, height: 1 } } });
    expect(await renderMonthlySummary({ view: full, engine })).toEqual({ status: "failed", reason: "the summary does not fit on one page" });
    const fits = fakePrintEngine({ rects: { "1 summary-end": { x: 64, y: SUMMARY_BOTTOM - 1, width: 688, height: 1 } } });
    expect((await renderMonthlySummary({ view: full, engine: fits })).status).toBe("rendered");
  });
  it("fails when the PDF has more than one page, and when the end mark is hidden", async () => {
    expect(await renderMonthlySummary({ view: full, engine: fakePrintEngine({ pdfPages: 2 }) })).toEqual({ status: "failed", reason: "the PDF has 2 pages" });
    expect((await renderMonthlySummary({ view: full, engine: fakePrintEngine({ hidden: ["1 summary-end"] }) })).status).toBe("failed");
  });
  it("throws an engine error", async () => {
    await expect(renderMonthlySummary({ view: full, engine: { print: async () => { throw new Error("no Chromium"); } } })).rejects.toThrow("no Chromium");
  });
});

describe("names", () => {
  it("the month in words, and a file name in plain letters", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(summaryFileName({ firstName: "Zoë Anne", month: "2026-10" })).toBe("Zoe-Anne-2026-10-summary.pdf");
    expect(summaryFileName({ firstName: "李", month: "2026-10" })).toBe("child-2026-10-summary.pdf");
  });
});

describe("the render limits", () => {
  const MIN = 60_000;
  it("the shared count lets a parent make a few summaries, then refuses until the oldest try leaves the window", async () => {
    const quota = memorySummaryQuota({ perParent: 2, windowMs: 10 * MIN });
    expect(await quota.claim("p1", 0)).toBe(true);
    expect(await quota.claim("p1", MIN)).toBe(true);
    expect(await quota.claim("p1", 2 * MIN)).toBe(false);
    expect(await quota.claim("p2", 2 * MIN)).toBe(true);
    expect(await quota.claim("p1", 10 * MIN)).toBe(true);
    expect(await quota.claim("p1", 10 * MIN)).toBe(false);
  });
  it("the shared count holds 5 tries in 10 minutes by default", async () => {
    const quota = memorySummaryQuota();
    for (let i = 0; i < 5; i++) expect(await quota.claim("p1", i)).toBe(true);
    expect(await quota.claim("p1", 10 * MIN - 1)).toBe(false);
  });
  it("each instance renders at most 2 at once", () => {
    const slots = renderSlots();
    expect(slots.take()).toBe(true);
    expect(slots.take()).toBe(true);
    expect(slots.take()).toBe(false);
    slots.release();
    expect(slots.take()).toBe(true);
  });
});
