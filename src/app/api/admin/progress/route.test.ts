import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ admin: true as boolean, asked: [] as string[][], fail: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({
  adminSession: async () => (fake.admin ? { db: "admin-db", userId: "admin", email: "admin@example.invalid" } : null),
  progressRows: async (_a: unknown, ids: string[]) => { fake.asked.push(ids); if (fake.fail) throw Error("down"); return new Map(); },
}));
import { POST } from "./route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (body: unknown, { origin = "https://test.invalid", type = "application/json" } = {}) =>
  new Request("https://test.invalid/api/admin/progress", { method: "POST", headers: { origin, "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
beforeEach(() => Object.assign(fake, { admin: true, asked: [], fail: false }));

it("reads the 500 ids of a full page from the body, with no long address", async () => {
  const ids = Array.from({ length: 500 }, (_, i) => id(i));
  const request = post({ ids });
  expect(request.url.length).toBeLessThan(100);
  const r = await POST(request);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(fake.asked).toEqual([ids]);
});

it("refuses a non-admin, another origin, a body that is not JSON and a bad id list before any read", async () => {
  fake.admin = false;
  expect((await POST(post({ ids: [id(1)] }))).status).toBe(404);
  fake.admin = true;
  expect((await POST(post({ ids: [id(1)] }, { origin: "https://other.invalid" }))).status).toBe(403);
  expect((await POST(post({ ids: [id(1)] }, { type: "text/plain" }))).status).toBe(415);
  for (const body of ["{", null, {}, { ids: [] }, { ids: id(1) }, { ids: [1] }]) expect((await POST(post(body))).status).toBe(400);
  expect(fake.asked).toEqual([]);
});

it("answers 503 when the read fails", async () => {
  fake.fail = true;
  expect((await POST(post({ ids: [id(1)] }))).status).toBe(503);
});
