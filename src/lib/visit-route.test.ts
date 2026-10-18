import { beforeEach, describe, expect, it, vi } from "vitest";

// The ad visit counter: it answers 204 at once, writes one row after the response, never stores a click ID, an IP or
// a user agent, and fails quietly. The store is a stub that records each insert; `after` runs its callback at once.
const inserts: { table: string; row: Record<string, unknown> }[] = [];
let storeError: { code?: string; message: string } | null = null;
let noClient = false;
let throws = false;
let recentCount = 0;
let countError: { code?: string; message: string } | null = null;
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () =>
    noClient ? null : {
      from: (table: string) => ({
        select: () => ({ gte: async () => ({ count: recentCount, error: countError }) }),
        insert: async (row: Record<string, unknown>) => {
          if (throws) throw new Error("network down");
          inserts.push({ table, row });
          return { error: storeError };
        },
      }),
    },
}));
const { POST } = await import("@/app/api/visit/route");
const { RATE_MAX } = await import("@/lib/ad-visits");

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ID = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const SAME = { "user-agent": BROWSER, "sec-fetch-site": "same-origin" };
const visit = (body: unknown, headers: Record<string, string> = SAME) =>
  POST(new Request("https://unicalearning.com/api/visit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("the ad visit route", () => {
  beforeEach(() => {
    inserts.length = 0;
    storeError = null;
    noClient = false;
    throws = false;
    recentCount = 0;
    countError = null;
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores one row with the tags and whether a click ID was there", async () => {
    const res = await visit({ visitId: ID, utm_source: "meta", utm_medium: "paid", utm_campaign: "oct-test", utm_content: "photo-led", has_gclid: false, has_fbclid: true });
    expect(res.status).toBe(204);
    expect(inserts).toEqual([{ table: "ad_visits", row: { visit_id: ID, utm_source: "meta", utm_medium: "paid", utm_campaign: "oct-test", utm_content: "photo-led", has_gclid: false, has_fbclid: true } }]);
  });

  it("never stores a click ID value, the user agent or anything else posted with the visit", async () => {
    await visit({ visitId: ID, utm_source: "google", has_gclid: true, gclid: "Cj0KCQ-secret", fbclid: "IwAR-secret", ip: "1.2.3.4", email: "a@b.c" });
    expect(Object.keys(inserts[0].row).sort()).toEqual(["has_fbclid", "has_gclid", "utm_campaign", "utm_content", "utm_medium", "utm_source", "visit_id"]);
    const stored = JSON.stringify(inserts);
    for (const s of ["secret", "1.2.3.4", "a@b.c", "Safari"]) expect(stored).not.toContain(s);
  });

  it("counts a visit with only a click ID", async () => {
    await visit({ visitId: ID, has_gclid: true });
    expect(inserts[0].row).toMatchObject({ utm_source: null, has_gclid: true, has_fbclid: false });
  });

  it("does not count a flyer visit, a visit with no tags, or a post without a real visit ID", async () => {
    for (const body of [{ visitId: ID, utm_source: "flyer", utm_content: "a" }, { visitId: ID }, { visitId: "abc", utm_source: "meta" }, { utm_source: "meta" }, "not json", [1, 2]]) {
      expect((await visit(body)).status).toBe(204);
    }
    expect(inserts).toEqual([]);
  });

  it("does not count link previews, crawlers, requests with no user agent, or posts from another site", async () => {
    const body = { visitId: ID, utm_source: "meta" };
    expect((await visit(body, { ...SAME, "user-agent": "facebookexternalhit/1.1" })).status).toBe(204);
    expect((await visit(body, { ...SAME, "user-agent": "Googlebot/2.1" })).status).toBe(204);
    expect((await visit(body, { "sec-fetch-site": "same-origin" })).status).toBe(204);
    expect((await visit(body, { ...SAME, "sec-fetch-site": "cross-site" })).status).toBe(204);
    expect((await visit(body, { ...SAME, "sec-fetch-site": "same-site" })).status).toBe(204);
    expect(inserts).toEqual([]);
  });

  it("does not count a post without Sec-Fetch-Site: same-origin (a script, not the site's own page)", async () => {
    expect((await visit({ visitId: ID, utm_source: "meta" }, { "user-agent": BROWSER })).status).toBe(204);
    expect(inserts).toEqual([]);
  });

  it("does not read a body announced as over 2 KB", async () => {
    // A small body with a large announced length: refused on the header alone, before the body is read.
    const res = await visit({ visitId: ID, utm_source: "meta" }, { ...SAME, "content-length": "3100" });
    expect(res.status).toBe(204);
    expect(inserts).toEqual([]);
    expect((await visit({ visitId: ID, utm_source: "meta" }, { ...SAME, "content-length": "lots" })).status).toBe(204);
    expect(inserts).toEqual([]);
  });

  it("stops counting past RATE_MAX visits in 10 minutes, and when it cannot check the count", async () => {
    recentCount = RATE_MAX;
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    expect(inserts).toEqual([]);
    recentCount = RATE_MAX - 1;
    countError = { code: "PGRST205", message: "no table" };
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    expect(inserts).toEqual([]);
    countError = null;
    await visit({ visitId: ID, utm_source: "meta" });
    expect(inserts).toHaveLength(1);
  });

  it("cuts long tags and drops ones with control characters", async () => {
    await visit({ visitId: ID, utm_source: "meta", utm_campaign: "x".repeat(300), utm_content: "bad\u0000value" });
    expect(inserts[0].row.utm_campaign).toBe("x".repeat(100));
    expect(inserts[0].row.utm_content).toBeNull();
  });

  it("still answers 204 when the visit cannot be stored: table missing, store down, duplicate, or no secret key", async () => {
    storeError = { code: "PGRST205", message: "Could not find the table 'public.ad_visits'" };
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    storeError = { code: "23505", message: "duplicate key" };
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    throws = true;
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    noClient = true;
    expect((await visit({ visitId: ID, utm_source: "meta" })).status).toBe(204);
    expect(console.error).toHaveBeenCalledWith("[visit] not counted", "PGRST205", "Could not find the table 'public.ad_visits'");
    expect(console.error).toHaveBeenCalledWith("[visit] not counted", "network down");
    expect(console.error).toHaveBeenCalledWith("[visit] not counted: no service client");
  });

  it("does not log a duplicate visit ID as a failure", async () => {
    storeError = { code: "23505", message: "duplicate key" };
    await visit({ visitId: ID, utm_source: "meta" });
    expect(console.error).not.toHaveBeenCalled();
  });
});
