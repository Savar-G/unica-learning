import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { sendDuePhotos, sendFamilyPhotos, type SendDecide } from "@/lib/scan-send";

// A fake database: the due list, each photo's child, and every call made.
function fakeDb(o: { due?: { id: string; parent_id: string; child_id: string }[]; filed?: Record<string, string>; failSend?: string[]; failDue?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    from: () => ({ select: () => ({ eq: (_c: string, parent: string) => ({ in: async (_i: string, ids: string[]) => ({
      data: ids.filter((id) => o.filed?.[id] && parent === "family").map((id) => ({ id, child_id: o.filed![id] })), error: null,
    }) }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "due_scan_sends") return o.failDue ? { data: null, error: { message: "down" } } : { data: (o.due ?? []).filter((r) => !args.p_parent || r.parent_id === args.p_parent), error: null };
      if (name === "send_scan_photos" || name === "send_due_scan_photos") return o.failSend?.includes(args.p_child as string) ? { data: null, error: { message: "down" } } : { data: [...(args.p_ids as string[])].sort(), error: null };
      return { data: args.p_ids, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, calls };
}
const decide = (open: Record<string, string>): SendDecide => async (_parent, child) => ({ open: open[child] === "open", reason: open[child] ?? "child_unknown" });

it("groups Send by the child each photo is filed with, and sends only the children Send's rule opens (#1)", async () => {
  const { db, calls } = fakeDb({ filed: { a: "leah", b: "aisha", c: "leah" } });
  const result = await sendFamilyPhotos(db, "family", ["a", "b", "c"], {}, decide({ leah: "open", aisha: "no_plan" }));
  expect(result).toMatchObject({ open: true, sent: ["a", "c"], byChild: [{ child: "leah", sent: ["a", "c"] }], closed: [{ child: "aisha", ids: ["b"], reason: "no_plan" }] });
  expect(calls).toEqual([{ name: "send_scan_photos", args: { p_parent: "family", p_child: "leah", p_ids: ["a", "c"] } }]);
});

it("is closed when no child of the photos may send, and throws only when every open child's send failed", async () => {
  const closed = fakeDb({ filed: { a: "leah" } });
  expect((await sendFamilyPhotos(closed.db, "family", ["a"], {}, decide({}))).open).toBe(false);
  const failing = fakeDb({ filed: { a: "leah", b: "aisha" }, failSend: ["leah", "aisha"] });
  await expect(sendFamilyPhotos(failing.db, "family", ["a", "b"], {}, decide({ leah: "open", aisha: "open" }))).rejects.toThrow();
  const half = fakeDb({ filed: { a: "leah", b: "aisha" }, failSend: ["leah"] });
  expect((await sendFamilyPhotos(half.db, "family", ["a", "b"], {}, decide({ leah: "open", aisha: "open" }))).sent).toEqual(["b"]);
});

it("sends the held pages whose Undo passed, per family and child, and lets go of a closed child's for good (#3)", async () => {
  const { db, calls } = fakeDb({ due: [
    { id: "a", parent_id: "p1", child_id: "leah" }, { id: "b", parent_id: "p1", child_id: "aisha" },
    { id: "c", parent_id: "p2", child_id: "omar" }, { id: "d", parent_id: "p2", child_id: "zoe" },
  ] });
  const sent = await sendDuePhotos(db, { decide: decide({ leah: "open", omar: "open", aisha: "ended", zoe: "read_failed" }) });
  expect(sent).toEqual([{ parent: "p1", byChild: [{ child: "leah", sent: ["a"] }] }, { parent: "p2", byChild: [{ child: "omar", sent: ["c"] }] }]);
  expect(calls[0]).toEqual({ name: "due_scan_sends", args: { p_parent: null, p_limit: 100 } });
  // The send rechecks the due rule under the family lock (review of #981), never the plain Send.
  expect(calls.filter((c) => c.name.startsWith("send_")).map((c) => c.name)).toEqual(["send_due_scan_photos", "send_due_scan_photos"]);
  // A plan that ended lets its page go, with no Undo mark; a failed read waits an hour, so it never fills the limit.
  expect(calls.filter((c) => c.name === "release_scan_holds")).toEqual([{ name: "release_scan_holds", args: { p_parent: "p1", p_ids: ["b"] } }]);
  expect(calls.filter((c) => c.name === "defer_scan_sends")).toEqual([{ name: "defer_scan_sends", args: { p_parent: "p2", p_ids: ["d"], p_seconds: 3600 } }]);
});

it("reads one family's due pages on its next load, and never throws when the database is down (#3)", async () => {
  const { db, calls } = fakeDb({ due: [{ id: "a", parent_id: "p1", child_id: "leah" }, { id: "c", parent_id: "p2", child_id: "omar" }] });
  expect(await sendDuePhotos(db, { parent: "p1", decide: decide({ leah: "open", omar: "open" }) })).toEqual([{ parent: "p1", byChild: [{ child: "leah", sent: ["a"] }] }]);
  expect(calls[0].args).toEqual({ p_parent: "p1", p_limit: 100 });
  expect(await sendDuePhotos(fakeDb({ failDue: true }).db, { decide: decide({}) })).toEqual([]);
  expect(await sendDuePhotos(fakeDb({ due: [{ id: "a", parent_id: "p1", child_id: "leah" }], failSend: ["leah"] }).db, { decide: decide({ leah: "open" }) })).toEqual([]);
});

it("leaves the holds alone when marking is off for everyone, and defers pages it could not send (review of #981)", async () => {
  const off = fakeDb({ due: [{ id: "a", parent_id: "p1", child_id: "leah" }] });
  expect(await sendDuePhotos(off.db, { decide: decide({ leah: "off" }) })).toEqual([]);
  expect(off.calls.filter((c) => c.name === "release_scan_holds" || c.name === "unhold_scan_photos")).toEqual([]);
  expect(off.calls.filter((c) => c.name === "defer_scan_sends")).toEqual([{ name: "defer_scan_sends", args: { p_parent: "p1", p_ids: ["a"], p_seconds: 3600 } }]);
  for (const reason of ["paused", "payment_failed", "unknown"]) {
    const held = fakeDb({ due: [{ id: "a", parent_id: "p1", child_id: "leah" }] });
    await sendDuePhotos(held.db, { decide: decide({ leah: reason }) });
    expect(held.calls.map((c) => c.name)).toEqual(["due_scan_sends", "defer_scan_sends"]);
  }
  // A family whose send fails (being deleted) waits an hour too.
  const failing = fakeDb({ due: [{ id: "a", parent_id: "p1", child_id: "leah" }], failSend: ["leah"] });
  await sendDuePhotos(failing.db, { decide: decide({ leah: "open" }) });
  expect(failing.calls.filter((c) => c.name === "defer_scan_sends")).toEqual([{ name: "defer_scan_sends", args: { p_parent: "p1", p_ids: ["a"], p_seconds: 3600 } }]);
});
