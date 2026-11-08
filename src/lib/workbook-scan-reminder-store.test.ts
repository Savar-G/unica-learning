import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { createWorkbookScanReminderSender, type ScanReminderHandle } from "@/lib/workbook-scan-reminder-send";
import { listWorkbookScanRecoveryBooks, readWorkbookScanReminderDue, workbookScanInactivityStore,
  workbookScanReminderSendStore } from "@/lib/workbook-scan-reminder-store";
vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const handle: ScanReminderHandle = { parentId: id(1), childIds: [id(2)], episodeIds: [id(3)],
  messageId: id(4), attemptToken: id(5), emailLogId: id(6), attempt: 1, unsubscribeHash: "a".repeat(64) };
const identity = { workbook_id: id(7), parent_id: id(1), child_id: id(2), number: 1,
  printed_revision: "a".repeat(28), delivery_audit_id: 17, delivered_at: "2026-11-01T12:30:00.000Z",
  delivery_time_zone: "America/Edmonton", delivery_zone_override: false, activity_receipt_id: null,
  activity_key: "00000000-0000-0000-0000-000000000000", anchor_at: "2026-11-01T12:30:00.000Z", zone_mode: "delivery",
  clock_context: { version: 1, timeZone: null, postal: "T5A 0A1", oldestChild: { id: id(2), createdAt: "2026-10-01T01:00:00Z", province: "AB" } } };
type Call = { name: string; method: string; query: URLSearchParams; body: Record<string, unknown> };
type Reply = { data: unknown; status?: number; count?: number | null };
function setup(override?: (call: Call, reply: Reply) => Reply, state: "reserved" | "admitted" = "reserved") {
  const calls: Call[] = [];
  let currentState = state;
  const m = { id: handle.messageId, parent_id: handle.parentId, email_log_id: handle.emailLogId,
    state, attempt_count: 1, attempt_token: handle.attemptToken };
  const a = { token: handle.attemptToken, parent_id: handle.parentId, message_id: handle.messageId, attempt: 1, state };
  const l = { id: handle.emailLogId, parent_id: handle.parentId, kind: "scan_inactivity", status: "claimed",
    attempts: 1, unsubscribe_hash: handle.unsubscribeHash, copy_child_ids: [...handle.childIds], copy_redacted: false };
  const links = [{ episode_id: id(3), message_id: id(4), parent_id: id(1), child_id: id(2), released: false }];
  const db = createClient<Database>("https://scan-reminder.example.invalid", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const call: Call = { name: url.pathname.split("/").at(-1)!, method: init?.method ?? "GET", query: url.searchParams,
        body: init?.body ? JSON.parse(String(init.body)) : {} };
      calls.push(call);
      let reply: Reply;
      switch (call.name) {
        case "read_workbook_scan_inactivity_context": reply = { data: { status: "read", observed_at: "2026-11-06T12:00:00Z", identity } }; break;
        case "propose_workbook_scan_inactivity": reply = { data: { status: "recorded", episode: { ...identity,
          due_at: call.body.p_due, clock_version: call.body.p_clock_version } } }; break;
        case "list_workbook_scan_recovery_books": reply = { data: [{ workbook_id: id(7), parent_id: id(1), child_id: id(2), number: 1, delivery_audit_id: 17 }] }; break;
        case "read_workbook_scan_reminder_due": reply = { data: { status: "ready", episode_ids: [id(3)], child_ids: [id(2)] } }; break;
        case "claim_workbook_scan_reminder": reply = { data: { status: "claimed", message_id: id(4), attempt_token: id(5), email_log_id: id(6), attempt: 1, episode_ids: [id(3)], child_ids: [id(2)] } }; break;
        case "admit_workbook_scan_reminder": currentState = "admitted"; reply = { data: { status: "admitted", message_id: id(4), attempt_token: id(5), email_log_id: id(6), episode_ids: [id(3)] } }; break;
        case "finish_workbook_scan_reminder": reply = { data: { status: "recorded" } }; break;
        case "release_workbook_scan_reminder": reply = { data: { status: "released" } }; break;
        case "workbook_scan_reminder_messages": reply = { data: [{ ...m, state: currentState }] }; break;
        case "workbook_scan_reminder_attempts": reply = { data: [{ ...a, state: currentState }] }; break;
        case "email_log": reply = { data: [l] }; break;
        case "workbook_scan_reminder_links": reply = { data: links, count: links.length }; break;
        case "email_copies": reply = { data: [] }; break;
        default: throw new Error(`Unexpected synthetic request ${call.name}`);
      }
      reply = override ? override(call, structuredClone(reply)) : reply;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (reply.count !== undefined && reply.count !== null) headers["Content-Range"] = `0-${Math.max(0, reply.count - 1)}/${reply.count}`;
      return new Response(JSON.stringify(reply.data), { status: reply.status ?? 200, headers });
    } },
  });
  return { db, store: workbookScanReminderSendStore(db), calendars: workbookScanInactivityStore(db), calls,
    m, a, l, links };
}

describe("scan reminder RPC adapter", () => {
  it("reads a complete native-zone context and writes its null activity and exact clock context", async () => {
    const f = setup(), context = await f.calendars.context(id(7));
    if (context.status !== "read" || !context.identity) throw new Error("missing context");
    expect(context.identity.deliveryZoneOverride).toBe(false);
    expect(context.identity.clockContext.oldestChild?.province).toBe("AB");
    const dueAt = "2026-11-05T12:30:00.000Z";
    expect(await f.calendars.propose(context.identity, dueAt, "canonical-clock-v1")).toBe("recorded");
    expect(f.calls[1].body).toEqual({ p_book: id(7), p_delivery_audit: 17, p_activity: null,
      p_anchor: identity.anchor_at, p_due: dueAt, p_context: identity.clock_context, p_clock_version: "canonical-clock-v1" });
    expect(f.calls.every(c => !("p_at" in c.body))).toBe(true);
  });

  it("preserves later accepted activity, explicit zone override and database observation time", async () => {
    const f = setup((c, r) => c.name === "read_workbook_scan_inactivity_context"
      ? { data: { status: "read", observed_at: "2026-11-06T12:00:00Z", identity: { ...identity,
        activity_receipt_id: id(8), activity_key: id(8), anchor_at: "2026-11-02T12:30:00Z", zone_mode: "family", delivery_zone_override: true } } } : r);
    expect(await f.calendars.context(id(7))).toMatchObject({ status: "read", observedAt: "2026-11-06T12:00:00Z",
      identity: { activityReceiptId: id(8), activityKey: id(8), zoneMode: "family", deliveryZoneOverride: true } });
  });

  it("isolates two concurrent context reads with no startup delay", async () => {
    const f = setup((c, r) => c.name === "read_workbook_scan_inactivity_context"
      ? { data: { status: "read", observed_at: "2026-11-06T12:00:00Z", identity: { ...identity, workbook_id: c.body.p_book } } } : r);
    const both = await Promise.all([f.calendars.context(id(7)), f.calendars.context(id(8))]);
    expect(both).toMatchObject([{ identity: { workbookId: id(7) } }, { identity: { workbookId: id(8) } }]);
    expect(f.calls.map(c => c.body.p_book)).toEqual([id(7), id(8)]);
  });

  it.each([{ anchor_at: "2026-11-02T12:30:00Z" }, { printed_revision: "b".repeat(28) },
    { clock_context: { version: 1 } }, { activity_receipt_id: id(99) }])("refuses a substituted recorded calendar %j", async patch => {
    const f = setup((c, r) => c.name === "propose_workbook_scan_inactivity"
      ? { data: { status: "recorded", episode: { ...identity, due_at: c.body.p_due,
        clock_version: c.body.p_clock_version, ...patch } } } : r);
    const context = await f.calendars.context(id(7));
    if (context.status !== "read" || !context.identity) throw new Error("missing context");
    await expect(f.calendars.propose(context.identity, "2026-11-05T12:30:00Z", "clock-v1")).rejects.toThrow();
  });

  it.each([
    { workbook_id: id(99) }, { parent_id: "bad" }, { printed_revision: "old" }, { delivery_audit_id: 0 },
    { delivery_audit_id: Number.MAX_SAFE_INTEGER + 1 }, { delivery_zone_override: "false" },
    { delivery_time_zone: "invalid" }, { activity_key: id(99) }, { anchor_at: "2026-10-30T12:00:00Z" },
    { zone_mode: "family" }, { clock_context: { version: 2 } }, { clock_context: { ...identity.clock_context, oldestChild: {} } },
  ])("rejects malformed or substituted context %j", async patch => {
    const f = setup((c, r) => c.name === "read_workbook_scan_inactivity_context"
      ? { data: { status: "read", observed_at: "2026-11-06T12:00:00Z", identity: { ...identity, ...patch } } } : r);
    await expect(f.calendars.context(id(7))).rejects.toThrow("scan_reminder_store_shape");
    expect(f.calls).toHaveLength(1);
  });

  it.each([null, {}, { status: "read", observed_at: "invalid", identity: null }])("does not turn an invalid context into no activity", async data => {
    const f = setup(() => ({ data }));
    await expect(f.calendars.context(id(7))).rejects.toThrow();
  });

  it("keeps genuine absent identity separate from unavailable", async () => {
    const empty = setup(() => ({ data: { status: "read", observed_at: "2026-11-06T12:00:00Z", identity: null } }));
    expect(await empty.calendars.context(id(7))).toEqual({ status: "read", observedAt: "2026-11-06T12:00:00Z", identity: null });
    expect(await setup(() => ({ data: { status: "unavailable" } })).calendars.context(id(7))).toEqual({ status: "unavailable" });
  });

  it("sends a real keyset and maps complete recovery rows", async () => {
    const f = setup();
    expect(await listWorkbookScanRecoveryBooks(f.db, "reminder-due", 9, id(6))).toEqual([
      { workbookId: id(7), parentId: id(1), childId: id(2), number: 1, deliveryAuditId: 17 }]);
    expect(f.calls[0].body).toEqual({ p_kind: "reminder-due", p_limit: 9, p_after: id(6) });
  });

  it.each([0, 101, 1.5])("rejects invalid bound %s before a request", async limit => {
    const f = setup();
    await expect(listWorkbookScanRecoveryBooks(f.db, "due", limit)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });

  it("rejects duplicates, non-advancing keys and responses above the requested bound", async () => {
    const f = setup((c, r) => c.name === "list_workbook_scan_recovery_books" ? { data: [r.data, r.data].flat() } : r);
    await expect(listWorkbookScanRecoveryBooks(f.db, "due", 100)).rejects.toThrow();
    await expect(listWorkbookScanRecoveryBooks(f.db, "due", 1)).rejects.toThrow();
    await expect(listWorkbookScanRecoveryBooks(setup().db, "due", 1, id(7))).rejects.toThrow();
  });

  it.each([
    { status: "ready", episode_ids: [id(3), id(3)], child_ids: [id(2)] },
    { status: "ready", episode_ids: [], child_ids: [id(2)] },
    { status: "ready", episode_ids: [id(3)], child_ids: [] },
    { status: "refresh-required", workbook_id: "bad" }, {}, null,
  ])("rejects incomplete due sets %j", async data => {
    await expect(readWorkbookScanReminderDue(setup(() => ({ data })).db, id(1))).rejects.toThrow();
  });

  it("keeps empty, unsubscribed and refresh-required outcomes distinct", async () => {
    for (const data of [{ status: "ready", episode_ids: [], child_ids: [] }, { status: "unsubscribed" },
      { status: "unavailable" }, { status: "refresh-required", workbook_id: id(7) }]) {
      const f = setup(() => ({ data }));
      const result = await readWorkbookScanReminderDue(f.db, id(1));
      expect(result.status).toBe(data.status);
      expect(f.calls[0].body).toEqual({ p_parent: id(1) });
    }
  });

  it("proves the whole current handle and refuses an admitted-state claim while reserved", async () => {
    const f = setup();
    expect(await f.store.current(handle, "reserved")).toBe(true);
    expect(await f.store.current(handle, "admitted")).toBe(false);
    expect(f.calls.filter(c => c.name === "workbook_scan_reminder_links")[0].query.get("limit")).toBe("101");
    expect(f.calls.every(c => c.query.get("parent_id") === `eq.${handle.parentId}`)).toBe(true);
  });

  it.each(["attemptToken", "emailLogId", "messageId", "parentId"] as const)("refuses substituted handle field %s before mutation", async key => {
    const f = setup(), wrong = { ...handle, [key]: id(99) };
    expect(await f.store.current(wrong, "reserved")).toBe(false);
    expect(await f.store.release(wrong)).toEqual({ status: "stale" });
    expect(await f.store.admit(wrong)).toEqual({ status: "stale" });
    expect(f.calls.every(c => c.method === "GET")).toBe(true);
  });

  it.each([
    ["workbook_scan_reminder_messages", { attempt_token: id(99) }],
    ["workbook_scan_reminder_messages", { attempt_count: 2 }],
    ["workbook_scan_reminder_attempts", { message_id: id(99) }],
    ["workbook_scan_reminder_attempts", { state: "unknown" }],
    ["email_log", { unsubscribe_hash: "b".repeat(64) }],
    ["email_log", { copy_child_ids: [id(99)] }],
    ["email_log", { copy_redacted: true }],
    ["workbook_scan_reminder_links", { parent_id: id(99) }],
    ["workbook_scan_reminder_links", { child_id: id(99) }],
    ["workbook_scan_reminder_links", { released: null }],
  ] as const)("rejects changed stored identity in %s: %j", async (table, patch) => {
    const f = setup((c, r) => c.name === table ? { ...r, data: (r.data as object[]).map(v => ({ ...v, ...patch })) } : r);
    expect(await f.store.current(handle, "reserved")).toBe(false);
  });

  it.each([null, 0, 2])("refuses absent or inconsistent exact link count %s", async count => {
    const f = setup((c, r) => c.name === "workbook_scan_reminder_links" ? { ...r, count } : r);
    expect(await f.store.current(handle, "reserved")).toBe(false);
  });

  it("rejects a repeated link and a missing sibling rather than accepting a partial set", async () => {
    const f = setup((c, r) => c.name === "workbook_scan_reminder_links"
      ? { data: [...(r.data as object[]), ...(r.data as object[])], count: 2 } : r);
    expect(await f.store.current(handle, "reserved")).toBe(false);
    expect(await setup().store.current({ ...handle, episodeIds: [id(3), id(9)] }, "reserved")).toBe(false);
  });

  it("uses token-guarded SQL for explicit refusal, unknown and sent outcomes", async () => {
    const outcomes = [{ status: "sent", emailId: "provider-1" }, { status: "refused", error: "no" },
      { status: "unknown", error: "lost" }] as const;
    for (const outcome of outcomes) {
      const f = setup(undefined, "admitted");
      expect(await f.store.finish(handle, outcome)).toEqual({ status: "recorded" });
      expect(f.calls.at(-1)?.body).toEqual({ p_message: id(4), p_attempt: id(5), p_outcome: outcome.status,
        p_email_id: outcome.status === "sent" ? outcome.emailId : null });
      expect(await f.store.release(handle)).toEqual({ status: "stale" });
    }
  });

  it("does not mutate on stale state or missing current rows", async () => {
    const f = setup((c, r) => c.method === "GET" ? { data: [] } : r, "admitted");
    expect(await f.store.finish(handle, { status: "sent", emailId: "provider-1" })).toEqual({ status: "stale" });
    await f.store.keepCopy(handle, { message: { sender: { to: "parent" }, to: "qa@example.invalid", subject: "test", text: "test" },
      outcome: "sent", from: null, emailId: "provider-1" });
    expect(f.calls.every(c => c.method === "GET")).toBe(true);
  });

  it("runs the public sender immediately, binds its copy, hides tokens, and records one outcome", async () => {
    const f = setup(), providerCalls: string[] = [];
    const sender = createWorkbookScanReminderSender({ store: f.store, gapMs: 0, transport: {
      send: async message => { providerCalls.push(message.to); return { status: "sent", emailId: "provider-1" }; },
    } });
    expect(await sender.send({ ...handle, message: { sender: { to: "parent" }, to: "qa@example.invalid",
      subject: "Scan", text: "https://example.invalid/unsubscribe?t=secret-token" } })).toMatchObject({ status: "sent" });
    expect(providerCalls).toEqual(["qa@example.invalid"]);
    const copy = f.calls.find(c => c.name === "email_copies")!.body;
    expect(copy).toMatchObject({ parent_id: id(1), email_log_id: id(6), outcome: "sent", email_id: "provider-1" });
    expect(copy.text_body).toBe("https://example.invalid/unsubscribe?t=hidden");
    expect(f.calls.filter(c => c.name === "finish_workbook_scan_reminder")).toHaveLength(1);
    expect(f.calls.some(c => c.name === "release_workbook_scan_reminder")).toBe(false);
  });

  it("does not send or release after an admission reply is lost", async () => {
    const f = setup((c, r) => c.name === "admit_workbook_scan_reminder"
      ? { status: 504, data: { code: "timeout", message: "private details" } } : r);
    const send = vi.fn();
    const sender = createWorkbookScanReminderSender({ store: f.store, gapMs: 0, transport: { send } });
    expect(await sender.send({ ...handle, message: { sender: { to: "parent" }, to: "qa@example.invalid", subject: "test", text: "test" } }))
      .toEqual({ status: "not_sent", reason: "admission-unknown", released: false });
    expect(send).not.toHaveBeenCalled();
    expect(f.calls.some(c => /finish_|release_|email_copies/.test(c.name))).toBe(false);
  });

  it("fails RPC errors without exposing private diagnostics or retrying", async () => {
    const f = setup(() => ({ status: 400, data: { code: "42501", message: "private diagnostic" } }));
    await expect(f.calendars.context(id(7))).rejects.toThrow("scan_reminder_context_read");
    await expect(listWorkbookScanRecoveryBooks(f.db, "due", 5)).rejects.toThrow("scan_reminder_recovery_read");
    await expect(readWorkbookScanReminderDue(f.db, id(1))).rejects.toThrow("scan_reminder_due_read");
    expect(f.calls).toHaveLength(3);
    expect(await f.store.current(handle, "reserved")).toBe(false);
  });
});
