import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import Account from "./page";
import StartScreen from "./start/[child]/page";
import type { ParentNote } from "@/lib/parent-maya-notes";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/maya-minutes-server", () => ({ parentMinutes: async () => new Map() }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => false }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async () => [] }) }));
const scanning = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => scanning.enabled }));
const notes = vi.hoisted(() => ({ latest: new Map<string, ParentNote>() }));
vi.mock("@/lib/parent-maya-notes", async (original) => ({ ...await original<typeof import("@/lib/parent-maya-notes")>(), latestParentMayaNotes: async () => notes.latest }));

const family = vi.hoisted(() => ({ postal: "V3S 1A1" as string | null, timeZone: null as string | null, olderChild: false, card: false }));
const opensAt = Date.parse("2026-11-18T04:29:00Z");
vi.mock("@/lib/test-attempt-server", () => ({
  parentStartStates: async () => new Map([["c1", { kind: "wait", completedAt: Date.parse("2026-10-19T04:29:00Z"), opensAt: Date.parse("2026-11-18T04:29:00Z") }]]),
}));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        // Return only selected fields, so a missing postal projection fails this test.
        const rows: Record<string, Record<string, unknown>[]> = {
          parents: [{ name: "Alex Family", email: "alex@example.com", postal: family.postal, time_zone: family.timeZone }],
          children: [{ id: "c1", parent_id: "p1", created_at: "2021-01-01", first_name: "Asha", grade: 3, province: "BC" }, ...(family.olderChild ? [{ id: "z-old", parent_id: "p1", created_at: "2020-01-01", first_name: "Sam", grade: 4, province: "ON" }] : [])],
          reports: [],
          card_setups: family.card ? [{ card_saved_at: "2026-11-01T00:00:00Z" }] : [{ card_saved_at: null }],
        };
        let data = (rows[table] ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => columns.split(/,\s*/).includes(key))));
        const query = {
          order: (key: string) => { if (key === "created_at") data.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query; },
          eq: (key: string, value: string) => { if (key === "id") data = data.filter((r) => r.id === value); return query; },
          limit: (n: number) => { data = data.slice(0, n); return query; },
          maybeSingle: async () => ({ data: data[0] ?? null }),
          then: (resolve: (result: { data: typeof data }) => unknown) => resolve({ data }),
        };
        return query;
      },
    }),
  }),
}));

beforeEach(() => { family.postal = "V3S 1A1"; family.timeZone = null; family.olderChild = false; family.card = false; scanning.enabled = false; notes.latest = new Map(); });

it("shows only the latest note and its links on the matching child's card, without an empty notes section", async () => {
  family.olderChild = true;
  notes.latest.set("c1", {
    child_id: "c1", call_id: "latest-chat", channel: "chat", startedAt: "2026-11-08T01:00:00Z", call_ended_at: "2026-11-08T01:06:00Z",
    facts: { question: { source: "workbook", page: 23, number: 4, text: "27 + 39" }, minutes: 6, finished: "with_help", reason: "solved", help: "hint", stuckOn: null, paper: "unknown", safety: false },
    sentences: ["{child} called Maya about page 23, question 4.", "{child} finished it after a small hint."], warm: null,
  });
  const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  expect(out.match(/<h3>Latest note from Maya<\/h3>/g)).toHaveLength(1);
  expect(out).toContain("Asha finished it after a small hint.");
  expect(out).toContain("Saturday, November 7 · 6:00 p.m. · 6 minutes");
  expect(out).toContain('href="/account/notes/c1/latest-chat"');
  expect(out).toContain('href="/account/notes/c1"');
  expect(out).not.toContain('href="/account/notes/z-old"');
  expect(out).not.toContain("No notes");
  expect(out).not.toContain("What Asha and Maya said");
});

it("adds no note heading or links when no session has a note", async () => {
  const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  expect(out).not.toContain("Latest note from Maya");
  expect(out).not.toContain("/account/notes/");
});

it.each([false, true])("shows the Scan pages link only when the server permits it: %s", async (enabled) => {
  scanning.enabled = enabled;
  const page = await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement("div", null, page));
  expect(html.includes('href="/account/scan"')).toBe(enabled);
});

it.each([
  ["V3S 1A1", "9:29 p.m. on Tuesday, November 17"],
  ["M5V 2T6", "11:29 p.m. on Tuesday, November 17"],
  [null, "9:29 p.m. on Tuesday, November 17"],
  ["unknown", "9:29 p.m. on Tuesday, November 17"],
])("reads the parent's postal code on the account and start server pages: %s", async (postal, expected) => {
  family.postal = postal;
  const pages = [
    await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    await StartScreen({ params: Promise.resolve({ child: "c1" }), searchParams: Promise.resolve({}) }),
  ];
  for (const page of pages) {
    const html = renderToStaticMarkup(createElement("div", null, page));
    expect(html).toContain(expected);
    expect(html).toContain(new Date(opensAt).toISOString());
    expect(html).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
  }
});


it.each([
  ["America/Toronto", "V3S 1A1", "11:29 p.m."],
  ["America/Vancouver", "M5V 2T6", "9:29 p.m."],
  ["Not/AZone", "T2P 1J9", "10:29 p.m."],
])("reads and applies browser zone %s before postal %s", async (timeZone, postal, clock) => {
  family.timeZone = timeZone;
  family.postal = postal;
  for (const page of [
    await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    await StartScreen({ params: Promise.resolve({ child: "c1" }), searchParams: Promise.resolve({}) }),
  ]) {
    const html = renderToStaticMarkup(createElement("div", null, page));
    expect(html).toContain(`${clock} on Tuesday, November 17`);
    expect(html).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
  }
});

it("R425M-3: account and a younger child's start use the oldest sibling's province", async () => {
  family.postal = null;
  family.olderChild = true;
  for (const page of [
    await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    await StartScreen({ params: Promise.resolve({ child: "c1" }), searchParams: Promise.resolve({}) }),
  ]) {
    expect(renderToStaticMarkup(createElement("div", null, page))).toContain("11:29 p.m. on Tuesday, November 17");
  }
});

it("links to the plan page only for a family with a saved card", async () => {
  const render = async () => renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  expect(await render()).not.toContain('href="/account/plan"');
  family.card = true;
  expect(await render()).toContain('href="/account/plan"');
});
