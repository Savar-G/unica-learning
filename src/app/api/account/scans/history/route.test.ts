import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ released: true, active: true, own: true, signedIn: true, db: null as unknown }));
vi.mock("@/lib/scan-photo-server", () => ({ scanSession: async () => { if (!fake.signedIn) throw Error("signed_out"); return { admin: fake.db, parent: "owner", active: async () => fake.active }; }, scanJson: (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }) }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => fake.released }));
import { GET } from "./route";
const child = "22222222-2222-4222-8222-222222222222", page = "44444444-4444-4444-8444-444444444444";
let calls: Record<string, unknown>[];
beforeEach(() => {
  Object.assign(fake, { released: true, active: true, own: true, signedIn: true }); calls = [];
  fake.db = createClient<Database>("https://synthetic.invalid", "synthetic", { global: { fetch: async (_url, init) => {
    const args = JSON.parse(String(init?.body)); calls.push(args);
    return Response.json(!fake.own ? null : { pages: args.p_data.after ? [] : [{ id: page, childId: child, childName: "Synthetic", workbookId: page, book: 1, revision: "immutable", day: "Day 2", pageNumber: 3, photos: [{ id: page, state: "deleted", at: "2026-01-01", expiresAt: "2026-02-01", sentAt: "2026-01-01" }], jobs: [], marks: [], spend: [] }], budget: { period: "2026-11-01", cap: 50000000, reported: 0, held: 1000, unknown: 1, reserved: 1000 } });
  } } });
});
const request = (query = `child=${child}`) => new Request(`https://synthetic.invalid/api/account/scans/history?${query}`);
it("the public history action uses the scoped real reader and returns no raw costs or retained answer text", async () => {
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const data = await response.json(); expect(data.pages).toHaveLength(1); expect(data.pages[0]).toMatchObject({ photoAvailable: false, status: "pending" }); expect(data.counts.pending).toBe(1); expect(data.budget).toBeUndefined(); expect(data.costs).toBeUndefined(); expect(data.pages[0].marks).toBeUndefined();
  expect(calls[0]).toMatchObject({ p_action: "history", p_parent: "owner", p_data: { child } });
});
it("another family, ended session, nonrelease and anonymous contexts cannot read history", async () => {
  fake.own = false; expect((await GET(request())).status).toBe(404); fake.own = true; fake.active = false; expect((await GET(request())).status).toBe(404);
  fake.active = true; fake.released = false; const before = calls.length; expect((await GET(request())).status).toBe(404); expect(calls).toHaveLength(before);
  fake.signedIn = false; await expect(GET(request())).rejects.toThrow("signed_out");
});
it("invalid cursors and filters do not enter the store", async () => {
  for (const query of [`child=${child}&after=bad`, `child=${child}&workbook=bad`, `child=${child}&status=anything`, "child=bad"]) expect((await GET(request(query))).status).toBe(400);
  expect(calls).toEqual([]);
});
