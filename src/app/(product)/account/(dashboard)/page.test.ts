import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Account from "./page";
import StartScreen from "../start/[child]/page";
import type { ParentNote } from "@/lib/parent-maya-notes";
import type { ChildView } from "@/lib/parent-view";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account", useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const chats = vi.hoisted(() => ({ value: new Map<string, import("@/lib/maya-chat").ChatUsage>() }));
vi.mock("@/lib/maya-chat-server", () => ({ parentChatUsage: async () => chats.value }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => false }));
const mayaNotice = vi.hoisted(() => ({ due: false, books: [] as { id: string; childId: string; number: number; status: string }[] }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async (child: string) => mayaNotice.books.filter((b) => b.childId === child) }) }));
vi.mock("@/lib/maya-notice-server", () => ({ mayaNoticeDueForFamily: async () => mayaNotice.due }));
const planNote = vi.hoisted(() => ({ closed: null as null | { reason: string; child: string | null } }));
vi.mock("@/components/plan-closed-note", () => ({
  closedNoteFor: async (_parent: string, dashboard: boolean) => (planNote.closed ? { closed: planNote.closed, dashboardOpen: dashboard } : null),
  PlanClosedNote: ({ on, dashboardOpen }: { on: string; dashboardOpen?: boolean }) => `Your plan is closed, on ${on}${dashboardOpen ? ", dashboard open" : ""}`,
}));
const scanning = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => scanning.enabled }));
const progress = vi.hoisted(() => ({ value: new Map<string, import("@/lib/progress-preview-server").HomeProgress>(), reads: null as string[][] | null }));
vi.mock("@/lib/progress-preview-server", () => ({ homeProgress: async (_db: unknown, _parent: string, reports: { child_id: string }[]) => { progress.reads?.push(reports.map((r) => r.child_id)); return new Map([...progress.value].filter(([id]) => reports.some((r) => r.child_id === id))); } }));
const notes = vi.hoisted(() => ({ latest: new Map<string, ParentNote>() }));
vi.mock("@/lib/parent-maya-notes", async (original) => ({ ...await original<typeof import("@/lib/parent-maya-notes")>(), latestParentMayaNotes: async () => notes.latest }));

const dashboard = vi.hoisted(() => ({ value: null as import("@/lib/parent-dashboard-server").ParentDashboard | null }));
const overview = vi.hoisted(() => ({ value: null as import("@/lib/parent-view").OverviewView | null, reads: 0 }));
vi.mock("@/lib/parent-dashboard-server", () => ({
  parentDashboard: async () => dashboard.value,
  dashboardOverview: async () => { overview.reads++; return overview.value; },
}));
const family = vi.hoisted(() => ({ postal: "V3S 1A1" as string | null, timeZone: null as string | null, olderChild: false, card: false, signedOut: false, report: false, reportVersion: null as number | null }));
const opensAt = Date.parse("2026-11-18T04:29:00Z");
vi.mock("@/lib/test-attempt-server", () => ({
  parentStartStates: async () => new Map([["c1", { kind: "wait", completedAt: Date.parse("2026-10-19T04:29:00Z"), opensAt: Date.parse("2026-11-18T04:29:00Z") }]]),
}));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => (family.signedOut ? null : "p1"),
  sessionClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        // Return only selected fields, so a missing postal projection fails this test.
        const rows: Record<string, Record<string, unknown>[]> = {
          parents: [{ name: "Alex Family", email: "alex@example.com", postal: family.postal, time_zone: family.timeZone }],
          children: [{ id: "c1", parent_id: "p1", created_at: "2021-01-01", first_name: "Asha", grade: 3, province: "BC" }, ...(family.olderChild ? [{ id: "z-old", parent_id: "p1", created_at: "2020-01-01", first_name: "Sam", grade: 4, province: "ON" }] : [])],
          reports: family.report ? [{ id: "r1", child_id: "c1", adaptive_version: family.reportVersion }] : [],
          // Both children have a test, so the goals step (D-325) does not stop the start screen.
          assessments: [{ child_id: "c1" }, { child_id: "z-old" }],
          card_setups: family.card ? [{ card_saved_at: "2026-11-01T00:00:00Z" }] : [{ card_saved_at: null }],
        };
        let data = (rows[table] ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => columns.split(/,\s*/).some(column => column === key || column.startsWith(`${key}:`)))));
        const query = {
          order: (key: string) => { if (key === "created_at") data.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query; },
          eq: (key: string, value: string) => { if (key === "id") data = data.filter((r) => r.id === value); return query; },
          limit: (n: number) => { data = data.slice(0, n); return query; },
          in: (key: string, values: unknown[]) => { data = data.filter((r) => values.includes(r[key])); return query; },
          maybeSingle: async () => ({ data: data[0] ?? null }),
          then: (resolve: (result: { data: typeof data }) => unknown) => resolve({ data }),
        };
        return query;
      },
    }),
  }),
}));

beforeEach(() => { chats.value = new Map(); dashboard.value = null; overview.value = null; overview.reads = 0; family.postal = "V3S 1A1"; family.timeZone = null; family.olderChild = false; family.card = false; family.report = false; family.reportVersion = null; family.signedOut = false; scanning.enabled = false; notes.latest = new Map(); progress.value = new Map(); progress.reads = null; });

it("a signed-out parent signs in and comes back to the child the link named (#563)", async () => {
  family.signedOut = true;
  await expect(Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })).rejects.toThrow("REDIRECT /sign-in?next=%2Faccount%3Fchild%3Dc1");
  await expect(Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/sign-in$/);
});

it("shows only the latest note and its links on the matching child's card, without an empty notes section", async () => {
  family.olderChild = true;
  chats.value.set("c1", { used: 7, left: 53, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
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
  expect(out).toContain("Asha used 7 of 60 chat messages today.");
  expect(out).not.toContain("Sam used");
  expect(out).not.toMatch(/of 30 minutes|minutes left|minutes start again|Try Maya|Start (?:a )?call/i);
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

it("shows the goal sentence from the child's newest report, with a link to the report's plan", async () => {
  family.report = true;
  const render = async () => renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  expect(await render()).not.toContain("We can help");
  progress.value = new Map([["c1", { href: "/account/report/r1#rpt-progress", preview: {
    name: "Asha", today: 1, goal: 3, todayLabel: "Grade 1 level", goalLabel: "Grade 3 level", goalMonth: "September 2027",
    sentence: { lead: "We can help Asha reach a ", goal: "grade 3 level", by: "September 2027" }, rows: [], books: [1, 1, 2], stages: [],
    steps: [{ title: "A new workbook every 2 weeks", text: "" }, { title: "8 pages a day, 5 days a week", text: "" }, { title: "We mark the finished pages", text: "" }], basis: "",
  } }]]);
  const out = await render();
  expect(out).toContain("We can help Asha reach a <b>grade 3 level</b> by <b>September 2027</b>.");
  expect(out).toContain("3 workbooks, 8 pages a day, 5 days a week.");
  expect(out).toContain('href="/account/report/r1#rpt-progress"');
});

it("shows no goal sentence once the child has a shipped workbook, and reads only the shown child's report on the dashboard", async () => {
  family.report = true;
  const asked: string[][] = [];
  progress.reads = asked;
  progress.value = new Map([["c1", { href: "/account/report/r1#rpt-progress", preview: {
    name: "Asha", today: 1, goal: 3, todayLabel: "", goalLabel: "", goalMonth: "September 2027", sentence: { lead: "We can help Asha reach a ", goal: "grade 3 level", by: "September 2027" },
    rows: [], books: [1], stages: [], steps: [{ title: "", text: "" }, { title: "8 pages a day, 5 days a week", text: "" }, { title: "", text: "" }], basis: "",
  } }]]);
  mayaNotice.books = [{ id: "w1", childId: "c1", number: 1, status: "shipped" }];
  let out: string;
  try {
    out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  } finally {
    mayaNotice.books = [];
  }
  // The loader is told to skip a child with a shipped workbook (the real one is never called for it).
  expect(asked.at(-1)).toEqual([]);
  expect(out).not.toContain("We can help");
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
  // Half an hour after Asha's test: her report is not late yet (#771).
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-19T04:59:00Z") });
  let out: string;
  try {
    out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ password: "1", pin: "1", existing: "1" }) })));
  } finally {
    vi.useRealTimers();
  }
  await expect(out).toMatchFileSnapshot("./parent-home.golden.html");
  expect(out).toContain('href="/account/referrals">Family referrals</a>');
  expect(out).not.toContain("pd-");
  // #560: the Overview is never read or shown for this family.
  expect(overview.reads).toBe(0);
  expect(out).not.toContain("po-");
});

// #771: with no report an hour after the test, the line under the child says it is late, and asks the parent to write.
it("says the report is late on today's Parent home an hour after the test, with no report", async () => {
  const render = async (at: string) => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(at) });
    try {
      return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
    } finally {
      vi.useRealTimers();
    }
  };
  const onTime = await render("2026-10-19T05:29:00Z");
  expect(onTime).toContain("Test done. The report comes by email.");
  const late = await render("2026-10-19T05:29:01Z");
  expect(late).toContain("Test done. Asha&#x27;s new result is taking longer than it should.");
  expect(late).not.toContain("The report comes by email");
});

describe("a family the switch opens to", () => {
  const view = (id: string, firstName: string): ChildView => ({ id, firstName, schoolGrade: 3, stage: "test_running", opensOn: "continue_or_wait", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], finishedTests: [] });
  const open = async (query: Record<string, string> = {}) => {
    dashboard.value = { children: [view("z-old", "Sam"), view("c1", "Asha")], remembered: null, pinSet: true, timeZoneSaved: true };
    return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve(query) })));
  };
  beforeEach(() => { family.olderChild = true; });

  // #709: with the switch on, a stopped plan keeps this home; it still says why, in both of its views.
  it("tells a stopped family why, with the dashboard open, on the test-start view and the overview", async () => {
    try {
      planNote.closed = { reason: "payment_failed", child: "Asha" };
      expect(await open()).toContain("Your plan is closed, on home, dashboard open");
      dashboard.value = { children: [{ ...view("c1", "Asha"), opensOn: "overview" }], remembered: null, pinSet: true, timeZoneSaved: true };
      expect(renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })))).toContain("Your plan is closed, on home, dashboard open");
      planNote.closed = null;
      expect(await open()).not.toContain("Your plan is closed");
    } finally { planNote.closed = null; dashboard.value = null; }
  });

  // #529: the notice card is for a family with Maya open, no agreement and a desk to open.
  it("shows the Maya notice card only when it is due and a child has a workbook, in both homes", async () => {
    const render = async () => renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
    const card = 'href="/account/maya-notice">Read the notice';
    try {
      mayaNotice.due = true;
      expect(await render()).not.toContain(card);
      mayaNotice.books = [{ id: "w1", childId: "c1", number: 1, status: "shipped" }];
      expect(await render()).toContain(card);
      mayaNotice.due = false;
      expect(await render()).not.toContain(card);
      mayaNotice.due = true;
      // The dashboard's test-start view returns early, so check it and the overview.
      dashboard.value = { children: [view("c1", "Asha")], remembered: null, pinSet: true, timeZoneSaved: true };
      expect(await render()).toContain(card);
      dashboard.value = { children: [{ ...view("c1", "Asha"), opensOn: "overview" }], remembered: null, pinSet: true, timeZoneSaved: true };
      expect(await render()).toContain(card);
    } finally {
      mayaNotice.due = false;
      mayaNotice.books = [];
      dashboard.value = null;
    }
  });

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

  it("moves chat usage and the note to the Maya tab and removes voice allowances from the home fallback", async () => {
    notes.latest.set("c1", {
      child_id: "c1", call_id: "latest-chat", channel: "chat", startedAt: "2026-11-08T01:00:00Z", call_ended_at: "2026-11-08T01:06:00Z",
      facts: { question: { source: "workbook", page: 23, number: 4, text: "27 + 39" }, minutes: 6, finished: "with_help", reason: "solved", help: "hint", stuckOn: null, paper: "unknown", safety: false },
      sentences: ["{child} called Maya about page 23, question 4.", "{child} finished it after a small hint."], warm: null,
    });
    chats.value.set("c1", { used: 7, left: 53, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
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
    expect(kept).toContain("Asha used 7 of 60 chat messages today. 53 left.");
    expect(kept).toContain('href="/account/notes/c1/latest-chat"');
    expect(kept).not.toMatch(/of 30 minutes|minutes left|minutes start again|Try Maya|Start call/i);
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
      expect(out).not.toContain("Start plan");
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

  describe("the Home (#560, #1003)", () => {
    const tabs = ["overview", "workbooks", "maya", "assessment", "account"] as const;
    const asha = (t: readonly (typeof tabs)[number][] = tabs) => ({ ...view("c1", "Asha"), stage: "active" as const, opensOn: "overview" as const, tabs: [...t], currentWorkbook: { number: 2 } });
    type Home = import("@/lib/parent-view").OverviewView;
    const full = (t?: readonly (typeof tabs)[number][]): Home => ({
      child: asha(t),
      resultPreparing: false,
      resultLate: false,
      week: [{ label: "Mon", state: "done" }, { label: "Tue", state: "done" }, { label: "Wed", state: "done" }, { label: "Thu", state: "today" }, { label: "Fri", state: "open" }],
      workbook: { number: 2, day: 4, days: 10, percent: 38, today: { label: "Today", topic: "Hundreds, tens and ones", scanned: 6, pages: 8 } },
      onTheWay: null,
      scanPrompt: null,
      skills: {
        mastered: [{ code: "2.4", name: "Multiplying by 10 and 100", masteredOn: "Thursday", sentence: "Mastered Thursday" }, { code: "2.1", name: "Even and odd", masteredOn: "Oct 20", sentence: "Mastered Oct 20" }],
        learning: [{ code: "2.5", name: "Rounding to the nearest hundred", masteredOn: null, sentence: "Getting steadier: right the last 3 times" }],
        needsHelp: [{ code: "2.3", name: "Value of each digit", masteredOn: null, sentence: "Forgets to carry when adding. Back in the next workbook." }, { code: "2.7", name: "Subtracting across a zero", masteredOn: null, sentence: null }],
      },
      weekLine: null,
      highlights: [],
      summaryMonth: null,
    });
    const render = async (value: Home | null, t?: readonly (typeof tabs)[number][]) => {
      dashboard.value = { children: [view("z-old", "Sam"), asha(t)], remembered: null, pinSet: true, timeZoneSaved: true };
      overview.value = value;
      return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })));
    };

    it("shows this week, the workbook card and the skills since the child started, naming the child once, as the first line with the desk beside it and no label above it (#1024)", async () => {
      const out = await render(full());
      expect(out).toContain('<div class="pd-name-row"><h1>Asha</h1><form class="pd-desk-form" action="/api/desk/open" method="post"><input type="hidden" name="child" value="c1"/>');
      expect(out.match(/<h1/g)).toHaveLength(1);
      expect(out).not.toContain('class="eyebrow"');
      for (const [i, word] of ["Mon: done", "Tue: done", "Wed: done", "Thu: today, not done yet", "Fri: coming up"].entries()) expect(out.split('class="pa-vh"')[i + 1]).toContain(word);
      expect(out).toContain("Workbook 2</p>");
      expect(out).toMatch(/Day 4<small> of 10<\/small>/);
      expect(out).toContain("38% of Workbook 2&#x27;s pages scanned");
      expect(out).toContain("Hundreds, tens and ones");
      expect(out).toContain("6 of 8 scanned");
      expect(out).toContain("Since Asha started");
      // The three counts, each number once, on its own button; the list opens on Needs help.
      expect(out).toMatch(/<b>2<\/b><span>Mastered<\/span>/);
      expect(out).toMatch(/<b>1<\/b><span>Learning<\/span>/);
      expect(out).toMatch(/<b>2<\/b><span>Needs help<\/span>/);
      expect(out).toContain("Needs help with");
      expect(out).toContain("Subtracting across a zero");
      // One short line under a skill that has a sentence (#989), and nothing under one that has none: no filler, no icon beside it.
      expect(out).toContain("<small>Forgets to carry when adding. Back in the next workbook.</small>");
      expect(out).toContain("Subtracting across a zero</b></span></li>");
      expect(out).not.toMatch(/\b(?:she|her|hers|he|his|him)\b/i);
      expect(out).not.toMatch(/streak|wrong|other children|percent right/i);
    });

    it("has none of the old Overview: no level, area bars, Maya tile, action card, monthly PDF row, goal sentence, test or desk row", async () => {
      const out = await render({ ...full(), summaryMonth: "2026-10" });
      for (const gone of ["Level by area", "Working at", "po-bar", "po-maya", "Notes from Maya", "po-action", "Tell us how", "po-summary", "Monthly summary", "We can help", "pd-test", "On the desk"]) expect(out).not.toContain(gone);
    });

    it("links the Today row to the Workbooks page at today's day (#1031), and leaves no link once the book's last day has passed", async () => {
      const out = await render(full());
      expect(out).toContain('<a class="po-today" href="/account/workbooks/c1?day=4#day-4">');
      expect(out.match(/Hundreds, tens and ones[^]*6 of 8 scanned[^]*<\/a>/)).not.toBeNull();
      expect(await render({ ...full(), workbook: { ...full().workbook!, day: 10, today: null } })).not.toContain("/account/workbooks/c1?day=");
    });

    it("rings today when all of today's pages are scanned, as the circle says", async () => {
      const value = full();
      const out = await render({ ...value, week: value.week!.map((d) => (d.label === "Thu" ? { ...d, state: "today_done" as const } : d)) });
      expect(out).toContain('class="po-day is-today_done"');
      expect(out).toContain("Thu: today, done");
    });

    it("the week line is plain text with a bold lead under the workbook card, and Highlights is one card at the bottom, one blue dot a sentence (#990)", async () => {
      const out = await render({ ...full(), weekLine: { lead: "On track this week.", text: "3 days done, and 3 new skills mastered since Monday." }, highlights: ["Asha mastered even and odd this week.", "Asha has done 3 days in a row."] });
      expect(out).toContain('<p class="po-line"><b>On track this week.</b> 3 days done, and 3 new skills mastered since Monday.</p>');
      expect(out.indexOf("po-book")).toBeLessThan(out.indexOf("po-line"));
      expect(out).toContain('<div class="pa-sh"><h2>Highlights</h2></div>');
      expect(out.match(/class="po-hl-dot"/g)).toHaveLength(2);
      expect(out).toContain("Asha mastered even and odd this week.");
      // After the skills list, so it is the last part of the Home.
      expect(out.indexOf("po-skill-list")).toBeLessThan(out.indexOf("Highlights"));
      // No icon, pill or extra section beside them.
      const hl = out.slice(out.indexOf('class="pa-card po-hl"'));
      expect(hl).not.toMatch(/<svg|pa-tag|pill|badge/);
    });

    it("with nothing to say there is no line and no Highlights section", async () => {
      const out = await render(full());
      expect(out).not.toContain("po-line");
      expect(out).not.toContain("Highlights");
    });

    it("Highlights still show when the skills cannot be read", async () => {
      const out = await render({ ...full(), skills: null, highlights: ["Asha has done 3 days in a row."] });
      expect(out).toContain("Highlights");
      expect(out).not.toContain("Since Asha started");
    });

    it("before the first scan: no ring, and one prompt to scan the first pages, with the Scan button", async () => {
      const value = full();
      const out = await render({ ...value, workbook: { ...value.workbook!, percent: null, today: { ...value.workbook!.today!, scanned: 0 } }, scanPrompt: { day: 1, pages: 8 }, skills: null });
      expect(out).not.toContain("po-ring");
      expect(out).toContain("Scan the first pages when they&#x27;re done");
      expect(out).toContain("Day 1 has 8 pages. Any order is fine.");
      expect(out).toContain('class="pa-scanbtn" href="/account/scan"');
      expect(await render(full())).not.toContain("Scan the first pages");
    });

    it("a part with no data does not appear", async () => {
      const out = await render({ ...full(), week: null, workbook: null, skills: null, scanPrompt: { day: 1, pages: 8 } });
      for (const absent of ["po-week", "po-book", "Skills", "po-side"]) expect(out).not.toContain(absent);
      expect(out).toContain('<div class="pd-name-row"><h1>Asha</h1>');
      expect(out).toContain("Scan the first pages");
      expect(out).not.toContain('id="pd-test"');
    });

    it("never renders empty: with no week, workbook, scan prompt or skills it keeps the old rows (test, desk, Maya, scan link)", async () => {
      scanning.enabled = true;
      chats.value.set("c1", { used: 7, left: 53, backAt: "midnight on November 9", resetsAt: Date.parse("2026-11-09T07:00:00Z") });
      mayaNotice.books = [{ id: "w1", childId: "c1", number: 1, status: "shipped" }];
      try {
        const out = await render({ ...full(), week: null, workbook: null, scanPrompt: null, skills: null }, ["overview", "workbooks", "assessment", "account"]);
        // The desk is on the name line here too, the one place the frame's header leaves its own out for (overviewDesk).
        expect(out).toContain('<div class="pd-name-row"><h1>Asha</h1><form class="pd-desk-form" action="/api/desk/open"');
        expect(out.match(/action="\/api\/desk\/open"/g)).toHaveLength(1);
        expect(out).toContain('id="pd-test"');
        expect(out).toContain("On the desk");
        expect(out).toContain("Asha used 7 of 60 chat messages today.");
        expect(out).toContain('href="/account/scan"');
        expect(out).not.toContain("po-week");
      } finally { mayaNotice.books = []; }
    });

    it("says the next workbook is on its way, above the week, and again when it is the only thing to say", async () => {
      const out = await render({ ...full(), onTheWay: 3 });
      expect(out).toContain('<p class="po-way">Workbook 3 is on its way</p>');
      expect(out.indexOf("po-way")).toBeLessThan(out.indexOf("po-week"));
      expect(await render(full())).not.toContain("is on its way");
      const only = await render({ ...full(), week: null, workbook: null, skills: null, onTheWay: 1 });
      expect(only).toContain("Workbook 1 is on its way");
      expect(only).toContain('id="pd-test"');
    });

    it("the card after the book is over has no Today row and still shows the book and its percent", async () => {
      const value = full();
      const out = await render({ ...value, workbook: { ...value.workbook!, day: 10, percent: 90, today: null }, week: value.week!.map((d) => ({ ...d, state: "done" as const })) });
      expect(out).toContain("90% of Workbook 2&#x27;s pages scanned");
      expect(out).not.toContain("po-today");
      expect(out).not.toContain("is-today");
    });

    it("says a new result is being prepared, and keeps the rest of the Home", async () => {
      const out = await render({ ...full(), resultPreparing: true });
      expect(out).toContain("Asha&#x27;s new result is being prepared.");
      expect(out).toContain("po-week");
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
      expect(await render(full())).not.toContain("being prepared");
    });

    it("asks the parent to email us when the new result is late, once", async () => {
      const out = await render({ ...full(), workbook: null, resultPreparing: true, resultLate: true });
      expect(out.match(/taking longer than it should/g)).toHaveLength(1);
      expect(out).toContain('class="po-preparing">Asha&#x27;s new result is taking longer than it should.');
      expect(out).toContain("mailto:");
      expect(out).not.toContain("being prepared");
    });

    it("keeps the test row when the Overview cannot be read, so the page is never empty", async () => {
      const out = await render(null);
      expect(out).toContain('<div class="pd-name-row"><h1>Asha</h1><form class="pd-desk-form" action="/api/desk/open"');
      expect(out).toContain('id="pd-test"');
    });

    it("shows nothing of the Home for another child than the one read", async () => {
      expect(await render({ ...full(), child: { ...asha(), id: "z-old" } })).not.toContain("po-");
    });
  });
});

it("tells a closed family why the product is closed; a family with no plan reads the page as before, in the golden file above", async () => {
  planNote.closed = { reason: "ended", child: "Leah" };
  const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })));
  planNote.closed = null;
  expect(out).toContain("Your plan is closed, on home");
});

it("shows a v2 retake on Parent home after a workbook has shipped", async () => {
  family.report = true;
  family.reportVersion = 2;
  mayaNotice.books = [{ id: "w1", childId: "c1", number: 1, status: "shipped" }];
  progress.value = new Map([["c1", { href: "/account/report/r1", placement: "Asha answered many questions very quickly, so please have Asha take the test again." }]]);
  try {
    const page = await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
    const out = renderToStaticMarkup(createElement("div", null, page));
    expect(out).toContain("please have Asha take the test again.");
    expect(out).toContain('href="/account/report/r1"');
    expect(out).not.toContain("We can help");
  } finally {
    mayaNotice.books = [];
  }
});
