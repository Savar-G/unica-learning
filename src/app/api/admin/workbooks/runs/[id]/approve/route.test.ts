import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// #870 review: the Book 1 baseline capture after an approval never changes the approval's answer. The capture is the
// real captureBook1AfterApproval; its database is a stand-in that throws, hangs or is missing.
const h = vi.hoisted(() => ({
  later: [] as Promise<unknown>[],
  captureDb: null as unknown,
  approvals: 0,
  /** D-308: the run's draft has marks its plan did not use. */
  newMarks: false,
  /** D-308: the run is a next book, and its check cannot be read. */
  checkDown: false,
  /** D-308: the audit notes of approvals anyway, as the service function received them. */
  notes: [] as { name: string; args: Record<string, unknown> }[],
}));

vi.mock("next/server", () => ({
  // As Next.js does, the callback runs after the answer; the test keeps its promise to read what it did.
  after: (cb: () => unknown) => { h.later.push(Promise.resolve().then(cb)); },
}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => ({ userId: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" }) }));
vi.mock("@/lib/supabase-auth", () => ({
  // The approval's client (no signal), and the capture's own time-limited client (a signal).
  adminClient: (signal?: AbortSignal) => (signal ? h.captureDb : {
    approval: true,
    rpc: async (name: string, args: Record<string, unknown>) => { h.notes.push({ name, args }); return { data: { status: "noted" }, error: null }; },
    // Only the D-308 check's read of the run's draft; every other read fails, as before.
    from: (t: string) => {
      if (t !== "workbook_runs") throw new Error("no such table here");
      return { select: (columns: string) => {
        if (columns !== "draft_id, snapshot_id") throw new Error("no such read here");
        return ({ eq: () => ({ maybeSingle: async () => ({ data: { draft_id: "draft-2", snapshot_id: h.newMarks || h.checkDown ? "snap-1" : null }, error: null }) }) });
      } };
    },
  }),
}));
// D-308: the snapshot chain that made the draft. Its frozen ledger is empty, so one marked item now is a new mark.
vi.mock("@/lib/next-book-snapshot-store", () => ({ nextBookSnapshotStore: () => ({
  latestForDraft: async () => h.newMarks ? { id: "snap-1", revision: 1, frozen: { ledger: [], held: [] } } : null,
  drawnForDraft: async () => {
    if (h.checkDown) throw new Error("database down");
    return h.newMarks ? { id: "snap-1", revision: 1, frozen: { ledger: [], held: [] } } : null;
  },
  read: async () => ({ id: "snap-1", revision: 1, frozen: { ledger: [], held: [] } }),
  evidence: async () => [{ key: "k1", version: 1, day: 8, pageId: "p8" }],
}) }));
vi.mock("@/lib/workbook-ship-store", () => ({ workbookShipStore: () => ({}) }));
vi.mock("@/lib/workbook-ship", () => ({
  approveDraft: async () => { h.approvals++; return { status: "approved", workbookId: "00000000-0000-4000-8000-000000000077" }; },
}));

import { POST } from "./route";

const RUN = "00000000-0000-4000-8000-000000000042";
const approve = (extra: Record<string, unknown> = {}) => POST(new Request(`https://unicalearning.com/api/admin/workbooks/runs/${RUN}/approve`, {
  method: "POST", headers: { origin: "https://unicalearning.com", "content-type": "application/json" }, body: JSON.stringify({ revision: 2, ...extra }),
}), { params: Promise.resolve({ id: RUN }) } as never);

/** A database whose every call throws, or never answers. */
const throwing = { from: () => { throw new Error("database down"); }, rpc: () => { throw new Error("database down"); } };
const hanging = (() => {
  const never: unknown = new Proxy(() => {}, { get: (_t, k) => (k === "then" ? () => {} : never), apply: () => never });
  return { from: () => never, rpc: () => never };
})();

beforeEach(() => { h.later = []; h.captureDb = null; h.approvals = 0; h.newMarks = false; h.checkDown = false; h.notes = []; });

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

it("asks \"Update first?\" when the next-book draft has new marks, and approves anyway on request", async () => {
  // Wrong if: a draft with unused marks is approved without asking, or "Approve anyway" is refused.
  h.newMarks = true;
  const asked = await approve();
  expect(asked.status).toBe(409);
  expect(await asked.json()).toEqual({ ok: false, askUpdate: "New marks since this draft: Day 8 (1 page)" });
  expect(h.approvals).toBe(0);
  const anyway = await approve({ despiteNewMarks: true });
  expect(await anyway.json()).toEqual({ ok: true, workbookId: "00000000-0000-4000-8000-000000000077" });
  expect(h.approvals).toBe(1);
});

it("holds a next-book approval when the check cannot be read, and approves anyway on request", async () => {
  // Wrong if: a check that cannot be read approves silently (review 3), or "Approve anyway" is refused.
  h.checkDown = true;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const asked = await approve();
  expect(asked.status).toBe(409);
  expect(await asked.json()).toEqual({ ok: false, askUpdate: "The new marks could not be checked", checkUnavailable: true });
  expect(h.approvals).toBe(0);
  const anyway = await approve({ despiteNewMarks: true });
  expect(await anyway.json()).toEqual({ ok: true, workbookId: "00000000-0000-4000-8000-000000000077" });
  expect(h.approvals).toBe(1);
  // The approval anyway is noted through the service function, with the reason the check could not be read.
  expect(h.notes.map((n) => n.name)).toEqual(["note_workbook_approved_with_new_marks"]);
  expect(h.notes[0].args).toMatchObject({ p_draft: "draft-2", p_detail: { revision: 2, checkUnavailable: true } });
  error.mockRestore();
});
