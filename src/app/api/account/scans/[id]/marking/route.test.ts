import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ signedIn: true, released: true, active: true, own: true, started: 0, changes: 0, status: "saved", choice: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/scan-photo-server", () => ({ scanJson: (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } }), scanSession: async () => { if (!fake.signedIn) throw Error("signed out"); return { admin: {}, parent: "owner", active: async () => fake.active }; } }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => fake.released, processScanMarking: async () => { fake.started++; return "budget"; }, changeScanMarking: async (_db: unknown, _parent: string, _photo: string, choice: unknown) => { fake.changes++; fake.choice = choice; return { status: fake.own ? fake.status : "refused", recoveryPending: false }; }, readScanMarking: async () => fake.own ? { completion: { status: "incomplete" }, items: [{ label: "Our team is checking this answer." }], photoAvailable: false, marks: "PRIVATE", detail: "PRIVATE" } : null }));
import { PATCH } from "./route";
const id = "00000000-0000-4000-8000-000000000001", ctx = () => ({ params: Promise.resolve({ id }) });
beforeEach(() => { Object.assign(fake, { signedIn: true, released: true, active: true, own: true, started: 0, changes: 0, status: "saved", choice: null }); });

const patch = (body: unknown, origin = "https://test.invalid") => new Request("https://test.invalid/api", { method: "PATCH", headers: { origin }, body: JSON.stringify(body) });
it.each(["right", "wrong", "blank"])("public parent choice %s passes the current version and returns only the effective page", async result => {
  const input = { itemId: "item", version: 4, result };
  const response = await PATCH(patch(input), ctx());
  expect(response.status).toBe(200); expect(fake.choice).toEqual(input); expect(fake.started).toBe(0);
  expect(await response.text()).not.toContain("PRIVATE");
});
it("conflict returns the current result instead of a successful overwrite", async () => {
  fake.status = "conflict"; const response = await PATCH(patch({ itemId: "item", version: 2, result: "blank" }), ctx());
  expect(response.status).toBe(409); expect((await response.json()).result.items).toEqual([{ label: "Our team is checking this answer." }]);
});
it("parent mutation rejects ended sessions, other families, cross-origin calls, and untrusted body fields", async () => {
  const input = { itemId: "item", version: 2, result: "blank" };
  fake.active = false; expect((await PATCH(patch(input), ctx())).status).toBe(404); expect(fake.changes).toBe(0);
  fake.active = true; expect((await PATCH(patch(input, "https://other.invalid"), ctx())).status).toBe(403); expect(fake.changes).toBe(0);
  for (const body of [{ ...input, actor: "admin" }, { ...input, version: 1.1 }, { ...input, result: "guess" }, { ...input, itemId: "" }, { ...input, itemId: "x".repeat(2050) }]) expect((await PATCH(patch(body), ctx())).status).toBe(400);
  expect(fake.changes).toBe(0); fake.own = false; expect((await PATCH(patch(input), ctx())).status).toBe(404);
});
