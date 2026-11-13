import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// #870 review: the Book 1 baseline capture after an approval never changes the approval's answer. The capture is the
// real captureBook1AfterApproval; its database is a stand-in that throws, hangs or is missing.
const h = vi.hoisted(() => ({
  later: [] as Promise<unknown>[],
  captureDb: null as unknown,
  approvals: 0,
}));

vi.mock("next/server", () => ({
  // As Next.js does, the callback runs after the answer; the test keeps its promise to read what it did.
  after: (cb: () => unknown) => { h.later.push(Promise.resolve().then(cb)); },
}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => ({ userId: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" }) }));
vi.mock("@/lib/supabase-auth", () => ({
  // The approval's client (no signal), and the capture's own time-limited client (a signal).
  adminClient: (signal?: AbortSignal) => (signal ? h.captureDb : { approval: true }),
}));
vi.mock("@/lib/workbook-ship-store", () => ({ workbookShipStore: () => ({}) }));
vi.mock("@/lib/workbook-ship", () => ({
  approveDraft: async () => { h.approvals++; return { status: "approved", workbookId: "00000000-0000-4000-8000-000000000077" }; },
}));

import { POST } from "./route";

const RUN = "00000000-0000-4000-8000-000000000042";
const approve = () => POST(new Request(`https://unicalearning.com/api/admin/workbooks/runs/${RUN}/approve`, {
  method: "POST", headers: { origin: "https://unicalearning.com", "content-type": "application/json" }, body: JSON.stringify({ revision: 2 }),
}), { params: Promise.resolve({ id: RUN }) } as never);

/** A database whose every call throws, or never answers. */
const throwing = { from: () => { throw new Error("database down"); }, rpc: () => { throw new Error("database down"); } };
const hanging = (() => {
  const never: unknown = new Proxy(() => {}, { get: (_t, k) => (k === "then" ? () => {} : never), apply: () => never });
  return { from: () => never, rpc: () => never };
})();

beforeEach(() => { h.later = []; h.captureDb = null; h.approvals = 0; });

it("answers ok when the capture's client is missing: the capture uses the approval's client", async () => {
  // Wrong if: a missing time-limited client fails the answer or skips the approval.
  h.captureDb = null;
  const res = await approve();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, workbookId: "00000000-0000-4000-8000-000000000077" });
  expect(h.approvals).toBe(1);
  expect(h.later).toHaveLength(1);
  // The approval's stand-in has no tables: the capture fails inside and still never throws.
  await expect(h.later[0]).resolves.toEqual({ status: "retry", reason: "error" });
});

it("answers ok when the capture throws, and the capture itself never throws", async () => {
  h.captureDb = throwing;
  const res = await approve();
  expect(await res.json()).toEqual({ ok: true, workbookId: "00000000-0000-4000-8000-000000000077" });
  await expect(h.later[0]).resolves.toEqual({ status: "retry", reason: "error" });
});

it("answers ok at once when the capture hangs", async () => {
  // Wrong if: the answer waits for the capture.
  h.captureDb = hanging;
  const res = await approve();
  expect(await res.json()).toEqual({ ok: true, workbookId: "00000000-0000-4000-8000-000000000077" });
  const state = await Promise.race([h.later[0].then(() => "settled"), new Promise(r => setTimeout(() => r("still waiting"), 50))]);
  expect(state).toBe("still waiting");
});
