import { describe, expect, it } from "vitest";
import { flyerDestination, flyerOf, flyerRows, flyerUrl, flyerVerdict, isLikelyBot, per100, twoRatePValue, type FlyerRow } from "@/lib/flyers";

// The door-to-door flyer test: where a scan goes, which signups belong to which flyer, and what the comparison says.

describe("where a scan goes", () => {
  it("is the free assessment signup, tagged with the flyer", () => {
    const url = new URL(flyerDestination("b"), "https://unicalearning.com");
    expect(url.pathname).toBe("/start");
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "flyer", utm_medium: "print", utm_campaign: "door-to-door", utm_content: "b" });
  });

  it("is a short address for the QR code, one per flyer", () => {
    expect(flyerUrl("a")).toBe("https://unicalearning.com/f/a");
    expect(flyerUrl("b")).toBe("https://unicalearning.com/f/b");
  });

  it("does not count link previews, crawlers or a missing user agent as scans", () => {
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("WhatsApp/2.23 A")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

describe("which flyer a signup came from", () => {
  it("reads the tags the signup form kept", () => {
    expect(flyerOf({ utm_source: "flyer", utm_content: "a" })).toBe("a");
    expect(flyerOf({ utm_source: " Flyer ", utm_content: "B" })).toBe("b");
  });

  it("is nothing for another source, an unknown flyer, or no tags", () => {
    expect(flyerOf({ utm_source: "reddit", utm_content: "a" })).toBeNull();
    expect(flyerOf({ utm_source: "flyer", utm_content: "z" })).toBeNull();
    expect(flyerOf({ utm_source: "flyer" })).toBeNull();
    expect(flyerOf(null)).toBeNull();
  });
});

describe("the funnel of each flyer", () => {
  const parents: { id: string; source: Record<string, string> }[] = [
    { id: "1", source: { utm_source: "flyer", utm_content: "a" } },
    { id: "2", source: { utm_source: "flyer", utm_content: "a" } },
    { id: "3", source: { utm_source: "flyer", utm_content: "b" } },
    { id: "4", source: { utm_source: "reddit" } },
    { id: "5", source: { utm_source: "flyer", utm_content: "b" } },
  ];
  const families = [
    { id: "1", test: false, reached: { started: "t", finished: "t", card_saved: "t", paying: "t" } },
    { id: "2", test: false, reached: { started: "t" } },
    { id: "3", test: false, reached: {} },
    { id: "4", test: false, reached: { started: "t" } },
    { id: "5", test: true, reached: { started: "t" } },
  ];

  it("counts each family once, at the furthest steps it reached, and leaves out other sources", () => {
    const [a, b] = flyerRows({ parents, families, scans: { a: 40, b: 30 }, delivered: { a: 100, b: 100 } });
    expect(a).toMatchObject({ code: "a", delivered: 100, scans: 40, accounts: 2, started: 2, finished: 1, cardSaved: 1, paying: 1 });
    expect(b).toMatchObject({ code: "b", scans: 30, accounts: 1, started: 0, finished: 0, cardSaved: 0, paying: 0 });
  });

  it("leaves out team and test families unless asked", () => {
    expect(flyerRows({ parents, families, scans: {}, delivered: {} })[1].accounts).toBe(1);
    expect(flyerRows({ parents, families, scans: {}, delivered: {}, withTests: true })[1].accounts).toBe(2);
  });

  it("starts at zero before anything happened", () => {
    expect(flyerRows({ parents: [], families: [], scans: {}, delivered: {} })).toEqual([
      { code: "a", delivered: 0, scans: 0, accounts: 0, started: 0, finished: 0, cardSaved: 0, paying: 0 },
      { code: "b", delivered: 0, scans: 0, accounts: 0, started: 0, finished: 0, cardSaved: 0, paying: 0 },
    ]);
  });
});

describe("per 100 flyers", () => {
  it("is a rate with one decimal, and nothing until the handed-out count is entered", () => {
    expect(per100(3, 240)).toBe(1.3);
    expect(per100(0, 100)).toBe(0);
    expect(per100(5, 0)).toBeNull();
  });
});

describe("the comparison", () => {
  const row = (code: "a" | "b", delivered: number, accounts: number): FlyerRow => ({ code, delivered, scans: 0, accounts, started: 0, finished: 0, cardSaved: 0, paying: 0 });

  it("says p is near 1 for equal rates and small for a large gap", () => {
    expect(twoRatePValue(10, 200, 10, 200)).toBeCloseTo(1, 1);
    expect(twoRatePValue(40, 200, 15, 200)).toBeLessThan(0.01);
    expect(twoRatePValue(1, 0, 1, 10)).toBeNull();
  });

  it("asks for the handed-out counts first, because rates need them", () => {
    expect(flyerVerdict(row("a", 0, 3), row("b", 100, 2)).status).toBe("need-delivered");
  });

  it("makes no call with no signups, or with fewer than 10 in total, however the order falls", () => {
    expect(flyerVerdict(row("a", 100, 0), row("b", 100, 0)).status).toBe("no-signups");
    const early = flyerVerdict(row("a", 100, 6), row("b", 100, 1));
    expect(early.status).toBe("too-early");
    expect(early.leader).toBe("a");
  });

  it("calls a winner only when the gap is unlikely to be luck", () => {
    const clear = flyerVerdict(row("a", 200, 40), row("b", 200, 15));
    expect(clear).toMatchObject({ status: "clear", leader: "a" });
    expect(flyerVerdict(row("a", 200, 12), row("b", 200, 10)).status).toBe("even");
  });

  it("compares per flyer handed out, so unequal batches do not decide it", () => {
    const v = flyerVerdict(row("a", 400, 12), row("b", 100, 3));
    expect(v.status).toBe("even");
    expect(v.leader).toBeNull();
  });
});
