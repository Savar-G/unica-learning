import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { createWorkbookScanMaintenanceServer, scanMaintenanceRelease } from "@/lib/workbook-scan-maintenance-server";
import { createWorkbookScanProgressSweep } from "@/lib/workbook-scan-progress-sweep-server";
vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const env = { WORKBOOK_SCAN_PROGRESS_ENABLED: "test-only", WORKBOOK_SCAN_REMINDERS_ENABLED: "test-only", WORKBOOK_SCAN_TEST_PARENT_IDS: id(1) };
function setup({ delivery = true, test = true, revokeBeforeAdmission = false, providerUnknown = false, failingRead = false,
  deliveryCount = 1, linksGate = "", clockPending = false, failGateAt = Infinity, families = false, plan = "paying", skipped = 0, closePlanAt = Infinity, reminders = "" } = {}) {
  // The parent a reminder is for: the listed test parent, or (reminders in families mode) the real family id(20).
  const owner = reminders === "families" ? id(20) : id(1);
  const calls: { name: string; body: Record<string, unknown>; query: URLSearchParams }[] = [], deliveries: string[] = [], copies: Record<string, unknown>[] = [];
  let state = "reserved", hash = "", revoked = false, gateReads = 0, planReads = 0, failNextGate = false;
  const db = createClient<Database>("https://maintenance.example.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const name = url.pathname.split("/").at(-1)!, body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ name, body, query: url.searchParams });
      let data: unknown, count: number | undefined;
      switch (name) {
        case "workbook_delivery_receipts":
          if (failingRead) return new Response(JSON.stringify({ code: "unavailable", message: "private details" }), { status: 400 });
          data = [{ workbook_id: id(7), parent_id: id(1), child_id: id(2), number: 1, audit_id: 23 }]; count = deliveryCount;
          break;
        case "list_workbook_scan_recovery_books": {
          const rows = [...Array.from({ length: skipped }, (_, i) => ({ workbook_id: id(i + 1), parent_id: id(i + 21), child_id: id(2), number: 1, delivery_audit_id: i + 1 })),
            { workbook_id: id(7), parent_id: id(20), child_id: id(2), number: 1, delivery_audit_id: 23 }];
          data = body.p_kind === "unseeded" || body.p_kind === "inactivity" || body.p_kind === "reminder-due"
            ? rows.filter(row => !body.p_after || row.workbook_id > body.p_after).slice(0, body.p_limit) : [];
          break;
        }
        case "child_plan_states": {
          const kind = url.searchParams.get("parent_id") === `eq.${id(20)}` && ++planReads < closePlanAt ? plan : "paused";
          data = kind ? [{ kind, next_charge_at: null, ends_at: null, monthly_cents: 1000, ending_free: false }] : [];
          break;
        }
        case "test_accounts":
          if (++gateReads === failGateAt || failNextGate) return new Response(JSON.stringify({ code: "read_failure", message: "private details" }), { status: 400 });
          data = test && !revoked && !families ? [{ parent_id: id(1) }] : []; break;
        case "reconcile_workbook_scan_progress": data = (body.p_books as string[]).map(workbookId => ({ workbookId, result: { status: "waiting" } })); break;
        case "workbook_scan_clock_requests":
          data = clockPending ? [{ workbook_id: id(7), delivery_audit_id: 23, delivered_at: "2026-11-01T12:00:00Z", time_zone: "UTC", zone_override: true }] : [];
          count = clockPending ? 1 : 0; break;
        case "record_workbook_scan_delivery_calendar": data = { status: "waiting" }; break;
        case "read_workbook_scan_inactivity_context": data = { status: "read", observed_at: "2026-11-07T08:00:00Z", identity: null }; break;
        case "parents": data = [{ id: owner, email: "owned-qa@example.invalid" }]; break;
        case "read_workbook_scan_reminder_due": data = { status: "ready", episode_ids: [id(3)], child_ids: [id(2)] }; break;
        case "claim_workbook_scan_reminder":
          hash = body.p_unsubscribe_hash;
          if (revokeBeforeAdmission) revoked = true;
          data = state === "unknown" || state === "sent" ? { status: "busy" } : { status: "claimed", message_id: id(4),
            attempt_token: id(5), email_log_id: id(6), attempt: 1, episode_ids: [id(3)], child_ids: [id(2)] };
          break;
        case "workbook_scan_reminder_messages": data = [{ id: id(4), parent_id: owner, email_log_id: id(6), state, attempt_count: 1, attempt_token: id(5) }]; break;
        case "workbook_scan_reminder_attempts": data = [{ token: id(5), parent_id: owner, message_id: id(4), attempt: 1, state }]; break;
        case "email_log": data = [{ id: id(6), parent_id: owner, kind: "scan_inactivity", status: "claimed", attempts: 1,
          unsubscribe_hash: hash, copy_child_ids: [id(2)], copy_redacted: false }]; break;
        case "workbook_scan_reminder_links":
          if (linksGate === "remove") revoked = true;
          if (linksGate === "fail") failNextGate = true;
          data = [{ episode_id: id(3), message_id: id(4), parent_id: owner, child_id: id(2), released: false }]; count = 1; break;
        case "admit_workbook_scan_reminder": state = "admitted"; data = { status: "admitted", message_id: id(4), attempt_token: id(5), email_log_id: id(6), episode_ids: [id(3)] }; break;
        case "finish_workbook_scan_reminder": state = body.p_outcome; data = { status: "recorded" }; break;
        case "email_copies": copies.push(body); data = []; break;
        default: throw new Error(`Unexpected synthetic request ${name}`);
      }
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...(count === undefined ? {} : { "Content-Range": `0-0/${count}` }) } });
    } },
  });
  const provider = { send: async (message: { to: string }) => {
    deliveries.push(message.to);
    return providerUnknown ? { status: "unknown" as const, error: "synthetic lost reply" }
      : { status: "sent" as const, emailId: "synthetic-provider-1" };
  } };
  const server = createWorkbookScanMaintenanceServer(db, { env: { ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: families ? "families" : "test-only", WORKBOOK_SCAN_REMINDERS_ENABLED: reminders || (delivery ? "test-only" : "off") },
    origin: "https://unicalearning.com", provider, gapMs: 0 });
  if (!server) throw new Error("missing configured server");
  const progress = createWorkbookScanProgressSweep(db, { env: { ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: families ? "families" : "test-only", WORKBOOK_SCAN_REMINDERS_ENABLED: reminders || (delivery ? "test-only" : "off") } })!;
  return { db, provider, server, calls, deliveries, copies, run: async () => {
    const result = await progress.run({ now: () => 0, endAt: 100 });
    const reminders = await server.run({ now: () => 0, endAt: 100 });
    return { ...result, reminders: reminders.reminders };
  } };
}

describe("scan maintenance server release and integration", () => {
  it.each([{}, { ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: "on" }, { ...env, WORKBOOK_SCAN_TEST_PARENT_IDS: "" },
    { ...env, WORKBOOK_SCAN_TEST_PARENT_IDS: "bad" }, { ...env, WORKBOOK_SCAN_TEST_PARENT_IDS: `${id(1)},${id(1)}` },
    { ...env, WORKBOOK_SCAN_TEST_PARENT_IDS: Array.from({ length: 21 }, (_, i) => id(i + 1)).join(",") },
    { ...env, WORKBOOK_SCAN_REMINDERS_ENABLED: "on" },
    // Reminders for real families need the progress switch in families mode too.
    { ...env, WORKBOOK_SCAN_REMINDERS_ENABLED: "families" }])("keeps absent or invalid release configuration off: %j", input => {
    expect(scanMaintenanceRelease(input)).toBeNull();
  });

  it("processes an open real family without admitting a reminder email", async () => {
    const f = setup({ families: true, clockPending: true });
    const result = await f.run();
    expect(result.clocks).toEqual({ waiting: 1 });
    expect(f.calls.find(c => c.name === "record_workbook_scan_delivery_calendar")?.body).toMatchObject({
      p_book: id(7), p_backstop: "2026-11-22T12:00:00.000Z",
    });
    expect(f.calls.some(c => c.name === "claim_workbook_scan_reminder" || c.name === "admit_workbook_scan_reminder")).toBe(false);
    expect(f.deliveries).toEqual([]);
  });
  it("reads the reminder switch: families only with families progress, test-only by default (#475)", () => {
    expect(scanMaintenanceRelease({ ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: "families", WORKBOOK_SCAN_REMINDERS_ENABLED: "families" })?.reminders).toBe("families");
    expect(scanMaintenanceRelease(env)?.reminders).toBe("test-only");
    expect(scanMaintenanceRelease({ ...env, WORKBOOK_SCAN_REMINDERS_ENABLED: undefined })).toMatchObject({ reminders: "off", delivery: false });
  });
  it("sends a real family its reminder in families mode, the database deciding who is due, without reading a plan (#475)", async () => {
    const f = setup({ families: true, reminders: "families" });
    const result = await f.run();
    expect(result.reminders).toEqual({ sent: 1 });
    expect(f.deliveries).toEqual(["owned-qa@example.invalid"]);
    expect(f.calls.find(c => c.name === "claim_workbook_scan_reminder")?.body).toMatchObject({ p_parent: id(20) });
    // The email path read no plan: only the progress sweep (before it) reads child_plan_states.
    const claimAt = f.calls.findIndex(c => c.name === "claim_workbook_scan_reminder");
    expect(f.calls.slice(claimAt).some(c => c.name === "child_plan_states")).toBe(false);
  });
  it("sends no reminder to a real family while reminders stay test-only, even in families progress mode", async () => {
    const f = setup({ families: true, reminders: "test-only" });
    await f.run();
    expect(f.calls.some(c => c.name === "claim_workbook_scan_reminder" || c.name === "admit_workbook_scan_reminder")).toBe(false);
    expect(f.deliveries).toEqual([]);
  });
  it("refuses a reminder to an unlisted test family in families mode", async () => {
    const f = setup({ families: false, reminders: "" });
    const server = createWorkbookScanMaintenanceServer(f.db, { env: { ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: "families", WORKBOOK_SCAN_REMINDERS_ENABLED: "families", WORKBOOK_SCAN_TEST_PARENT_IDS: id(9) },
      origin: "https://unicalearning.com", provider: f.provider, gapMs: 0 })!;
    // id(20) carries a test marker here (the mock answers a marker), and it is not listed: no claim, no email.
    await server.run({ now: () => 0, endAt: 100 });
    expect(f.calls.some(c => c.name === "claim_workbook_scan_reminder")).toBe(false);
    expect(f.deliveries).toEqual([]);
  });
  it("pages past five closed plans and reaches the next admitted book", async () => {
    const f = setup({ families: true, clockPending: true, skipped: 5 });
    await f.run();
    const pages = f.calls.filter(c => c.name === "list_workbook_scan_recovery_books" && c.body.p_kind === "unseeded");
    expect(pages.map(c => c.body.p_after)).toEqual([null, id(5)]);
    expect(f.calls.some(c => c.name === "record_workbook_scan_delivery_calendar")).toBe(true);
  });
  it("rechecks a real plan after selection before the reconciliation write", async () => {
    const f = setup({ families: true, clockPending: true, closePlanAt: 3 });
    await f.run();
    expect(f.calls.some(c => c.name === "reconcile_workbook_scan_progress" || c.name === "record_workbook_scan_delivery_calendar")).toBe(false);
  });
  it.each(["paused", ""])("does not write for a closed or missing real plan %j", async plan => {
    const f = setup({ families: true, plan });
    await f.run();
    expect(f.calls.some(c => c.name === "reconcile_workbook_scan_progress" || c.name === "record_workbook_scan_delivery_calendar")).toBe(false);
    expect(f.deliveries).toEqual([]);
  });

  it("does no database work when the default factory is off", () => {
    const f = setup();
    expect(createWorkbookScanMaintenanceServer(f.db, { env: {}, origin: "https://unicalearning.com", provider: f.provider, gapMs: 0 })).toBeNull();
    expect(f.calls).toEqual([]);
  });

  it("admits only an explicitly listed test family and returns counts without family or address data", async () => {
    const f = setup();
    expect(await f.run()).toEqual({ selectedBooks: 1, clocks: {}, calendars: { none: 1 }, reminders: { sent: 1 }, outOfTime: false, moreMayRemain: false });
    expect(f.deliveries).toEqual(["owned-qa@example.invalid"]);
    expect(f.copies).toHaveLength(1);
    expect(f.copies[0]).toMatchObject({ parent_id: id(1), email_log_id: id(6), outcome: "sent" });
    expect(f.copies[0].text_body).toContain("https://unicalearning.com/account/scan\n");
    expect(f.copies[0].text_body).toContain("/unsubscribe?t=hidden");
    const claim = f.calls.find(c => c.name === "claim_workbook_scan_reminder")!;
    expect(claim.body.p_unsubscribe_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.calls.filter(c => c.name === "admit_workbook_scan_reminder")).toHaveLength(1);
    expect(f.calls.find(c => c.name === "workbook_delivery_receipts")?.query.get("parent_id")).toBe(`in.(${id(1)})`);
    expect(f.calls.find(c => c.name === "workbook_scan_clock_requests")?.query.get("workbook_id")).toBe(`in.(${id(7)})`);
  });

  it("does not read recipients or claim email when delivery is off", async () => {
    const f = setup({ delivery: false });
    expect((await f.run()).reminders).toEqual({ "delivery-off": 1 });
    expect(f.deliveries).toEqual([]);
    expect(f.calls.some(c => c.name === "parents" || c.name === "claim_workbook_scan_reminder")).toBe(false);
  });

  it("refuses a listed parent without a current test marker", async () => {
    const f = setup({ test: false });
    expect((await f.run()).selectedBooks).toBe(0);
    expect(f.deliveries).toEqual([]);
    expect(f.calls.some(c => c.name === "parents" || c.name === "claim_workbook_scan_reminder")).toBe(false);
  });

  it("rechecks a removed test marker before the final SQL admission", async () => {
    const f = setup({ revokeBeforeAdmission: true });
    expect((await f.run()).reminders).toEqual({ not_sent: 1 });
    expect(f.deliveries).toEqual([]);
    expect(f.calls.some(c => c.name === "admit_workbook_scan_reminder" || c.name === "release_workbook_scan_reminder")).toBe(false);
  });

  it("rechecks a marker removed during the final asynchronous identity reads", async () => {
    const f = setup({ linksGate: "remove" });
    expect((await f.run()).reminders).toEqual({ not_sent: 1 });
    expect(f.deliveries).toEqual([]);
    const link = f.calls.findIndex(c => c.name === "workbook_scan_reminder_links");
    expect(f.calls.slice(link + 1).some(c => c.name === "test_accounts")).toBe(true);
    expect(f.calls.some(c => c.name === "admit_workbook_scan_reminder" || c.name === "release_workbook_scan_reminder")).toBe(false);
  });

  it("reports a failed last permission read even when the sender retains uncertain admission", async () => {
    const f = setup({ linksGate: "fail" });
    await expect(f.run()).rejects.toThrow("scan_maintenance_test_gate_read");
    expect(f.deliveries).toEqual([]);
    expect(f.calls.some(c => c.name === "admit_workbook_scan_reminder" || c.name === "release_workbook_scan_reminder")).toBe(false);
    const count = f.calls.length;
    await expect(f.server.run({ now: () => 0, endAt: 100 })).rejects.toThrow("scan_maintenance_test_gate_read");
    expect(f.calls).toHaveLength(count);
  });

  it("stops all later phases when the clock permission read fails", async () => {
    const f = setup({ clockPending: true, failGateAt: 3 });
    await expect(f.run()).rejects.toThrow("scan_maintenance_test_gate_read");
    expect(f.calls.some(c => c.name === "record_workbook_scan_delivery_calendar"
      || c.name === "read_workbook_scan_inactivity_context" || c.name === "read_workbook_scan_reminder_due")).toBe(false);
    expect(f.deliveries).toEqual([]);
  });

  it("completes the same clock and reminder path when permission reads succeed", async () => {
    const f = setup({ clockPending: true });
    const result = await f.run();
    expect(result.clocks).toEqual({ waiting: 1 });
    expect(result.reminders).toEqual({ sent: 1 });
    expect(f.calls.filter(c => c.name === "record_workbook_scan_delivery_calendar")).toHaveLength(1);
    expect(f.deliveries).toHaveLength(1);
  });

  it("retains an unknown send and never starts a second provider request", async () => {
    const f = setup({ providerUnknown: true });
    expect((await f.run()).reminders).toEqual({ unknown: 1 });
    expect((await f.run()).reminders).toEqual({ busy: 1 });
    expect(f.deliveries).toHaveLength(1);
    expect(f.calls.some(c => c.name === "release_workbook_scan_reminder")).toBe(false);
  });

  it("stops immediately on a failed selector and sends nothing", async () => {
    const f = setup({ failingRead: true });
    await expect(f.run()).rejects.toThrow("scan_maintenance_delivery_read");
    expect(f.calls).toHaveLength(1);
    expect(f.deliveries).toEqual([]);
  });

  it.each([0, 2, 6])("rejects a truncated or inconsistent exact delivery set %s", async deliveryCount => {
    const f = setup({ deliveryCount });
    await expect(f.run()).rejects.toThrow("scan_maintenance_delivery_bound");
    expect(f.calls).toHaveLength(1);
    expect(f.deliveries).toEqual([]);
  });

  it("shares the same public transport with an ordinary email without a startup delay", async () => {
    const f = setup();
    await Promise.all([f.server.transport.send({ sender: { to: "parent" }, to: "ordinary@example.invalid", subject: "ordinary", text: "synthetic" }), f.run()]);
    expect(f.deliveries).toEqual(["ordinary@example.invalid", "owned-qa@example.invalid"]);
  });
});
