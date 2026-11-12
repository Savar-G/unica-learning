import { describe, expect, it } from "vitest";
import { loadPosthogTraffic, parseCounts, parseDaily, parseWindows, posthogConfig, trafficQueries, type FetchLike } from "@/lib/posthog-traffic";

// 2026-11-12 20:00 UTC is 13:00 on 2026-11-12 in Vancouver: British Columbia stays on UTC-7 all year since 2026-03-08
// (the dated override in family-time.ts), so a Pacific day starts at 07:00 UTC even in November.
const NOW = Date.UTC(2026, 10, 12, 20, 0, 0);
const START_TODAY = Date.UTC(2026, 10, 12, 7, 0, 0) / 1000;

describe("PostHog settings", () => {
  it("is off without a key and defaults to the Unica project", () => {
    expect(posthogConfig({})).toBeNull();
    expect(posthogConfig({ POSTHOG_PERSONAL_API_KEY: "phx_1" })).toEqual({ key: "phx_1", projectId: "650128", host: "https://us.posthog.com" });
  });
  it("refuses a project id or host that is not plain", () => {
    expect(posthogConfig({ POSTHOG_PERSONAL_API_KEY: "k", POSTHOG_PROJECT_ID: "1; DROP" })).toBeNull();
    expect(posthogConfig({ POSTHOG_PERSONAL_API_KEY: "k", POSTHOG_HOST: "http://evil" })).toBeNull();
  });
});

describe("the queries", () => {
  it("count a Pacific day, and start the range at the first Pacific day", () => {
    const q = trafficQueries(NOW, 7);
    expect(q.windows).toContain(`fromUnixTimestamp(${START_TODAY})`);
    expect(q.pages).toContain(`fromUnixTimestamp(${START_TODAY - 6 * 86400})`);
    expect(trafficQueries(NOW, null).pages).not.toContain("fromUnixTimestamp");
  });
  it("only ever read page views", () => {
    for (const q of Object.values(trafficQueries(NOW, 30))) expect(q).toContain("event = '$pageview'");
  });
});

describe("reading the answers", () => {
  it("reads the four windows", () => {
    expect(parseWindows({ results: [[1, 2, 3, 4, 5, 6, 7, 8]] })).toEqual({ today: { visitors: 1, views: 2 }, d7: { visitors: 3, views: 4 }, d30: { visitors: 5, views: 6 }, all: { visitors: 7, views: 8 } });
    expect(parseWindows({ results: [] })).toBeNull();
    expect(parseWindows(null)).toBeNull();
  });
  it("words PostHog's placeholders", () => {
    expect(parseCounts({ results: [["$direct", 4, 9], ["google.com", 2, 2]] })).toEqual([{ label: "Direct", visitors: 4, views: 9 }, { label: "google.com", visitors: 2, views: 2 }]);
    expect(parseDaily({ results: [["2026-11-12", 3, 5]] })).toEqual([{ day: "2026-11-12", visitors: 3, views: 5 }]);
  });
});

describe("loading", () => {
  const config = { key: "phx_secret", projectId: "650128", host: "https://us.posthog.com" };
  it("sends the key as a bearer token and fills each section", async () => {
    const seen: { url: string; auth: string }[] = [];
    const doFetch: FetchLike = async (url, init) => {
      seen.push({ url, auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ results: [[1, 2, 3, 4, 5, 6, 7, 8]] }) };
    };
    const out = await loadPosthogTraffic(config, NOW, 7, doFetch);
    expect(seen).toHaveLength(8);
    expect(seen[0]).toEqual({ url: "https://us.posthog.com/api/projects/650128/query/", auth: "Bearer phx_secret" });
    expect(out.errors).toEqual([]);
    expect(out.windows?.all).toEqual({ visitors: 7, views: 8 });
  });
  it("keeps the sections that worked when one fails, and never prints the key", async () => {
    let i = 0;
    const doFetch: FetchLike = async () => {
      i += 1;
      if (i === 1) return { ok: false, status: 403, json: async () => ({}) };
      if (i === 2) throw new Error("phx_secret network");
      return { ok: true, status: 200, json: async () => ({ results: [["a", 1, 1]] }) };
    };
    const out = await loadPosthogTraffic(config, NOW, null, doFetch);
    expect(out.windows).toBeNull();
    expect(out.daily).toBeNull();
    expect(out.pages).toEqual([{ label: "a", visitors: 1, views: 1 }]);
    expect(out.errors).toHaveLength(2);
    expect(out.errors.join(" ")).not.toContain("phx_secret");
  });
});
