import { describe, expect, it } from "vitest";
import { barPercent, callFlagged, callSummary, emailBars, flyerMetrics, reviewSummary, type CallStatRow } from "@/lib/admin-pages";
import type { FlyerRow } from "@/lib/flyers";

// The summary strips of the remaining admin pages, through the module's public interface.

describe("barPercent", () => {
  it("is a share of the longest bar, with a sliver for any value above 0", () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(10, 10)).toBe(100);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(20, 10)).toBe(100);
  });
});

describe("Maya's call summary", () => {
  const now = new Date("2026-11-10T20:00:00Z");
  const call = (over: Partial<CallStatRow>): CallStatRow => ({ created_at: "2026-11-09T20:00:00Z", parent_id: "real", call_seconds: 90, flag: null, safety_severity: null, safety_flag: false, ...over });

  it("counts the last 7 days of real families only: calls, rounded minutes and flagged calls", () => {
    const rows = [
      call({}),
      call({ call_seconds: 45, flag: "safety_concern" }),
      call({ parent_id: "test", call_seconds: 600, flag: "safety_immediate" }),
      call({ created_at: "2026-11-02T19:59:59Z", call_seconds: 600 }),
      call({ call_seconds: null, safety_severity: "immediate" }),
    ];
    expect(callSummary(rows, now, (id) => id === "test")).toEqual({ calls: 3, minutes: 2, flagged: 2 });
  });

  it("names a call saved before flags existed as flagged, the way the list does", () => {
    expect(callFlagged({ flag: null, safety_severity: "concern", safety_flag: false })).toBe(true);
    expect(callFlagged({ flag: null, safety_severity: null, safety_flag: true })).toBe(true);
    expect(callFlagged({ flag: "unsafe_request", safety_severity: null, safety_flag: false })).toBe(true);
    expect(callFlagged({ flag: null, safety_severity: null, safety_flag: false })).toBe(false);
  });
});

describe("the emails by kind", () => {
  it("drops kinds that never sent, puts the busiest first, and sizes the clicked part inside each bar", () => {
    const bars = emailBars([
      { kind: "start", label: "Start reminder", sent: 10, failed: 1, clicked: 5, pending: 0 },
      { kind: "report", label: "Report email", sent: 20, failed: 0, clicked: 2, pending: 0 },
      { kind: "come_back", label: "Come back reminder", sent: 0, failed: 0, clicked: 0, pending: 0 },
      { kind: "continue", label: "Continue reminder", sent: 0, failed: 2, clicked: 0, pending: 0 },
    ]);
    expect(bars.map((b) => [b.kind, b.width, b.clickedShare])).toEqual([["report", 100, 10], ["start", 50, 50], ["continue", 0, 0]]);
  });
});

describe("the AI review summary", () => {
  it("counts no mistake as what is left after slips and misunderstandings", () => {
    const s = reviewSummary({ total: 10, low: 3, slip: 2, misunderstanding: 5 });
    expect(s.low).toBe(3);
    expect(s.kinds.map((k) => [k.kind, k.n])).toEqual([["misunderstanding", 5], ["slip", 2], ["none", 3]]);
    expect(reviewSummary({ total: 1, low: 0, slip: 1, misunderstanding: 1 }).kinds.at(-1)!.n).toBe(0);
  });
});

describe("flyer A against flyer B", () => {
  const row = (over: Partial<FlyerRow>): FlyerRow => ({ code: "a", delivered: 200, scans: 10, accounts: 4, started: 3, finished: 2, cardSaved: 1, paying: 0, ...over });

  it("gives each measure a pair of bars against the larger side, and names the side ahead", () => {
    const m = flyerMetrics(row({}), row({ code: "b", delivered: 100, scans: 10, accounts: 8, finished: 2, paying: 0 }));
    expect(m.map((x) => x.key)).toEqual(["scans", "signups", "finished", "cards", "paying"]);
    expect(m[0]).toMatchObject({ a: { value: 5, width: 50 }, b: { value: 10, width: 100 }, lead: "b" });
    expect(m[1]).toMatchObject({ a: { value: 4, width: 50 }, b: { value: 8, width: 100 }, lead: "b" });
    expect(m[2].lead).toBeNull();
    expect(m[4]).toMatchObject({ a: { width: 0 }, b: { width: 0 }, lead: null });
  });

  it("shows no scan rate and no leader until both handed-out counts are in", () => {
    const m = flyerMetrics(row({ delivered: 0 }), row({ code: "b" }));
    expect(m[0]).toMatchObject({ a: { value: null, text: "-", width: 0 }, lead: null });
  });
});
