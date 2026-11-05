import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Account from "./page";
import StartScreen from "../start/[child]/page";
import type { ParentNote } from "@/lib/parent-maya-notes";
import type { ChildView } from "@/lib/parent-view";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const minutes = vi.hoisted(() => ({ value: new Map<string, import("@/lib/maya-minutes-server").ChildMinutes>() }));
vi.mock("@/lib/maya-minutes-server", () => ({ parentMinutes: async () => minutes.value }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => false }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async () => [] }) }));
const scanning = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => scanning.enabled }));
const notes = vi.hoisted(() => ({ latest: new Map<string, ParentNote>() }));
vi.mock("@/lib/parent-maya-notes", async (original) => ({ ...await original<typeof import("@/lib/parent-maya-notes")>(), latestParentMayaNotes: async () => notes.latest }));

const dashboard = vi.hoisted(() => ({ value: null as import("@/lib/parent-dashboard-server").ParentDashboard | null }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => dashboard.value }));
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

beforeEach(() => { minutes.value = new Map(); dashboard.value = null; family.postal = "V3S 1A1"; family.timeZone = null; family.olderChild = false; family.card = false; scanning.enabled = false; notes.latest = new Map(); });

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

// The golden file was written from the page before the dashboard existed (#551). It may change only with a change to
// Parent home itself.
it("gives a family the switch does not open to today's Parent home, byte for byte", async () => {
  family.card = true;
  family.olderChild = true;
  scanning.enabled = true;
  const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ password: "1", pin: "1", existing: "1" }) })));
  await expect(out).toMatchFileSnapshot("./parent-home.golden.html");
  expect(out).not.toContain("pd-");
});

describe("a family the switch opens to", () => {
  const view = (id: string, firstName: string): ChildView => ({ id, firstName, schoolGrade: 3, stage: "test_running", opensOn: "continue_or_wait", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], finishedTests: [] });
  const open = async (query: Record<string, string> = {}) => {
    dashboard.value = { children: [view("z-old", "Sam"), view("c1", "Asha")], remembered: null, pinSet: true, timeZoneSaved: true };
    return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve(query) })));
  };
  beforeEach(() => { family.olderChild = true; });

  it("opens on the last child viewed, with only that child's part", async () => {
    dashboard.value = null;
    const first = await open();
    expect(first).toContain("<h1>Sam&#x27;s math test</h1>");
    dashboard.value = { children: [view("z-old", "Sam"), view("c1", "Asha")], remembered: "c1", pinSet: true, timeZoneSaved: true };
    const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
    expect(out).toContain("<h1>Asha&#x27;s math test</h1>");
    expect(out).not.toContain("Sam");
  });

  it("follows the address, and ignores a child who is not the family's", async () => {
    expect(await open({ child: "c1" })).toContain("<h1>Asha&#x27;s math test</h1>");
    expect(await open({ child: "another-family" })).toContain("<h1>Sam&#x27;s math test</h1>");
  });

  it("keeps the test, its date and the saved messages, and adds no panel", async () => {
    const out = await open({ child: "c1", password: "1", pin: "1" });
    expect(out).toContain("Your password is saved.");
    expect(out).toContain("Your PIN is saved.");
    expect(out).toContain("on Tuesday, November 17");
    expect(out).toContain("<p class=\"eyebrow\">Assessment</p>");
    expect(out).not.toMatch(/\b(?:she|her)\b/i);
  });

  it("moves the minutes and the note to the Maya tab when the child has it", async () => {
    notes.latest.set("c1", {
      child_id: "c1", call_id: "latest-chat", channel: "chat", startedAt: "2026-11-08T01:00:00Z", call_ended_at: "2026-11-08T01:06:00Z",
      facts: { question: { source: "workbook", page: 23, number: 4, text: "27 + 39" }, minutes: 6, finished: "with_help", reason: "solved", help: "hint", stuckOn: null, paper: "unknown", safety: false },
      sentences: ["{child} called Maya about page 23, question 4.", "{child} finished it after a small hint."], warm: null,
    });
    minutes.value = new Map([["c1", { used: 12, left: 18, backOn: "Monday, November 9" }]]);
    const tabs = ["overview", "workbooks", "maya", "assessment", "account"] as const;
    const asha = { ...view("c1", "Asha"), stage: "active" as const, opensOn: "overview" as const, tabs: [...tabs] };
    dashboard.value = { children: [view("z-old", "Sam"), asha], remembered: null, pinSet: true, timeZoneSaved: true };
    const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })));
    expect(out).not.toContain("Latest note from Maya");
    expect(out).not.toContain("Maya this week");
    expect(out).not.toContain("Try Maya");
    // Without the tab the same facts stay on the home page.
    dashboard.value = { children: [view("z-old", "Sam"), { ...asha, tabs: tabs.filter((t) => t !== "maya") }], remembered: null, pinSet: true, timeZoneSaved: true };
    const kept = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })));
    expect(kept).toContain("Latest note from Maya");
    expect(kept).toContain("Asha used 12 of 30 minutes.");
  });

  it("keeps the note and the scan link until a tab holds them", async () => {
    notes.latest.set("c1", {
      child_id: "c1", call_id: "latest-chat", channel: "chat", startedAt: "2026-11-08T01:00:00Z", call_ended_at: "2026-11-08T01:06:00Z",
      facts: { question: { source: "workbook", page: 23, number: 4, text: "27 + 39" }, minutes: 6, finished: "with_help", reason: "solved", help: "hint", stuckOn: null, paper: "unknown", safety: false },
      sentences: ["{child} called Maya about page 23, question 4.", "{child} finished it after a small hint."], warm: null,
    });
    scanning.enabled = true;
    const out = await open({ child: "c1" });
    expect(out).toContain("Asha finished it after a small hint.");
    expect(out).toContain('href="/account/notes/c1"');
    expect(out).toContain('href="/account/scan"');
  });

  describe("each stage before the plan", () => {
    const withStage = (over: Partial<ChildView>): ChildView => ({ ...view("c1", "Asha"), ...over });
    const openOne = async (child: ChildView, query: Record<string, string> = {}) => {
      dashboard.value = { children: [child], remembered: null, pinSet: true, timeZoneSaved: true };
      return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve(query) })));
    };
    const finished = { reportIds: ["r2", "r1"] };

    it("opens report_ready_bc on the newest report", async () => {
      await expect(openOne(withStage({ stage: "report_ready_bc", opensOn: "report_start_free_month", ...finished }))).rejects.toThrow("REDIRECT /account/report/r2");
    });

    it("opens report_ready_waitlist on the newest report", async () => {
      await expect(openOne(withStage({ stage: "report_ready_waitlist", opensOn: "report_waitlist", ...finished }))).rejects.toThrow("REDIRECT /account/report/r2");
    });

    it("keeps a saved message on the way to the report", async () => {
      await expect(openOne(withStage({ stage: "report_ready_bc", opensOn: "report_start_free_month", ...finished }), { password: "1" })).rejects.toThrow("REDIRECT /account/report/r2?password=1");
    });

    it("opens the child the address names, not the oldest", async () => {
      dashboard.value = { children: [view("z-old", "Sam"), withStage({ stage: "report_ready_bc", opensOn: "report_start_free_month", ...finished })], remembered: null, pinSet: true, timeZoneSaved: true };
      await expect(Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })).rejects.toThrow("REDIRECT /account/report/r2");
      expect(renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "z-old" }) })))).toContain("Sam&#x27;s math test");
    });

    it("opens no_test on Start test, with how it works and no report", async () => {
      const out = await openOne({ ...withStage({ stage: "no_test", opensOn: "start_test" }), id: "z-old", firstName: "Sam" });
      expect(out).toContain("Start Sam&#x27;s free math test");
      expect(out).toContain('href="/account/test/z-old"');
      expect(out).toContain("How it works");
      expect(out).toContain('href="/sample-report"');
      expect(out).not.toContain("Start free month");
    });

    it("opens test_running on the test's state: here a test waiting for its report", async () => {
      const out = await openOne(withStage({ stage: "test_running", opensOn: "continue_or_wait" }));
      expect(out).toContain("Asha finished the test");
      expect(out).toContain("What the report shows");
      expect(out).toContain("The next test opens at");
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
    });

    it("sends no one anywhere when the family's own page is Parent home", async () => {
      dashboard.value = null;
      const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
      expect(out).toContain("Your account");
      expect(out).not.toContain("pd-");
    });
  });
});
