import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ calls: [] as { name: string; args: unknown }[], fail: false }));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => ({ parent: "family", admin: { rpc: async (name: string, args: { p_ids: string[] }) => { f.calls.push({ name, args }); return f.fail ? { data: null, error: { message: "down" } } : { data: args.p_ids, error: null }; } } }),
}));
import { POST } from "./route";
const A = "44444444-4444-4444-8444-444444444444";
const hold = (body: unknown, origin = "https://unicalearning.com") => POST(new Request("https://unicalearning.com/api/account/scans/hold", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }));
beforeEach(() => { f.calls = []; f.fail = false; });

it("writes the Undo's hold on the server, 10 s by default, and lets it go on Undo (#3)", async () => {
  expect(await (await hold({ ids: [A, A] })).json()).toEqual({ held: [A] });
  expect(await (await hold({ ids: [A], seconds: 600 })).json()).toEqual({ held: [A] });
  expect(await (await hold({ ids: [A], undo: true })).json()).toEqual({ released: [A] });
  expect(f.calls).toEqual([
    { name: "hold_scan_photos", args: { p_parent: "family", p_ids: [A], p_seconds: 10 } },
    { name: "hold_scan_photos", args: { p_parent: "family", p_ids: [A], p_seconds: 600 } },
    { name: "unhold_scan_photos", args: { p_parent: "family", p_ids: [A] } },
  ]);
});

it("refuses another site, bad ids and a hold outside 1 to 600 seconds, and says when the database is down", async () => {
  expect((await hold({ ids: [A] }, "https://example.com")).status).toBe(403);
  for (const body of [{ ids: [] }, { ids: ["x"] }, { ids: [A], seconds: 0 }, { ids: [A], seconds: 601 }, { ids: [A], seconds: 1.5 }]) expect((await hold(body)).status).toBe(400);
  expect(f.calls).toEqual([]);
  f.fail = true;
  expect((await hold({ ids: [A] })).status).toBe(503);
});
