import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ changes: 0, sessions: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/scan-photo-server", () => ({ scanJson: (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store" } }), scanSession: async () => { fake.sessions++; return { admin: {}, parent: "owner", active: async () => true }; } }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => true, readScanMarking: async () => null, changeScanMarking: async () => { fake.changes++; return { status: "saved" }; } }));
import { PATCH } from "./route";
beforeEach(() => { Object.assign(fake, { changes: 0, sessions: 0 }); });

it.each(["right", "wrong", "blank"])("refuses a parent's %s mark change with 403 and records nothing (2026-11-14)", async (result) => {
  const response = await PATCH();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "refused" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(fake.changes).toBe(0);
  void result;
});
