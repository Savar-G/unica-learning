import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import ParentNotes from "./[child]/page";
import ParentSession from "./[child]/[session]/page";
import { latestParentMayaNotes, listParentMayaNotes, readParentMayaNote, sessionWhen, notesPage } from "@/lib/parent-maya-notes";
import { sessionClient } from "@/lib/supabase-auth";
import type { NoteFacts } from "@/lib/maya-call-note";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));

const state = vi.hoisted(() => ({
  user: "p1" as string | null, postal: "V3S 1A1" as string | null, zone: null as string | null, name: "Leah",
  rows: [] as Record<string, unknown>[], projections: [] as string[], fail: false, metadata: true,
}));
const child = "11111111-1111-4111-8111-111111111111";
const sibling = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const chat = "44444444-4444-4444-8444-444444444444";
const call = "55555555-5555-4555-8555-555555555555";

// This reader has no RLS. Page and reader ownership predicates must work independently of the hosted policy.
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => state.user,
  sessionClient: async () => ({
    from: (table: string) => ({ select: (columns: string) => {
      state.projections.push(`${table}:${columns}`);
      const records: Record<string, Record<string, unknown>[]> = {
        parents: [{ id: "p1", postal: state.postal, time_zone: state.zone }, { id: "p2", postal: "M5V 1A1" }],
        children: [
          { id: child, parent_id: "p1", first_name: state.name, province: "BC", created_at: "2025-01-02" },
          { id: sibling, parent_id: "p1", first_name: "Sam", province: "ON", created_at: "2025-01-01" },
          { id: other, parent_id: "p2", first_name: "Other child", province: "ON", created_at: "2025-01-01" },
        ],
        maya_call_notes: state.rows,
      };
      let rows = [...(records[table] ?? [])];
      const orders: { key: string; ascending: boolean }[] = [];
      const result = () => {
        rows.sort((a, b) => {
          for (const { key, ascending } of orders) {
            const cmp = String(a[key]).localeCompare(String(b[key]));
            if (cmp) return ascending ? cmp : -cmp;
          }
          return 0;
        });
        return { data: state.fail ? null : rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => columns.split(/,\s*/).includes(k)))), error: state.fail ? { message: "offline" } : null };
      };
      const query = {
        eq: (k: string, v: string) => { rows = rows.filter((r) => r[k] === v); return query; },
        order: (key: string, options?: { ascending: boolean }) => { orders.push({ key, ascending: options?.ascending ?? true }); return query; },
        limit: (n: number) => { result(); rows = rows.slice(0, n); return query; },
        range: (a: number, b: number) => { result(); rows = rows.slice(a, b + 1); return query; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then: (resolve: (r: ReturnType<typeof result>) => unknown) => resolve(result()),
      };
      return query;
    } }),
    rpc: async (_fn: string, args: { p_calls: string[] }) => ({ data: state.metadata ? state.rows.filter((r) => args.p_calls.includes(String(r.call_id))).map((r) => ({ call_id: r.call_id, channel: r.channel, started_at: r.started_at })) : [], error: null }),
  }),
}));

function row(id = chat, childId = child, parent = "p1", channel = "chat") {
  const facts: NoteFacts = {
    question: { source: "workbook", page: 23, number: 4, text: "27 + 39 = ?" },
    finished: "with_help", reason: "solved", help: "worked_example", stuckOn: "adding the ones and carrying",
    paper: "child_confirmed", minutes: 6, safety: false,
  };
  return {
    call_id: id, child_id: childId, parent_id: parent, channel,
    started_at: "2026-11-08T01:00:00Z", call_ended_at: "2026-11-08T01:06:00Z", facts,
    sentences: ["{child} called Maya about page 23, question 4.", "{child} got stuck on adding the ones and carrying.", "Maya showed an easier example first. Then {child} finished it.", "{child} said the answer is on paper now."],
    warm: "{child} kept trying.", transcript: [
      { speaker: "maya", second: 0, text: "Hi {child}! Shall we get going?" },
      { speaker: "child", second: 75, text: "<script>unsafe()</script> I need help." },
      { speaker: "note", second: 80, text: "Writing on paper." },
    ],
  };
}
beforeEach(() => { state.user = "p1"; state.postal = "V3S 1A1"; state.zone = null; state.name = "Leah"; state.rows = [row(), row(call, child, "p1", "call")]; state.projections = []; state.fail = false; state.metadata = true; });
const html = (node: React.ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const list = (id = child, page?: string) => ParentNotes({ params: Promise.resolve({ child: id }), searchParams: Promise.resolve({ page }) });
const session = (id = child, note = chat) => ParentSession({ params: Promise.resolve({ child: id, session: note }), searchParams: Promise.resolve({}) });

it.each([[chat, "Chat"], [call, "Call"]])("renders the owning family's %s note and transcript", async (id, kind) => {
  const out = html(await session(child, id));
  expect(out).toContain(`${kind} with Maya`);
  expect(out).toContain("Saturday, November 7 · 6:00 p.m. · 6 minutes");
  expect(out).toContain("Then Leah finished it.");
  expect(out).toContain("Leah kept trying.");
  expect(out).toContain("Hi Leah! Shall we get going?");
  expect(out).toContain("1:15");
  expect(out).toContain("&lt;script&gt;");
  expect(out).not.toContain("<script>unsafe()");
  expect(out).not.toContain("{child}");
  expect(out).not.toMatch(/\b(?:UTC|PST|PDT)\b/);
});

it("lists chat and call notes with links, but never loads transcripts for a list", async () => {
  const out = html(await list());
  expect(out).toContain(`/${child}/${chat}`);
  expect(out).toContain(`/${child}/${call}`);
  expect(out).toContain("Read the chat");
  expect(out).toContain("Read the call");
  expect(out).not.toContain("Shall we get going?");
  expect(state.projections.some((p) => p.includes("transcript"))).toBe(false);
});

it("uses chat words without changing a child's name or a quoted transcript line", async () => {
  state.name = "Call";
  state.rows[0].sentences = ["{child} called Maya about page 23, question 4.", "{child} ended the call before the question was done."];
  state.rows[0].transcript = [{ speaker: "child", second: 0, text: "Call me {child}." }];
  const out = html(await session());
  expect(out).toContain("Call ended the chat before the question was done.");
  expect(out).toContain("Call me Call.");
  expect(out).not.toContain("Chat ended the chat");
});

it("denies another family's child on list and session pages before reading any note", async () => {
  state.user = "p2";
  await expect(list()).rejects.toThrow("NOT_FOUND");
  await expect(session()).rejects.toThrow("NOT_FOUND");
  expect(state.projections.some((p) => p.startsWith("maya_call_notes:"))).toBe(false);
});

it("denies another family's session even under the caller's own child URL", async () => {
  state.user = "p2";
  await expect(session(other)).rejects.toThrow("NOT_FOUND");
  expect(html(await list(other))).not.toContain("Then Leah finished it.");
});

it("denies a sibling mismatch, invalid ID, absent note and missing metadata", async () => {
  await expect(session(sibling)).rejects.toThrow("NOT_FOUND");
  await expect(session(child, "invalid")).rejects.toThrow("NOT_FOUND");
  await expect(session(child, other)).rejects.toThrow("NOT_FOUND");
  state.metadata = false;
  await expect(session()).rejects.toThrow("NOT_FOUND");
});

it("redirects a signed-out parent before any family or note read", async () => {
  state.user = null;
  await expect(list()).rejects.toThrow("REDIRECT /sign-in");
  await expect(session()).rejects.toThrow("REDIRECT /sign-in");
  expect(state.projections).toEqual([]);
});

it("uses browser zone, then postal, then the oldest sibling's province", async () => {
  state.zone = "America/Toronto";
  expect(html(await session())).toContain("8:00 p.m.");
  state.zone = null; state.postal = "A1A 1A1";
  expect(html(await session())).toContain("9:30 p.m.");
  state.postal = null;
  expect(html(await session())).toContain("8:00 p.m.");
});

it("keeps every child's latest note even when a sibling has more than 50 newer notes", async () => {
  state.rows = Array.from({ length: 65 }, (_, i) => row(`44444444-4444-4444-8444-${String(i).padStart(12, "0")}`));
  state.rows.push({ ...row(call, sibling, "p1", "call"), call_ended_at: "2026-10-01T01:00:00Z" });
  const notes = await latestParentMayaNotes(await sessionClient(), "p1", [child, sibling, other]);
  expect([...notes.keys()]).toEqual([child, sibling]);
  expect(notes.get(sibling)?.call_id).toBe(call);
  expect(notes.get(child)?.call_id).toBe("44444444-4444-4444-8444-000000000000");
  expect(state.projections.some((p) => p.includes("transcript"))).toBe(false);
});

it("paginates tied timestamps without losing or duplicating old notes", async () => {
  state.rows = Array.from({ length: 43 }, (_, i) => row(`44444444-4444-4444-8444-${String(42 - i).padStart(12, "0")}`));
  const db = await sessionClient();
  const pages = await Promise.all([0, 1, 2].map((p) => listParentMayaNotes(db, "p1", child, p)));
  expect(pages.map((p) => p.notes.length)).toEqual([20, 20, 3]);
  expect(pages.map((p) => p.hasMore)).toEqual([true, true, false]);
  expect(new Set(pages.flatMap((p) => p.notes.map((n) => n.call_id))).size).toBe(43);
  expect(html(await list(child, "2"))).toContain("?page=1");
  expect(html(await list(child, "2"))).toContain("?page=3");
});

it("does not turn a database failure into an empty history", async () => {
  state.fail = true;
  await expect(list()).rejects.toThrow("could not be read");
  await expect(readParentMayaNote(await sessionClient(), "p1", child, chat)).rejects.toThrow("offline");
});

it("formats a session across the family date boundary and the correct seasonal rule", async () => {
  const note = await readParentMayaNote(await sessionClient(), "p1", child, chat);
  expect(note).not.toBeNull();
  expect(sessionWhen({ ...note!, startedAt: "2026-11-08T06:59:00Z" }, "America/Vancouver")).toContain("Saturday, November 7 · 11:59 p.m.");
  expect(sessionWhen({ ...note!, startedAt: "2026-11-08T07:00:00Z" }, "America/Vancouver")).toContain("Sunday, November 8 · 12:00 a.m.");
});

it.each([undefined, "-1", "0", "NaN", "1.1", ["2", "3"], "9999999"])("rejects an invalid page %s", (input) => expect(notesPage(input)).toBe(0));
