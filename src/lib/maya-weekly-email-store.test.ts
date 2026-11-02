import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { dueWeeklyEmails } from "@/lib/maya-weekly-email";
import { parentUnsubscribed, unsubscribe, unsubscribeState } from "@/lib/reminder-store";
import { hashToken } from "@/lib/sign-in-link";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";

vi.mock("server-only", () => ({}));

// The weekly Maya email's Supabase store (#332, review of PR #421): PostgREST answers at most 1,000 rows per request
// (max-rows), so every read the run needs must page. The fake below keeps the tables in memory, applies the filters,
// the order and the range of each request, and never answers more than MAX_ROWS rows.
const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      const rows = tables[table] ??= [];
      if (rows.some((r) => r.parent_id === row.parent_id && r.kind === row.kind)) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
      rows.push({ id: `inserted-${rows.length}`, ...row });
      return new Response(null, { status: 201 });
    }
    let rows = [...(tables[table] ?? [])];
    for (const [key, raw] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      if (op === "eq") rows = rows.filter((r) => String(r[key]) === value);
      else if (op === "gte") rows = rows.filter((r) => r[key] != null && String(r[key]) >= value);
      else if (op === "in") {
        const set = new Set(value.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
        rows = rows.filter((r) => set.has(String(r[key])));
      } else throw new Error(`fake db: no ${op} filter`);
    }
    const order = url.searchParams.get("order");
    if (order) {
      const keys = order.split(",").map((k) => k.split(".")[0]);
      rows.sort((a, b) => {
        for (const k of keys) {
          const c = String(a[k]).localeCompare(String(b[k]));
          if (c) return c;
        }
        return 0;
      });
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    const page = rows.slice(offset, offset + limit);
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(page), { headers: { "content-type": "application/json", "content-range": `${offset}-${offset + page.length - 1}/${rows.length}` } });
  };
  return createClient<Database>("https://fixture.invalid", "synthetic-key", { global: { fetch }, auth: { persistSession: false } });
}

/** 2026-11-02 at hh:mm in Vancouver (PST, UTC-8). */
const pst = (day: number, hh: number, mm = 0, ss = 0) => Date.UTC(2026, 10, day, hh + 8, mm, ss);
const NOW = pst(9, 8);

function noteRow(callId: string, parentId: string, childId: string, endedAt: number): Row {
  return {
    call_id: callId, parent_id: parentId, child_id: childId, note_version: 1,
    call_ended_at: new Date(endedAt).toISOString(), created_at: new Date(endedAt + 1000).toISOString(),
    facts: {}, sentences: ["{child} called Maya."], warm: null, writer: "code", model: null, prompt_version: null, transcript: [],
  };
}

const parent = (id: string) => ({ id, name: `Parent ${id}`, email: `${id}@family.ca`, postal: "V3S 1A1" });
const child = (id: string, parentId: string) => ({ id, parent_id: parentId, first_name: `Child ${id}` });
const dayBefore = (n: number) => new Date(Date.UTC(2026, 9, 31) - n * 24 * 60 * 60_000).toISOString().slice(0, 10);

describe("the weekly Maya email store under the 1,000-row limit", () => {
  it("sees a parent's Maya unsubscribe after more than 1,000 earlier email log rows", async () => {
    const log: Row[] = Array.from({ length: 1200 }, (_, i) => ({ id: `log-${String(i).padStart(5, "0")}`, kind: "maya_weekly", parent_id: "p1", week_start: dayBefore(i), status: "sent", attempts: 1 }));
    log.push({ id: "log-unsub", kind: "maya_unsubscribe", parent_id: "p1", week_start: null, status: null, attempts: 0 });
    const db = fakeDb({ maya_call_notes: [noteRow("call-1", "p1", "c1", pst(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")], email_log: log });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.log.filter((e) => e.kind === "maya_unsubscribe").map((e) => e.parentId)).toEqual(["p1"]);
    expect(dueWeeklyEmails(state, NOW)).toEqual([]);
  });

  it("reads every note of a parent's week when more than 1,000 notes are in the window", async () => {
    const notes: Row[] = [noteRow("call-a", "p1", "c1", pst(2, 8))];
    for (let i = 0; i < 999; i++) notes.push(noteRow(`call-q${String(i).padStart(4, "0")}`, "p2", "c2", pst(2, 9, Math.floor(i / 60), i % 60)));
    notes.push(noteRow("call-b", "p1", "c1", pst(2, 20)));
    const db = fakeDb({ maya_call_notes: notes, parents: [parent("p1"), parent("p2")], children: [child("c1", "p1"), child("c2", "p2")], email_log: [] });
    const state = await mayaWeeklyStore(db).load(NOW);
    expect(state.notes).toHaveLength(1001);
    const due = dueWeeklyEmails(state, NOW).find((d) => d.parentId === "p1");
    expect(due?.callIds).toEqual(["call-b", "call-a"]);
  });

  it("reads a parent's weekly claim for a week in the window, so the week is not emailed twice", async () => {
    const db = fakeDb({
      maya_call_notes: [noteRow("call-1", "p1", "c1", pst(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [{ id: "log-1", kind: "maya_weekly", parent_id: "p1", week_start: "2026-11-02", status: "sent", attempts: 1 }],
    });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toEqual([]);
  });
});

describe("Maya and reminder unsubscribe scopes", () => {
  const mayaToken = "m".repeat(43);
  const reminderToken = "r".repeat(43);
  function scopedDb(mayaKind: "maya_weekly" | "maya_daily" = "maya_weekly") {
    return fakeDb({
      maya_call_notes: [noteRow("call-1", "p1", "c1", pst(2, 15))], parents: [parent("p1")], children: [child("c1", "p1")],
      email_log: [
        { id: "old-maya", kind: mayaKind, parent_id: "p1", unsubscribe_hash: hashToken(mayaToken), week_start: "2026-10-26", status: "sent", attempts: 1 },
        { id: "reminder", kind: "start", parent_id: "p1", unsubscribe_hash: hashToken(reminderToken), status: "sent", attempts: 1 },
      ],
    });
  }
  it("a reminder unsubscribe still permits the weekly Maya recap", async () => {
    const db = scopedDb();
    expect(await unsubscribe(db, reminderToken)).toBe("unsubscribed");
    expect(await parentUnsubscribed(db, "p1")).toBe(true);
    expect(await unsubscribeState(db, mayaToken)).toEqual({ state: "subscribed", scope: "maya" });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toHaveLength(1);
  });
  it.each(["maya_weekly", "maya_daily"] as const)("a %s token stops Maya emails and leaves reminders on", async (kind) => {
    const db = scopedDb(kind);
    expect(await unsubscribe(db, mayaToken)).toBe("unsubscribed");
    expect(await unsubscribe(db, mayaToken)).toBe("unsubscribed");
    expect(await unsubscribeState(db, mayaToken)).toEqual({ state: "unsubscribed", scope: "maya" });
    expect(await parentUnsubscribed(db, "p1")).toBe(false);
    expect(await unsubscribeState(db, reminderToken)).toEqual({ state: "subscribed", scope: "reminders" });
    expect(dueWeeklyEmails(await mayaWeeklyStore(db).load(NOW), NOW)).toEqual([]);
  });
});
