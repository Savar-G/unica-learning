import { beforeEach, describe, expect, it, vi } from "vitest";

// The address on a flyer's QR code: it counts the scan after the response, never delays the redirect, and sends the
// visitor to the tagged signup. The store is a stub that records each insert; `after` runs its callback at once.
const inserts: { table: string; row: Record<string, unknown> }[] = [];
let storeError: string | null = null;
let noClient = false;
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () =>
    noClient ? null : { from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: storeError ? { message: storeError } : null }; } }) },
}));
const { GET } = await import("@/app/f/[code]/route");

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const scan = (code: string, ua: string | null = PHONE) =>
  GET(new Request(`https://unicalearning.com/f/${code}`, { headers: ua ? { "user-agent": ua } : {} }), { params: Promise.resolve({ code }) } as RouteContext<"/f/[code]">);

describe("the flyer scan route", () => {
  beforeEach(() => {
    inserts.length = 0;
    storeError = null;
    noClient = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts the scan and sends the visitor to the home page tagged with the flyer", async () => {
    const res = await scan("a");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://unicalearning.com/");
    expect(to.searchParams.get("utm_source")).toBe("flyer");
    expect(to.searchParams.get("utm_content")).toBe("a");
    expect(inserts).toEqual([{ table: "flyer_scans", row: { code: "a" } }]);
  });

  it("takes the code in any case", async () => {
    const res = await scan("B");
    expect(new URL(res.headers.get("location")!).searchParams.get("utm_content")).toBe("b");
    expect(inserts[0].row).toEqual({ code: "b" });
  });

  it("sends an unknown code to the home page and counts nothing", async () => {
    const res = await scan("zzz");
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname + to.search).toBe("/");
    expect(inserts).toEqual([]);
  });

  it("redirects without counting a link preview or a request with no user agent", async () => {
    expect((await scan("a", "facebookexternalhit/1.1")).status).toBe(302);
    expect((await scan("a", null)).status).toBe(302);
    expect(inserts).toEqual([]);
  });

  it("still redirects when the scan cannot be stored", async () => {
    storeError = "down";
    expect((await scan("b")).status).toBe(302);
    noClient = true;
    expect((await scan("b")).status).toBe(302);
  });
});
