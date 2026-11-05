import { afterEach, describe, expect, it, vi } from "vitest";
import { summaryLimiter } from "@/lib/monthly-summary";
import { monthlySummaryResponse, type SummaryRequest } from "@/lib/monthly-summary-server";
import { memoryParentViewReaders, type MemoryParentViewTables } from "@/lib/parent-view-memory";
import { fakePrintEngine } from "@/lib/print-engine-fake";

// The monthly summary route's answer (#562), with the in-memory parent view reader and the fake print engine.
vi.mock("server-only", () => ({}));
afterEach(() => vi.restoreAllMocks());

const NOW = Date.parse("2026-11-04T18:00:00Z");
const own = { parentId: "parent-1", childId: "child-1" };
const TABLES: MemoryParentViewTables = {
  children: [
    { id: "child-1", parentId: "parent-1", firstName: "Leah", grade: 3, createdAt: "2026-09-01T00:00:00Z" },
    { id: "child-2", parentId: "parent-2", firstName: "Omar", grade: 5, createdAt: "2026-09-02T00:00:00Z" },
  ],
  cards: [{ ...own, cardSavedAt: "2026-09-20T00:00:00Z" }, { parentId: "parent-2", childId: "child-2", cardSavedAt: "2026-09-20T00:00:00Z" }],
  deliveries: [{ ...own, workbookId: "wb-1", deliveredAt: "2026-09-28T18:00:00Z" }, { parentId: "parent-2", childId: "child-2", deliveredAt: "2026-09-28T18:00:00Z" }],
  workbooks: [{ ...own, id: "wb-1", number: 1, status: "shipped", shippedAt: "2026-10-14T18:00:00Z" }],
  maya: [{ ...own, kind: "child", createdAt: "2026-10-02T18:00:00Z", usedSeconds: 120 }],
};
const FONTS = { sans: new Uint8Array([1]), mono: new Uint8Array([2]) };

function request(over: Partial<SummaryRequest> = {}, tables: MemoryParentViewTables = TABLES) {
  const readers = memoryParentViewReaders(tables);
  const engine = fakePrintEngine();
  const r: SummaryRequest = {
    deskOpen: false, parent: "parent-1", childId: "child-1", month: "2026-10", now: NOW,
    access: async () => true, reader: (p) => readers.parent(p), engine: () => engine, fonts: async () => FONTS,
    limiter: summaryLimiter(), signInUrl: "https://unicalearning.com/sign-in", ...over,
  };
  return { r, engine, readers };
}
const text = (res: Response) => res.text();

describe("the monthly summary route", () => {
  it("answers the parent's own child's month as a private PDF that no shared cache keeps", async () => {
    const { r, engine } = request();
    const res = await monthlySummaryResponse(r);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="Leah-2026-10-summary.pdf"`);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("%PDF-fake");
    expect(engine.jobs).toHaveLength(1);
    expect(engine.jobs[0].html).toContain("Leah, October 2026");
    expect(engine.jobs[0].html).toContain("Calls with Maya");
  });

  it("refuses while the child's desk is open on this device, before any read or render", async () => {
    const { r, engine, readers } = request({ deskOpen: true });
    const res = await monthlySummaryResponse(r);
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ ok: false, error: "desk_open" });
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(engine.jobs).toHaveLength(0);
    expect(Object.values(readers.reads).every((n) => n === 0)).toBe(true);
  });

  it("sends a signed-out visitor to sign-in", async () => {
    const res = await monthlySummaryResponse(request({ parent: null }).r);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://unicalearning.com/sign-in");
  });

  it("is not found for a family the dashboard is not open to, another family's child, a month not offered and no month", async () => {
    for (const over of [{ access: async () => false }, { childId: "child-2" }, { month: "2026-11" }, { month: "2026-08" }, { month: null }, { month: "x" }]) {
      const { r, engine } = request(over);
      const res = await monthlySummaryResponse(r);
      expect(res.status).toBe(404);
      expect(await text(res)).toBe("We cannot find a summary for this month.");
      expect(engine.jobs).toHaveLength(0);
    }
  });

  it("limits a parent's tries, and the renders running at once", async () => {
    const limiter = summaryLimiter({ perParent: 2, windowMs: 600_000, concurrent: 2 });
    expect((await monthlySummaryResponse(request({ limiter }).r)).status).toBe(200);
    expect((await monthlySummaryResponse(request({ limiter, month: "2026-12" }).r)).status).toBe(404);
    const third = await monthlySummaryResponse(request({ limiter }).r);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("600");

    const busy = { take: () => "busy" as const, release: vi.fn() };
    const res = await monthlySummaryResponse(request({ limiter: busy }).r);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("15");
    expect(busy.release).not.toHaveBeenCalled();
  });

  it("frees its render slot whatever happens", async () => {
    const limiter = summaryLimiter({ perParent: 10, windowMs: 600_000, concurrent: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { print: async () => { throw new Error("no Chromium"); } };
    expect((await monthlySummaryResponse(request({ limiter, engine: () => broken }).r)).status).toBe(503);
    expect((await monthlySummaryResponse(request({ limiter }).r)).status).toBe(200);
  });

  it("a failed read, engine or one-page check answers in plain words, and logs no family data", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = request({}, { ...TABLES, fail: ["children"] }).r;
    const overflow = request({ engine: () => fakePrintEngine({ pdfPages: 2 }) }).r;
    for (const r of [failing, overflow]) {
      const res = await monthlySummaryResponse(r);
      expect(res.status).toBe(503);
      expect(await text(res)).toBe("We cannot make this summary right now. Try again in a moment.");
      expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    }
    expect(JSON.stringify(error.mock.calls)).not.toContain("Leah");
  });
});
