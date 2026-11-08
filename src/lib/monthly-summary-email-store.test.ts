import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { hideTokens } from "@/lib/email-copies";
import { sendEmailOnce } from "@/lib/email-delivery";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { ONE_SEND_MS, dueMonthlyEmails, monthlyMessage, runMonthlyEmails, type DueMonthly } from "@/lib/monthly-summary-email";
import { monthlySummaryEmailStore } from "@/lib/monthly-summary-email-store";
import { unsubscribe, unsubscribeState } from "@/lib/reminder-store";
import { hashToken, newToken } from "@/lib/sign-in-link";

vi.mock("server-only", () => ({}));

// The monthly summary email's Supabase store (#563). The fake keeps the tables in memory, applies the filters and answers
// at most 1,000 rows per request, as PostgREST does. Writes follow the unique indexes of the migration.
const MAX_ROWS = 1000;
type Row = Record<string, unknown>;
const ORIGIN = "https://unicalearning.com";
const NOV_1 = Date.UTC(2026, 10, 1, 15); // 8 a.m. in Vancouver.

/** Answers only when the request's own signal aborts; with no signal, never. */
const untilAborted = (signal?: AbortSignal | null) => new Promise<never>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));

function fakeDb(tables: Record<string, Row[]>, opts: { failTable?: string; hang?: { table: string; method?: string; when: "before" | "after" } } = {}) {
  const reads: string[] = [];
  let hang = opts.hang;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // As the real fetch: an aborted signal fails the request at once.
    init?.signal?.throwIfAborted();
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    reads.push(table);
    if (opts.failTable === table) return Response.json({ message: "unavailable" }, { status: 400 });
    // One request hangs, before or after its write: the release that follows goes through.
    const hit = hang?.table === table && (hang.method ?? "GET") === (init?.method ?? "GET") ? hang : null;
    if (hit) hang = undefined;
    if (hit?.when === "before") await untilAborted(init?.signal);
    const rows = tables[table] ??= [];
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body)) as Row;
      const unique = table === "email_copies"
        ? rows.findIndex((r) => r.email_log_id === row.email_log_id)
        : rows.findIndex((r) => r.parent_id === row.parent_id && r.kind === row.kind && (row.kind === "monthly_summary" ? r.summary_month === row.summary_month : true));
      if (table === "email_copies") {
        if (unique >= 0) rows.splice(unique, 1);
      } else if (unique >= 0) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
      const saved = { id: `log-${rows.length + 1}`, ...row };
      rows.push(saved);
      if (hit?.when === "after") await untilAborted(init?.signal);
      const one = new Headers(init.headers).get("accept")?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify(one ? saved : [saved]), { status: 201, headers: { "content-type": "application/json" } });
    }
    let found = [...rows];
    for (const [key, raw] of url.searchParams) {
      if (["select", "order", "offset", "limit", "on_conflict", "columns"].includes(key)) continue;
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      if (op === "eq") found = found.filter((r) => String(r[key]) === value);
      else if (op === "gt") found = found.filter((r) => r[key] != null && String(r[key]) > value);
      else if (op === "lt") found = found.filter((r) => r[key] != null && Number(r[key]) < Number(value));
      else if (op === "in") {
        const set = new Set(value.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
        found = found.filter((r) => set.has(String(r[key])));
      } else throw new Error(`fake db: no ${op} filter`);
    }
    if (init?.method === "PATCH") {
      Object.assign(found[0] ?? {}, JSON.parse(String(init.body)));
      if (hit?.when === "after") await untilAborted(init?.signal);
      return new Response(JSON.stringify(found.slice(0, 1)), { headers: { "content-type": "application/json" } });
    }
    if (init?.method === "DELETE") {
      for (const r of found) rows.splice(rows.indexOf(r), 1);
      return new Response(JSON.stringify(found), { headers: { "content-type": "application/json" } });
    }
    const order = url.searchParams.get("order");
    if (order) found.sort((a, b) => String(a[order.split(",")[0].split(".")[0]]).localeCompare(String(b[order.split(",")[0].split(".")[0]])));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    const page = found.slice(0, limit);
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(page), { headers: { "content-type": "application/json", "content-range": `0-${page.length - 1}/${found.length}` } });
  };
  return { reads, db: createClient<Database>("https://fixture.invalid", "synthetic-key", { global: { fetch }, auth: { persistSession: false } }) };
}

const parent = (id: string) => ({ id, name: `Parent ${id}`, email: `${id}@family.ca`, postal: "V3S 1A1", time_zone: null });
const child = (id: string, parentId: string) => ({ id, parent_id: parentId, first_name: `Child ${id}`, province: "BC", created_at: "2026-01-01T00:00:00Z" });
const receipt = (workbook: string, childId: string, parentId: string, deliveredAt = "2026-10-10T18:00:00Z") => ({ workbook_id: workbook, child_id: childId, parent_id: parentId, delivered_at: deliveredAt });

const twoFamilies = () => ({
  workbook_delivery_receipts: [receipt("w1", "c1", "normal"), receipt("w2", "c2", "marked")],
  workbook_delivery_corrections: [],
  parents: [parent("normal"), parent("marked")],
  children: [child("c1", "normal"), child("c2", "marked")],
  email_log: [],
  test_accounts: [{ parent_id: "marked" }],
  admin_users: [],
});

const OFF = { PARENT_DASHBOARD_ENABLED: undefined, MONTHLY_SUMMARY_EMAIL_ENABLED: "on" };
const ON = { PARENT_DASHBOARD_ENABLED: "on", MONTHLY_SUMMARY_EMAIL_ENABLED: "on" };

describe("the monthly email release switch", () => {
  const notEnabled = [undefined, "", "off", "test-only", "true", "ON", "On", "on ", " on", "on\n", "1", "on,off"];
  const families = () => ({
    ...twoFamilies(),
    parents: [parent("normal"), parent("marked"), parent("admin")],
    children: [child("c1", "normal"), child("c2", "marked"), child("c3", "admin")],
    workbook_delivery_receipts: [receipt("w1", "c1", "normal"), receipt("w2", "c2", "marked"), receipt("w3", "c3", "admin")],
    admin_users: [{ user_id: "admin" }],
    email_log: [{ id: "retry", parent_id: "marked", kind: "monthly_summary", summary_month: "2026-10-01", status: "failed", attempts: 2, error: "refused", unsubscribe_hash: "old-hash" }],
  });

  describe.each([undefined, "on"])("with dashboard value %j", (dashboard) => {
    it.each(notEnabled)("monthly value %j admits no family, claim, retry or send", async (value) => {
      const tables = families();
      const before = structuredClone(tables);
      const { db, reads } = fakeDb(tables);
      const store = monthlySummaryEmailStore(db, { PARENT_DASHBOARD_ENABLED: dashboard, MONTHLY_SUMMARY_EMAIL_ENABLED: value });
      const mail = memoryTransport();
      expect(dueMonthlyEmails(await store.load(NOV_1), NOV_1)).toEqual([]);
      expect(await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ due: 0, sent: 0 });
      for (const [parentId, childId] of [["normal", "c1"], ["marked", "c2"], ["admin", "c3"]]) {
        expect(await store.ledger.claim({ parentId, month: "2026-10", childIds: [childId], retry: null }, { unsubscribe_hash: "new-hash" })).toBeNull();
      }
      expect(await store.ledger.claim({ parentId: "marked", month: "2026-10", childIds: ["c2"], retry: { logId: "retry", attempts: 2 } }, { unsubscribe_hash: "new-hash" })).toBeNull();
      expect(reads).toEqual([]);
      expect(tables).toEqual(before);
      expect(mail.delivered).toEqual([]);
    });
  });

  it.each([false, true])("rejects a previously loaded direct claim and run after disable (retry %j)", async (retry) => {
    const tables = { ...twoFamilies(), email_log: retry ? families().email_log : [] };
    const env: Record<string, string | undefined> = { ...OFF };
    const { db, reads } = fakeDb(tables);
    const store = monthlySummaryEmailStore(db, env);
    const state = await store.load(NOV_1);
    const [due] = dueMonthlyEmails(state, NOV_1);
    expect(due).toMatchObject({ parentId: "marked", month: "2026-10", childIds: ["c2"], retry: retry ? { logId: "retry", attempts: 2 } : null });
    const before = structuredClone(tables);
    delete env.MONTHLY_SUMMARY_EMAIL_ENABLED;
    reads.length = 0;
    expect(await store.ledger.claim(due, { unsubscribe_hash: "new-hash" })).toBeNull();
    const mail = memoryTransport();
    // A caller can hold the old candidate state, but the real ledger must still refuse its claim.
    expect(await runMonthlyEmails({ ...store, load: async () => state }, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ due: 1, busy: 1, sent: 0 });
    expect(dueMonthlyEmails(await store.load(NOV_1), NOV_1)).toEqual([]);
    expect(reads).toEqual([]);
    expect(tables).toEqual(before);
    expect(mail.delivered).toEqual([]);
  });

  it("reads the current value on each load and permits sends only after explicit enable", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const env: Record<string, string | undefined> = { PARENT_DASHBOARD_ENABLED: "on" };
    const { db, reads } = fakeDb(tables);
    const store = monthlySummaryEmailStore(db, env);
    expect(dueMonthlyEmails(await store.load(NOV_1), NOV_1)).toEqual([]);
    expect(reads).toEqual([]);
    env.MONTHLY_SUMMARY_EMAIL_ENABLED = "on";
    const mail = memoryTransport();
    expect(await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ due: 2, sent: 2 });
    expect(mail.delivered).toHaveLength(2);
    expect(tables.email_log.map((r) => [r.parent_id, r.status]).sort()).toEqual([["marked", "sent"], ["normal", "sent"]]);
  });
});

describe("the dashboard switch decides who gets the email", () => {
  it("while it is off, only a marked family is due; a normal family is never due", async () => {
    const { db } = fakeDb(twoFamilies());
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1).map((d) => d.parentId)).toEqual(["marked"]);
  });

  it("an admin's family counts as marked", async () => {
    const { db } = fakeDb({ ...twoFamilies(), test_accounts: [], admin_users: [{ user_id: "normal" }] });
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1).map((d) => d.parentId)).toEqual(["normal"]);
  });

  it("with the exact value on, every family is due", async () => {
    const { db } = fakeDb(twoFamilies());
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, ON).load(NOV_1), NOV_1).map((d) => d.parentId).sort()).toEqual(["marked", "normal"]);
  });

  it.each(["off", "ON", "true", ""])("the value %j does not open it", async (value) => {
    const { db } = fakeDb(twoFamilies());
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, { ...OFF, PARENT_DASHBOARD_ENABLED: value }).load(NOV_1), NOV_1).map((d) => d.parentId)).toEqual(["marked"]);
  });

  it("an open plan makes no family due: the plan gate opens the dashboard, not this email", async () => {
    const { db } = fakeDb({ ...twoFamilies(), child_plan_states: [{ parent_id: "normal", child_id: "c1", kind: "paying", ends_at: null, next_charge_at: null, monthly_cents: 7999, ending_free: false }] });
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1).map((d) => d.parentId)).toEqual(["marked"]);
  });

  it("a failed read of the marks sends to no one", async () => {
    const { db } = fakeDb(twoFamilies(), { failTable: "test_accounts" });
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1)).toEqual([]);
  });
});

describe("what the run reads", () => {
  it("reads no table on a day far from any family's send window", async () => {
    const { db, reads } = fakeDb(twoFamilies());
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, ON).load(Date.UTC(2026, 10, 15, 15)), Date.UTC(2026, 10, 15, 15))).toEqual([]);
    expect(reads).toEqual([]);
  });

  it.each([
    ["the first supported zone's first send, St. John's on the 1st at 7 a.m.", Date.UTC(2026, 10, 1, 10, 30), "America/St_Johns"],
    ["the last send, Vancouver at the end of the 7th", Date.UTC(2026, 10, 8, 6, 59), "America/Vancouver"],
    ["a run on the last day of the month in UTC that is the 1st nowhere yet", Date.UTC(2026, 9, 31, 23), "America/Vancouver"],
  ])("reads on a day that can touch a window: %s", async (_label, at, zone) => {
    const { db, reads } = fakeDb({ ...twoFamilies(), parents: [{ ...parent("marked"), time_zone: zone }, { ...parent("normal"), time_zone: zone }] });
    const due = dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(at), at);
    expect(reads).toContain("workbook_delivery_receipts");
    expect(due.length).toBe(at === Date.UTC(2026, 9, 31, 23) ? 0 : 1);
  });

  it("makes one read when no book was delivered", async () => {
    const { db, reads } = fakeDb({ ...twoFamilies(), workbook_delivery_receipts: [] });
    expect((await monthlySummaryEmailStore(db, OFF).load(NOV_1)).parents).toEqual([]);
    expect(reads).toEqual(["workbook_delivery_receipts"]);
  });

  it("a failed read throws, so no one is emailed on a partial picture", async () => {
    for (const failTable of ["workbook_delivery_receipts", "workbook_delivery_corrections", "parents", "children", "email_log"]) {
      const { db } = fakeDb(twoFamilies(), { failTable });
      await expect(monthlySummaryEmailStore(db, ON).load(NOV_1), failTable).rejects.toThrow();
    }
  });

  it("sees every delivery, and a parent's unsubscribe, past the 1,000-row limit", async () => {
    const receipts = Array.from({ length: 1200 }, (_, i) => receipt(`w${String(i).padStart(5, "0")}`, "c9", "other"));
    receipts.push(receipt("w99999", "c1", "p1"));
    const log = Array.from({ length: 1200 }, (_, i) => ({ id: `log-${String(i).padStart(5, "0")}`, parent_id: "p1", kind: "monthly_summary", summary_month: `20${String(i).padStart(2, "0")}-01-01`, status: "sent", attempts: 1 }));
    log.push({ id: "log-z", parent_id: "p1", kind: "monthly_summary_unsubscribe", summary_month: null as unknown as string, status: null as unknown as string, attempts: 0 });
    const { db } = fakeDb({ ...twoFamilies(), workbook_delivery_receipts: receipts, parents: [parent("p1"), parent("other")], children: [child("c1", "p1"), child("c9", "other")], email_log: log });
    const state = await monthlySummaryEmailStore(db, ON).load(NOV_1);
    expect(state.deliveries).toHaveLength(1201);
    expect(state.log.filter((e) => e.kind === "monthly_summary_unsubscribe").map((e) => e.parentId)).toEqual(["p1"]);
    expect(dueMonthlyEmails(state, NOV_1).map((d) => d.parentId)).toEqual(["other"]);
  });

  it("uses a correction of the delivery time, read by workbook", async () => {
    const { db } = fakeDb({ ...twoFamilies(), workbook_delivery_corrections: [{ id: "x", workbook_id: "w2", delivered_at: "2026-11-01T14:30:00Z", audit_id: 5 }] });
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1)).toEqual([]);
  });

  it("never asks about another kind's rows", async () => {
    const { db } = fakeDb({ ...twoFamilies(), email_log: [
      { id: "a", parent_id: "marked", kind: "unsubscribe", status: null, attempts: 0 },
      { id: "b", parent_id: "marked", kind: "maya_unsubscribe", status: null, attempts: 0 },
    ] });
    const state = await monthlySummaryEmailStore(db, OFF).load(NOV_1);
    expect(state.log).toEqual([]);
    expect(dueMonthlyEmails(state, NOV_1)).toHaveLength(1);
  });
});

describe("an aborted load", () => {
  it.each(["workbook_delivery_receipts", "workbook_delivery_corrections", "parents", "children", "email_log", "test_accounts", "admin_users"])(
    "a slow read of %s stops at the abort, and throws: no partial picture",
    async (table) => {
      const { db } = fakeDb(twoFamilies(), { hang: { table, when: "before" } });
      const controller = new AbortController();
      const load = monthlySummaryEmailStore(db, OFF).load(NOV_1, controller.signal);
      setTimeout(() => controller.abort(), 20);
      await expect(load).rejects.toThrow();
    },
    1_000,
  );
});

describe("the time limit of a claim and its release", () => {
  const due: DueMonthly = { parentId: "marked", month: "2026-10", childIds: ["c2"], retry: null };
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  const CLAIM_MS = { claimLimitMs: 20 };
  const held = (over: Row) => ({ id: "log-1", parent_id: "marked", kind: "monthly_summary", summary_month: "2026-10-01", status: "claimed", attempts: 1, unsubscribe_hash: a, ...over });

  it("a claim that hangs after its write stops at its limit and takes its own row back", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const { db } = fakeDb(tables, { hang: { table: "email_log", method: "POST", when: "after" } });
    await expect(monthlySummaryEmailStore(db, OFF, CLAIM_MS).ledger.claim(due, { unsubscribe_hash: a })).rejects.toThrow("monthly summary claim");
    expect(tables.email_log).toEqual([]);
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1).map((d) => d.parentId)).toEqual(["marked"]);
  }, 1_000);

  it("a claim that hangs before its write leaves another run's claim alone", async () => {
    const tables = { ...twoFamilies(), email_log: [held({})] } as Record<string, Row[]>;
    const { db } = fakeDb(tables, { hang: { table: "email_log", method: "POST", when: "before" } });
    await expect(monthlySummaryEmailStore(db, OFF, CLAIM_MS).ledger.claim(due, { unsubscribe_hash: b })).rejects.toThrow("monthly summary claim");
    expect(tables.email_log).toMatchObject([{ status: "claimed", unsubscribe_hash: a }]);
  }, 1_000);

  it("a retry's claim that hangs after its write goes back to failed at its old count", async () => {
    const tables = { ...twoFamilies(), email_log: [held({ status: "failed", attempts: 2, error: "refused" })] } as Record<string, Row[]>;
    const { db } = fakeDb(tables, { hang: { table: "email_log", method: "PATCH", when: "after" } });
    const retry = { ...due, retry: { logId: "log-1", attempts: 2 } };
    await expect(monthlySummaryEmailStore(db, OFF, CLAIM_MS).ledger.claim(retry, { unsubscribe_hash: b })).rejects.toThrow("monthly summary claim retry");
    expect(tables.email_log).toMatchObject([{ status: "failed", attempts: 2, unsubscribe_hash: b }]);
  }, 1_000);

  it("a release deletes a first claim's row, and answers no for a row that is not claimed", async () => {
    const tables = { ...twoFamilies(), email_log: [held({}), held({ id: "log-2", status: "sent", summary_month: "2026-09-01" })] } as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    const { ledger } = monthlySummaryEmailStore(db, OFF);
    expect(await ledger.release("log-1", due)).toBe(true);
    expect(tables.email_log.map((r) => r.id)).toEqual(["log-2"]);
    expect(await ledger.release("log-2", { ...due, month: "2026-09" })).toBe(false);
    expect(tables.email_log).toMatchObject([{ id: "log-2", status: "sent" }]);
  });

  it("a release puts a retry back at its old count, with a reason the admin can read", async () => {
    const tables = { ...twoFamilies(), email_log: [held({ attempts: 3 })] } as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    expect(await monthlySummaryEmailStore(db, OFF).ledger.release("log-1", { ...due, retry: { logId: "log-1", attempts: 2 } })).toBe(true);
    expect(tables.email_log).toMatchObject([{ status: "failed", attempts: 2 }]);
    expect(String(tables.email_log[0].error)).toContain("ran out of time");
  });

  it("a failed release answers no, and does not throw", async () => {
    const { db } = fakeDb({ ...twoFamilies(), email_log: [held({})] }, { failTable: "email_log" });
    expect(await monthlySummaryEmailStore(db, OFF).ledger.release("log-1", due)).toBe(false);
  });

  it("a run on the real store: a claim that ended too late leaves no row and no copy, and the next run sends", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    const mail = memoryTransport();
    const store = monthlySummaryEmailStore(db, OFF);
    const clock = { t: 0 };
    const time = { now: () => clock.t, endAt: ONE_SEND_MS + 1 };
    const slow = { ...store, ledger: { ...store.ledger, claim: (...args: Parameters<typeof store.ledger.claim>) => { clock.t += 10_000; return store.ledger.claim(...args); } } };
    expect(await runMonthlyEmails(slow, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport, time })).toMatchObject({ released: 1, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
    expect(tables.email_log).toEqual([]);
    expect(tables.email_copies ?? []).toEqual([]);
    expect(await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ sent: 1 });
    expect(tables.email_log).toMatchObject([{ status: "sent", attempts: 1 }]);
  });
});

describe("the send ledger in public.email_log", () => {
  const due: DueMonthly = { parentId: "marked", month: "2026-10", childIds: ["c2"], retry: null };

  it("keeps one row per parent and month, with the unsubscribe hash in the claim, and a copy without the token", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    const mail = memoryTransport();
    const store = monthlySummaryEmailStore(db, OFF);
    expect(await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ due: 1, sent: 1 });
    expect(await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ due: 0 });
    const [row] = tables.email_log;
    const token = /\/unsubscribe\?t=([A-Za-z0-9_-]+)/.exec(mail.delivered[0].text)![1];
    expect(row).toMatchObject({ parent_id: "marked", kind: "monthly_summary", summary_month: "2026-10-01", status: "sent", attempts: 1, email_id: "email-1", unsubscribe_hash: hashToken(token), copy_child_ids: ["c2"] });
    expect(tables.email_log).toHaveLength(1);
    expect(tables.email_copies).toHaveLength(1);
    expect(tables.email_copies[0]).toMatchObject({ email_log_id: row.id, parent_id: "marked", outcome: "sent", subject: "October summary: Child c2" });
    expect(String(tables.email_copies[0].text_body)).not.toContain(token);
    expect(String(tables.email_copies[0].text_body)).toBe(hideTokens(mail.delivered[0].text));
  });

  it("a second claim of the same month answers busy, and sends nothing", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    const mail = memoryTransport();
    const store = monthlySummaryEmailStore(db, OFF);
    const state = await store.load(NOV_1);
    const message = monthlyMessage(due, "token", state, ORIGIN)!;
    expect(await sendEmailOnce(store.ledger, due, message, { transport: mail.transport, claimFields: { unsubscribe_hash: "a".repeat(64) } })).toMatchObject({ status: "sent" });
    expect(await sendEmailOnce(store.ledger, due, message, { transport: mail.transport, claimFields: { unsubscribe_hash: "b".repeat(64) } })).toEqual({ status: "busy" });
    expect(mail.delivered).toHaveLength(1);
  });

  it("keeps the claim on an unknown outcome, and a refused row retries only from its counted attempt", async () => {
    const tables = twoFamilies() as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    const mail = memoryTransport();
    const store = monthlySummaryEmailStore(db, OFF);
    mail.answerNext("no_answer");
    await runMonthlyEmails(store, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport });
    expect(tables.email_log[0]).toMatchObject({ status: "claimed", attempts: 1 });
    expect(String(tables.email_log[0].error)).toContain("unknown");
    expect(dueMonthlyEmails(await store.load(NOV_1), NOV_1)).toEqual([]);

    tables.email_log[0].status = "failed";
    const [retry] = dueMonthlyEmails(await store.load(NOV_1), NOV_1);
    expect(retry.retry).toEqual({ logId: tables.email_log[0].id, attempts: 1 });
    const before = tables.email_log[0].unsubscribe_hash;
    expect(await store.ledger.claim(retry, { unsubscribe_hash: "c".repeat(64) })).toBe(tables.email_log[0].id);
    expect(tables.email_log[0]).toMatchObject({ status: "claimed", attempts: 2, unsubscribe_hash: "c".repeat(64), copy_child_ids: ["c2"] });
    expect(before).not.toBe("c".repeat(64));
    // The row moved on, so the same retry cannot take it twice.
    expect(await store.ledger.claim(retry, { unsubscribe_hash: "d".repeat(64) })).toBeNull();
  });
});

describe("its unsubscribe link", () => {
  it("stops only this email, and reads as this email's scope", async () => {
    const { token: tok, hash } = newToken();
    const tables = { ...twoFamilies(), email_log: [{ id: "x", parent_id: "marked", kind: "monthly_summary", summary_month: "2026-10-01", status: "sent", attempts: 1, unsubscribe_hash: hash }] } as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    expect(await unsubscribeState(db, tok)).toEqual({ state: "subscribed", scope: "monthly" });
    expect(await unsubscribe(db, tok)).toBe("unsubscribed");
    expect(await unsubscribe(db, tok)).toBe("unsubscribed");
    expect(await unsubscribeState(db, tok)).toEqual({ state: "unsubscribed", scope: "monthly" });
    expect(tables.email_log.map((r) => r.kind)).toEqual(["monthly_summary", "monthly_summary_unsubscribe"]);
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(Date.UTC(2026, 11, 1, 15)), Date.UTC(2026, 11, 1, 15))).toEqual([]);
  });

  it("the reminders' own link does not turn this email off", async () => {
    const { token: rem, hash } = newToken();
    const tables = { ...twoFamilies(), email_log: [{ id: "x", parent_id: "marked", child_id: "c2", kind: "start", status: "sent", attempts: 1, unsubscribe_hash: hash }] } as Record<string, Row[]>;
    const { db } = fakeDb(tables);
    expect(await unsubscribe(db, rem)).toBe("unsubscribed");
    expect(tables.email_log.map((r) => r.kind)).toEqual(["start", "unsubscribe"]);
    expect(dueMonthlyEmails(await monthlySummaryEmailStore(db, OFF).load(NOV_1), NOV_1)).toHaveLength(1);
  });
});
