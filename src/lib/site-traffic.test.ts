import { describe, expect, it } from "vitest";
import { consentGapNote, countryName, parseSiteTraffic, provinceName, sharePercent, trafficCall, trafficRange } from "@/lib/site-traffic";

describe("the range", () => {
  it("is the past 7 days unless another is asked for", () => {
    expect(trafficRange(undefined).key).toBe("7d");
    expect(trafficRange("nope").key).toBe("7d");
    expect(trafficRange("all").days).toBeNull();
    expect(trafficRange("today").days).toBe(1);
    expect(trafficCall(trafficRange("all"), false)).toEqual({ p_days: null, p_with_tests: false });
    expect(trafficCall(trafficRange("7d"), true)).toEqual({ p_days: 7, p_with_tests: true });
  });
});

describe("reading the database answer", () => {
  it("survives an empty or broken answer", () => {
    for (const j of [null, {}, [], "x", { windows: 5, daily: "x" }]) {
      const t = parseSiteTraffic(j);
      expect(t.windows.all).toEqual({ visits: 0, views: 0 });
      expect(t.daily).toEqual([]);
      expect(t.funnel.accounts).toBe(0);
    }
  });
  it("reads every part", () => {
    const t = parseSiteTraffic({
      windows: { today: { visits: 2, views: 3 }, all: { visits: "9", views: 12 } },
      daily: [{ day: "2026-11-12", visits: 2, views: 3 }],
      referrers: [{ label: "google.com", visits: 4 }],
      pages: [{ label: "/", views: 7, visits: 5 }],
      campaigns: [{ source: "meta", medium: "paid", campaign: null, visits: 10, signups: 1 }],
      funnel: { visits: 10, start_open: 5, accounts: 2, started: 1, finished: 1 },
      first_hit: "2026-11-12T10:00:00Z",
    });
    expect(t.windows.today).toEqual({ visits: 2, views: 3 });
    expect(t.windows.all.visits).toBe(9);
    expect(t.referrers).toEqual([{ label: "google.com", visits: 4 }]);
    expect(t.pages[0]).toEqual({ label: "/", visits: 5, views: 7 });
    expect(t.campaigns[0]).toEqual({ source: "meta", medium: "paid", campaign: null, visits: 10, signups: 1 });
    expect(t.funnel).toEqual({ visits: 10, startOpen: 5, accounts: 2, started: 1, finished: 1 });
    expect(t.firstHit).toBe("2026-11-12T10:00:00Z");
  });
});

describe("words", () => {
  it("names countries, provinces and shares", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(countryName("Unknown")).toBe("Unknown");
    expect(provinceName("BC")).toBe("British Columbia");
    expect(provinceName("XX")).toBe("XX");
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(1, 0)).toBeNull();
  });
});

describe("the consent gap", () => {
  it("waits until the counter is 30 days old", () => {
    expect(consentGapNote(null, 148, 3)).toContain("began today");
    expect(consentGapNote(0, 148, 3)).toContain("began today");
    expect(consentGapNote(1, 148, 3)).toContain("began 1 day ago");
    expect(consentGapNote(12, 148, 3)).not.toContain("%");
    expect(consentGapNote(30, 148, 3)).toBe("In the past 30 days, 148 visitors accepted analytics against 3 visits (4933%). The gap is people who rejected the banner, plus people who came in more than one tab.");
    expect(consentGapNote(30, 4, 0)).toBe("No visits in the past 30 days to compare.");
    expect(consentGapNote(Number.NaN, 1, 1)).toContain("began today");
  });
});
