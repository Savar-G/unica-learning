import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ answer: "released" as string | null, calls: [] as { name: string; args: unknown }[], cleanups: 0 }));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  cleanupScanPhoto: async () => { f.cleanups++; return true; },
  scanSession: async () => ({ parent: "family", admin: {
    rpc: async (name: string, args: unknown) => { f.calls.push({ name, args }); return f.answer === null ? { data: null, error: { message: "down" } } : { data: f.answer, error: null }; },
  } }),
}));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const post = (photo = id, origin = "https://unicalearning.com") =>
  POST(new Request(`https://unicalearning.com/api/account/scans/${photo}/release`, { method: "POST", headers: { Origin: origin } }), { params: Promise.resolve({ id: photo }) });

beforeEach(() => { f.answer = "released"; f.calls = []; f.cleanups = 0; });

it("lets go of a reservation through the one atomic release function", async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ state: "released" });
  expect(f.calls).toEqual([{ name: "release_scan_photo", args: { p_parent: "family", p_id: id } }]);
});

it.each(["processing", "pending", "saved", "deleted", "expired", "rejected", "refused"])("refuses a photo that is %s and removes nothing", async (state) => {
  f.answer = state;
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: state });
  expect(f.calls.map((c) => c.name)).toEqual(["release_scan_photo"]);
  expect(f.cleanups).toBe(0);
});

it("refuses another site and a bad id before the database, and says when the database fails", async () => {
  expect((await post(id, "https://example.com")).status).toBe(403);
  expect((await post("not-an-id")).status).toBe(404);
  expect(f.calls).toEqual([]);
  f.answer = null;
  expect((await post()).status).toBe(503);
  expect(f.cleanups).toBe(0);
});
