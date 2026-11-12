import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ParentNotes from "./[child]/page";
import ParentSession from "./[child]/[session]/page";
import { latestParentMayaNotes, listParentMayaNotes, readParentMayaNote, sessionWhen } from "@/lib/parent-maya-notes";
import { sessionClient } from "@/lib/supabase-auth";
import type { NoteFacts } from "@/lib/maya-call-note";

vi.mock("server-only", () => ({}));
// The Maya tab (#553): the dashboard's facts and the chat count, as the server reads them.
const tab = vi.hoisted(() => ({
  dashboard: null as import("@/lib/parent-dashboard-server").ParentDashboard | null,
  chats: new Map<string, import("@/lib/maya-chat").ChatUsage>(),
}));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => tab.dashboard }));
vi.mock("@/lib/maya-chat-server", () => ({ parentChatUsage: async () => tab.chats }));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/notes",
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));

const state = vi.hoisted(() => ({
  user: "p1" as string | null, postal: "V3S 1A1" as string | null, zone: null as string | null, name: "Leah",
  rows: [] as Record<string, unknown>[], projections: [] as string[], fail: false, metadata: true,
}));
function terms(text: string): string[] {
  let depth = 0, start = 0;
  const found: string[] = [];
  [...text].forEach((c, i) => {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { found.push(text.slice(start, i)); start = i + 1; }
  });
  return [...found, text.slice(start)];
}
function matches(row: Record<string, unknown>, term: string): boolean {
  if (term.startsWith("and(")) return terms(term.slice(4, -1)).every((t) => matches(row, t));
  const [key, op, ...parts] = term.split(".");
  const value = parts.join(".");
  if (op === "lt") return String(row[key]) < value;
  if (op === "gt") return String(row[key]) > value;
  if (op === "eq") return String(row[key]) === value;
  throw new Error(`Unsupported filter ${term}`);
}
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
        or: (filter: string) => { rows = rows.filter((r) => terms(filter).some((t) => matches(r, t))); return query; },
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
beforeEach(() => { tab.dashboard = null; tab.chats = new Map(); state.user = "p1"; state.postal = "V3S 1A1"; state.zone = null; state.name = "Leah"; state.rows = [row(), row(call, child, "p1", "call")]; state.projections = []; state.fail = false; state.metadata = true; });
const html = (node: React.ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const list = (id = child, cursor?: string) => ParentNotes({ params: Promise.resolve({ child: id }), searchParams: Promise.resolve({ cursor }) });
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
  expect(notes.get(child)?.call_id).toBe("44444444-4444-4444-8444-000000000064");
  expect(state.projections.some((p) => p.includes("transcript"))).toBe(false);
});

it.each([false, true])("keeps all original notes when a new note arrives between pages, tied=%s", async (tied) => {
  state.rows = Array.from({ length: 43 }, (_, i) => ({
    ...row(`44444444-4444-4444-8444-${String(42 - i).padStart(12, "0")}`),
    call_ended_at: tied ? "2026-11-08T01:06:00.123456Z" : `2026-11-${String(8 - Math.floor(i / 10)).padStart(2, "0")}T01:06:00Z`,
  }));
  const expected = state.rows.map((r) => r.call_id);
  const db = await sessionClient();
  const first = await listParentMayaNotes(db, "p1", child);
  const firstHtml = html(await list());
  expect(firstHtml).toContain(`?cursor=${first.older}`);
  expect(first.newer).toBeNull();
  // A newly completed session must not move the boundary of the older page.
  state.rows.push({ ...row(call), call_ended_at: "2026-11-09T01:06:00Z" });
  // These rows must not enter this child's pages, even when their keys pass the cursor.
  state.rows.push(row(other, other, "p2"), row(chat, sibling));
  const second = await listParentMayaNotes(db, "p1", child, first.older!);
  const third = await listParentMayaNotes(db, "p1", child, second.older!);
  const pages = [first, second, third];
  expect(pages.map((p) => p.notes.length)).toEqual([20, 20, 3]);
  expect(third.older).toBeNull();
  expect(pages.flatMap((p) => p.notes.map((n) => n.call_id))).toEqual(expected);
  expect((await listParentMayaNotes(db, "p1", child, third.newer!)).notes).toEqual(second.notes);
  expect((await listParentMayaNotes(db, "p1", child, second.newer!)).notes).toEqual(first.notes);
  const secondHtml = html(await list(child, first.older!));
  expect(secondHtml).toContain(`?cursor=${second.newer}`);
  expect(secondHtml).toContain(`?cursor=${second.older}`);
  expect(secondHtml).not.toContain("?page=");
  expect(state.projections.some((p) => p.includes("transcript"))).toBe(false);
  expect((await listParentMayaNotes(db, "p1", child)).notes[0].call_id).toBe(call);
});

it("lets an empty cursor page return to the newest notes", async () => {
  state.rows = Array.from({ length: 21 }, (_, i) => row(`44444444-4444-4444-8444-${String(i).padStart(12, "0")}`));
  const first = await listParentMayaNotes(await sessionClient(), "p1", child);
  state.rows = [];
  const out = html(await list(child, first.older!));
  expect(out).toContain("There are no older notes.");
  expect(out).toContain(`href="/account/notes/${child}"`);
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

it.each([
  undefined, "-1", "0", "NaN", ["a", "b"], "x".repeat(501),
  ...["2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "2026-11-08T01:06:00Z),child_id.gt.0", "0000-01-01T00:00:00Z", "2026-11-08T01:06:00+16:00", "2026-11-08T01:06:00-14:60"].map((at) =>
    Buffer.from(JSON.stringify({ at, id: chat, direction: "older" })).toString("base64url")),
  ...[{ at: "2026-11-08T01:06:00Z", id: "bad-id", direction: "older" },
    { at: "2026-11-08T01:06:00Z", id: chat, direction: "invalid" }, null].map((c) => Buffer.from(JSON.stringify(c)).toString("base64url")),
])("returns the first page for invalid cursor %s", async (input) => {
  expect(html(await ParentNotes({ params: Promise.resolve({ child }), searchParams: Promise.resolve({ cursor: input }) }))).toBe(html(await list()));
});

// The golden files were written from these pages before the Maya tab existed (#553). A family the dashboard's switch does
// not open to keeps them byte for byte.
it("gives a family without the dashboard today's notes pages, byte for byte", async () => {
  await expect(html(await list())).toMatchFileSnapshot("./notes-list.golden.html");
  await expect(html(await session())).toMatchFileSnapshot("./notes-session.golden.html");
});

describe("the Maya tab (#553)", () => {
  type Tab = import("@/lib/child-stage").ChildTab;
  const withMaya: Tab[] = ["overview", "workbooks", "maya", "assessment", "account"];
  const view = (id: string, firstName: string, tabs: Tab[]) => ({
    id, firstName, schoolGrade: 3 as const, stage: "active" as const, opensOn: "overview" as const, tabs, readOnly: false, currentWorkbook: { number: 1 }, reportIds: [], finishedTests: [],
  });
  const open = (tabs: Tab[] = withMaya) => {
    tab.dashboard = { children: [view(sibling, "Sam", withMaya), view(child, "Leah", tabs)], remembered: null, pinSet: true, timeZoneSaved: true };
  };

  it("shows this child's gated chat usage and saved notes without a voice allowance", async () => {
    open();
    tab.chats.set(child, { used: 8, left: 52, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
    tab.chats.set(sibling, { used: 60, left: 0, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
    const out = html(await list());
    expect(out).toContain('<p class="eyebrow">Maya</p>');
    expect(out).toContain("<h1>Leah</h1>");
    expect(out).toContain("Leah used 8 of 60 chat messages today. 52 left.");
    expect(out).not.toMatch(/of 30 minutes|minutes left|minutes start again|Try Maya|Start call/i);
    expect(out).not.toContain("Sam used");
    expect(out.match(/class="maya-note-item"/g)).toHaveLength(2);
    expect(out).toContain(`href="/account/notes/${child}/${chat}"`);
    expect(out).toContain(`href="/account/notes/${child}/${call}"`);
    expect(out).not.toContain("Shall we get going?");
    expect(state.projections.some((p) => p.includes("transcript"))).toBe(false);
    // The tabs are the way back.
    expect(out).not.toContain("Back to your account");
    expect(out).not.toMatch(/\b(?:she|her|companion)\b/i);
  });

  it("keeps the no-notes state with chat closed, without an empty usage card", async () => {
    open();
    state.rows = [];
    const out = html(await list());
    expect(out).not.toContain("maya-tab-week");
    expect(out).not.toMatch(/minutes left|Try Maya|Start call|chat messages today/i);
    expect(out).toContain("There are no notes from Maya yet.");
  });

  it("keeps existing chat usage when no notes are saved, including the daily cap", async () => {
    open();
    state.rows = [];
    tab.chats.set(child, { used: 60, left: 0, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
    const out = html(await list());
    expect(out).toContain("Maya chat today");
    expect(out).toContain("Leah used all 60 chat messages today.");
    expect(out).toContain("Chat starts again at midnight on November 9.");
    expect(out).toContain("There are no notes from Maya yet.");
    expect(out).not.toMatch(/minutes left|Try Maya|Start (?:a )?call/i);
  });

  it.each(["ended", "younger", "release_closed"])("keeps historical call and chat notes with no chat usage: %s", async (reason) => {
    open();
    const view = tab.dashboard!.children.find(kid => kid.id === child)!;
    if (reason === "ended") { view.stage = "ended"; view.readOnly = true; }
    if (reason === "younger") view.schoolGrade = 2;
    const out = html(await list());
    expect(out).not.toContain("maya-tab-week");
    expect(out).not.toMatch(/chat messages today|minutes left|Try Maya|Start (?:a )?call/i);
    expect(out).toContain("Read the call");
    expect(out).toContain("Read the chat");
    expect(out).toContain("6 minutes");
  });

  it("never lists a note that has no family call or chat behind it, such as an admin test call", async () => {
    open();
    state.rows = [row(), row(call, child, "p1", "admin_test")];
    const out = html(await list());
    expect(out.match(/class="maya-note-item"/g)).toHaveLength(1);
    expect(out).not.toContain(`/${child}/${call}`);
    expect(out).toContain(`/${child}/${chat}`);
  });

  it("takes the transcript page back to the Maya tab", async () => {
    open();
    const out = html(await session(child, call));
    expect(out).toContain(`<a class="maya-notes-back" href="/account/notes/${child}">← Back to Maya</a>`);
    expect(out).toContain("Hi Leah! Shall we get going?");
    expect(out).not.toContain("Back to your account");
  });

  it("leaves a child without the Maya tab on today's pages, with no minutes read", async () => {
    open(["overview", "workbooks", "assessment", "account"]);
    await expect(html(await list())).toMatchFileSnapshot("./notes-list.golden.html");
    await expect(html(await session())).toMatchFileSnapshot("./notes-session.golden.html");
  });
});
