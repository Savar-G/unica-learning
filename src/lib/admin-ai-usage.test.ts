import { describe, expect, it } from "vitest";
import { buildStack, checkLine, costShare, featureGroupOf, groupFeatures, keyMonthUsage, niceTop, parseRange, parseUsage, periodFor, usd } from "@/lib/admin-ai-usage";
import { PACIFIC_ZONE, localDateTime, localDay } from "@/lib/family-time";
import { OPENROUTER_CHECK_MS, openRouterKeys, openRouterMonthCheck } from "@/lib/admin-ai-usage-store";

// 2026-11-12, midday in Vancouver.
const NOW = Date.parse("2026-11-12T20:00:00Z");

describe("period", () => {
  it("counts Vancouver days, today last", () => {
    const p = periodFor("7d", NOW);
    expect(p.days).toHaveLength(7);
    expect(p.days[0]).toBe("2026-11-06");
    expect(p.days.at(-1)).toBe("2026-11-12");
    // The period runs from the first Vancouver midnight to the one after today, by the site's zone rules.
    expect(localDay(p.from.getTime(), PACIFIC_ZONE)).toBe("2026-11-06");
    expect(localDay(p.from.getTime() - 1, PACIFIC_ZONE)).toBe("2026-11-05");
    expect(localDay(p.to.getTime(), PACIFIC_ZONE)).toBe("2026-11-13");
    expect(localDay(p.to.getTime() - 1, PACIFIC_ZONE)).toBe("2026-11-12");
  });
  it("starts the month on its first day", () => {
    const p = periodFor("month", NOW);
    expect(p.days[0]).toBe("2026-11-01");
    expect(p.days).toHaveLength(12);
  });
  it("takes a Vancouver evening as the same day, not the next UTC day", () => {
    // 03:00 UTC on the 13th is the evening of the 12th in Vancouver.
    expect(periodFor("30d", Date.parse("2026-11-13T03:00:00Z")).days.at(-1)).toBe("2026-11-12");
  });
  it("reads a range, and falls back to 30 days", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange(["month"])).toBe("month");
    expect(parseRange("x")).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });
});

describe("parseUsage", () => {
  it("reads numbers that arrive as strings, and an odd body as empty", () => {
    const v = parseUsage({ totals: { cost_usd: "2.5", calls: 3 }, families: [{ parent_id: null, cost_usd: "1.25", calls: 2, children: 0, revenue_cents: null }] });
    expect(v.totals).toMatchObject({ costUsd: 2.5, calls: 3, subscriptionCalls: 0 });
    expect(v.families[0]).toMatchObject({ parentId: null, costUsd: 1.25, revenueCents: null, freeMonth: false });
    expect(parseUsage(null).families).toEqual([]);
    expect(parseUsage({ daily: "no" }).daily).toEqual([]);
  });
});

describe("parseUsage days", () => {
  it("reads a day start instant as its Vancouver day", () => {
    const start = new Date(localDateTime("2026-11-06", PACIFIC_ZONE)).toISOString();
    expect(parseUsage({ daily: [{ day: start, model: "m", cost_usd: 1, calls: 1 }, { day: "2026-11-07", model: "m", cost_usd: 1, calls: 1 }, { day: null, model: "m", cost_usd: 1, calls: 1 }] }).daily.map((d) => d.day)).toEqual(["2026-11-06", "2026-11-07"]);
  });
});

describe("features", () => {
  it("groups features, sums them and leaves empty groups out", () => {
    const g = groupFeatures([
      { feature: "workbook", costUsd: 1, calls: 2 }, { feature: "solve_check", costUsd: 0.5, calls: 4 },
      { feature: "maya", costUsd: 3, calls: 1 }, { feature: "maya_speech", costUsd: 0.2, calls: 1 },
      { feature: "never_heard_of", costUsd: 0.1, calls: 1 },
    ]);
    expect(g.map((x) => [x.key, x.costUsd, x.calls])).toEqual([["maya", 3.2, 2], ["workbook", 1.5, 6], ["other", 0.1, 1]]);
    expect(featureGroupOf(null).key).toBe("other");
  });
});

describe("buildStack", () => {
  const days = ["2026-11-10", "2026-11-11", "2026-11-12"];
  it("ranks models by cost, folds past six, keeps every day and skips zero cost", () => {
    const daily = [
      ...["a", "b", "c", "d", "e", "f", "g", "h"].map((m, i) => ({ day: "2026-11-11", model: m, costUsd: 10 - i, calls: 1 })),
      { day: "2026-11-12", model: "a", costUsd: 1, calls: 2 }, { day: "2026-11-12", model: "sub", costUsd: 0, calls: 5 },
    ];
    const s = buildStack(daily, days);
    expect(s.models).toEqual(["a", "b", "c", "d", "e", "f", "Other models"]);
    expect(s.days.map((d) => d.day)).toEqual(days);
    expect(s.days[0]).toMatchObject({ totalUsd: 0, segments: [] });
    expect(s.days[1].segments.at(-1)).toEqual({ model: "Other models", costUsd: 4 + 3 });
    expect(s.days[2]).toMatchObject({ calls: 7, totalUsd: 1 });
    expect(s.maxUsd).toBe(s.days[1].totalUsd);
  });
  it("has no models when nothing cost anything", () => {
    expect(buildStack([{ day: "2026-11-12", model: "sub", costUsd: 0, calls: 3 }], days).models).toEqual([]);
  });
});

describe("numbers", () => {
  it("picks a nice top", () => {
    expect([niceTop(0), niceTop(0.9), niceTop(1.3), niceTop(2.2), niceTop(4.1), niceTop(7), niceTop(130)]).toEqual([1, 1, 2, 2.5, 5, 10, 200]);
  });
  it("shows a tiny cost with its small amount", () => {
    expect(usd(1234.5)).toBe("USD 1,234.50");
    expect(usd(0.0042)).toBe("USD 0.0042");
    expect(usd(0)).toBe("USD 0.00");
  });
  it("compares cost with the plan price for the same days, in CAD", () => {
    // USD 4 at 1.40 = CAD 5.60; a CAD 79.99 plan for 30.44 days is CAD 79.99.
    expect(costShare(4, 1.4, 7999, 30.44)).toBe(7);
    expect(costShare(4, 1.4, null, 30)).toBeNull();
    expect(costShare(4, 1.4, 0, 30)).toBeNull();
  });
  it("gives the check's difference as OpenRouter minus recorded", () => {
    expect(checkLine({ monthUsd: 10, asked: 1, answered: 1 }, 7.5)).toEqual({ openRouterUsd: 10, recordedUsd: 7.5, notRecordedUsd: 2.5 });
  });
});

describe("OpenRouter check", () => {
  it("reads usage_monthly only when it is a number", () => {
    expect(keyMonthUsage({ data: { usage_monthly: 12.5 } })).toBe(12.5);
    expect(keyMonthUsage({ data: { usage_monthly: "12" } })).toBeNull();
    expect(keyMonthUsage(null)).toBeNull();
  });
  it("asks each distinct key once, with a limit, and sums the answers", async () => {
    const seen: { key: string; limited: boolean }[] = [];
    const fetch = (async (_u: string, init?: RequestInit) => {
      const key = String((init?.headers as Record<string, string>).authorization);
      seen.push({ key, limited: !!init?.signal });
      return new Response(JSON.stringify({ data: { usage_monthly: key.endsWith("b") ? 2 : 3 } }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const env = { OPENROUTER_API_KEY: "a", SCAN_MARKING_OPENROUTER_API_KEY: "b", PARENT_EXPLANATION_API_KEY: "a" };
    expect(openRouterKeys(env)).toEqual(["a", "b"]);
    await expect(openRouterMonthCheck(env, fetch)).resolves.toEqual({ monthUsd: 5, asked: 2, answered: 2 });
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s.limited)).toBe(true);
    expect(OPENROUTER_CHECK_MS).toBe(5000);
  });
  it("says partial when one key fails, null when none answers, and no-key when no key is set", async () => {
    const half = (async (_u: string, init?: RequestInit) => String((init?.headers as Record<string, string>).authorization).endsWith("b")
      ? new Response("no", { status: 401 }) : new Response(JSON.stringify({ data: { usage_monthly: 4 } }), { status: 200 })) as unknown as typeof globalThis.fetch;
    await expect(openRouterMonthCheck({ OPENROUTER_API_KEY: "a", DECISIONS_OPENROUTER_API_KEY: "b" }, half)).resolves.toEqual({ monthUsd: 4, asked: 2, answered: 1 });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof globalThis.fetch;
    await expect(openRouterMonthCheck({ OPENROUTER_API_KEY: "a" }, down)).resolves.toBeNull();
    await expect(openRouterMonthCheck({}, down)).resolves.toBe("no-key");
  });
});
