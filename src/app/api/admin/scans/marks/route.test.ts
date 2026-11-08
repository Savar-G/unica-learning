import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ admin: true as boolean, service: true as boolean, result: { status: "saved", version: 3, recoveryPending: false } as Record<string, unknown>, calls: [] as unknown[], fail: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => fake.admin ? { db: "admin-db", userId: "admin", email: "admin@example.invalid" } : null }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => fake.service ? "service-db" : null }));
vi.mock("@/lib/scan-team-marks", async (load) => ({ ...(await load<typeof import("@/lib/scan-team-marks")>()),
  setScanTeamMark: async (...args: unknown[]) => { fake.calls.push(args); if (fake.fail) throw Error("store"); return fake.result; } }));
import { POST } from "./route";
const ITEM = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown, origin = "https://test.invalid") => new Request("https://test.invalid/api/admin/scans/marks", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => Object.assign(fake, { admin: true, service: true, result: { status: "saved", version: 3, recoveryPending: false }, calls: [], fail: false }));

it("an admin sets an unsure answer's mark with their own session", async () => {
  const r = await POST(post({ item: ITEM, version: 2, result: "wrong" }));
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ status: "saved", version: 3, recoveryPending: false });
  expect(fake.calls).toEqual([["admin-db", "service-db", { item: ITEM, version: 2, result: "wrong" }]]);
});
it("refuses a non-admin, another origin and a bad body before any store call", async () => {
  fake.admin = false; expect((await POST(post({ item: ITEM, version: 2, result: "wrong" }))).status).toBe(404);
  fake.admin = true; expect((await POST(post({ item: ITEM, version: 2, result: "wrong" }, "https://other.invalid"))).status).toBe(403);
  for (const body of [{ item: "q2", version: 2, result: "wrong" }, { item: ITEM, version: 2, result: "guess" }, { item: ITEM, version: 2, result: "wrong", actor: "parent" }]) expect((await POST(post(body))).status).toBe(400);
  expect(fake.calls).toEqual([]);
});
it("answers 409 for a changed or already marked answer, 404 when refused, 503 when the store fails", async () => {
  fake.result = { status: "conflict", version: 5 }; expect((await POST(post({ item: ITEM, version: 2, result: "right" }))).status).toBe(409);
  fake.result = { status: "not_waiting", version: 3 }; expect((await POST(post({ item: ITEM, version: 2, result: "right" }))).status).toBe(409);
  fake.result = { status: "refused" }; expect((await POST(post({ item: ITEM, version: 2, result: "right" }))).status).toBe(404);
  fake.fail = true; expect((await POST(post({ item: ITEM, version: 2, result: "right" }))).status).toBe(503);
});
