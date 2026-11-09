import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Account from "./page";
import StartScreen from "../start/[child]/page";
import type { ParentNote } from "@/lib/parent-maya-notes";
import type { ChildView } from "@/lib/parent-view";
import { parentMinutes } from "@/lib/maya-minutes-server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account", useRouter: () => ({}), redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const minutes = vi.hoisted(() => ({ value: new Map<string, import("@/lib/maya-minutes-server").ChildMinutes>() }));
vi.mock("@/lib/maya-minutes-server", () => ({ parentMinutes: vi.fn(async () => minutes.value) }));
const chats = vi.hoisted(() => ({ value: new Map<string, import("@/lib/maya-chat").ChatUsage>() }));
vi.mock("@/lib/maya-chat-server", () => ({ parentChatUsage: async () => chats.value }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => false }));
const mayaNotice = vi.hoisted(() => ({ due: false, books: [] as { id: string; childId: string; number: number; status: string }[] }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async (child: string) => mayaNotice.books.filter((b) => b.childId === child) }) }));
vi.mock("@/lib/maya-notice-server", () => ({ mayaNoticeDueForFamily: async () => mayaNotice.due }));
const planNote = vi.hoisted(() => ({ closed: null as null | { reason: string; child: string | null } }));
vi.mock("@/components/plan-closed-note", () => ({ planClosedFamily: async () => planNote.closed, PlanClosedNote: ({ on }: { on: string }) => `Your plan is closed, on ${on}` }));
const scanning = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => scanning.enabled }));
const notes = vi.hoisted(() => ({ latest: new Map<string, ParentNote>() }));
vi.mock("@/lib/parent-maya-notes", async (original) => ({ ...await original<typeof import("@/lib/parent-maya-notes")>(), latestParentMayaNotes: async () => notes.latest }));

const dashboard = vi.hoisted(() => ({ value: null as import("@/lib/parent-dashboard-server").ParentDashboard | null }));
const overview = vi.hoisted(() => ({ value: null as import("@/lib/parent-view").OverviewView | null, reads: 0 }));
vi.mock("@/lib/parent-dashboard-server", () => ({
  parentDashboard: async () => dashboard.value,
  dashboardOverview: async () => { overview.reads++; return overview.value; },
}));
const family = vi.hoisted(() => ({ postal: "V3S 1A1" as string | null, timeZone: null as string | null, olderChild: false, card: false, signedOut: false }));
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

beforeEach(() => { minutes.value = new Map(); chats.value = new Map(); dashboard.value = null; overview.value = null; overview.reads = 0; family.postal = "V3S 1A1"; family.timeZone = null; family.olderChild = false; family.card = false; family.signedOut = false; scanning.enabled = false; notes.latest = new Map(); });

it("a signed-out parent signs in and comes back to the child the link named (#563)", async () => {
  family.signedOut = true;
  await expect(Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })).rejects.toThrow("REDIRECT /sign-in?next=%2Faccount%3Fchild%3Dc1");
  await expect(Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/sign-in$/);
});

it("shows only the latest note and its links on the matching child's card, without an empty notes section", async () => {
  family.olderChild = true;
  minutes.value.set("c1", { used: 12, left: 18, backOn: "Monday, November 9" });
  minutes.value.set("z-old", { used: 30, left: 0, backOn: "Monday, November 9" });
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
  expect(parentMinutes).not.toHaveBeenCalled();
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
  // Half an hour after Asha's test: her report is not late yet (#771).
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-19T04:59:00Z") });
  let out: string;
  try {
    out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ password: "1", pin: "1", existing: "1" }) })));
  } finally {
    vi.useRealTimers();
  }
  await expect(out).toMatchFileSnapshot("./parent-home.golden.html");
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
    minutes.value = new Map([["c1", { used: 12, left: 18, backOn: "Monday, November 9" }]]);
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

  describe("the Overview (#560)", () => {
    const tabs = ["overview", "workbooks", "maya", "assessment", "account"] as const;
    const asha = (t: readonly (typeof tabs)[number][] = tabs) => ({ ...view("c1", "Asha"), stage: "active" as const, opensOn: "overview" as const, tabs: [...t], currentWorkbook: { number: 2 } });
    const full = (t?: readonly (typeof tabs)[number][]): import("@/lib/parent-view").OverviewView => ({
      child: asha(t),
      level: { working: 4, earlySign: true, testedOn: "2026-10-31", unreliable: false },
      areas: [
        { area: "number", name: "Number and operations", level: 3, label: "at-grade", earlySign: false },
        { area: "fractions", name: "Fractions and decimals", level: 2, label: "building-up", earlySign: true },
        { area: "shapes", name: "Shapes, measurement and data", level: 4, label: "ahead", earlySign: false },
      ],
      resultPreparing: false,
      resultLate: false,
      workbook: { number: 2, scannedDays: 3, days: 10 },
      action: "learning_card_empty",
      summaryMonth: null,
    });
    const render = async (value: import("@/lib/parent-view").OverviewView | null, t?: readonly (typeof tabs)[number][]) => {
      dashboard.value = { children: [view("z-old", "Sam"), asha(t)], remembered: null, pinSet: true, timeZoneSaved: true };
      overview.value = value;
      return renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })));
    };

    it("shows the tiles, the area bars and one thing to do, naming the child", async () => {
      minutes.value = new Map([["c1", { used: 12, left: 18, backOn: "Monday, November 9" }]]);
      const out = await render(full());
      expect(out).toContain("Working at Grade 4");
      expect(out).toContain("In Grade 3 at school.");
      expect(out).toContain("Early sign");
      expect(out).toContain("From the test on October 31.");
      expect(out).toContain("Workbook 2</p>");
      expect(out).toContain("3 of 10 days scanned");
      expect(out).toContain('href="/account/notes/c1">Notes from Maya');
      expect(out).not.toMatch(/of 30 minutes|minutes left|minutes start again|Try Maya|Start call/i);
      expect(out).toContain("Level by area");
      expect(out).toContain("The line marks Asha&#x27;s school grade, Grade 3.");
      for (const label of ["At grade", "Building up · Early sign", "Ahead"]) expect(out).toContain(label);
      expect(out.match(/class="po-card po-action/g)).toHaveLength(1);
      expect(out).toContain("Tell us how Asha learns");
      expect(out).toContain('href="/account/learning/c1"');
      expect(out).not.toMatch(/\b(?:she|her|hers|he|his|him)\b/i);
      expect(out).not.toMatch(/\d\s*%|streak|percent|wrong|other children/i);
    });

    it("a test the report calls unreliable: no bars, one sentence and the report's link in their place (D-258)", async () => {
      const out = await render({ ...full(), child: { ...asha(), reportIds: ["r2", "r1"] }, level: { ...full().level!, unreliable: true }, areas: [] });
      expect(out).toContain("Working at Grade 4");
      expect(out).toContain("Level by area");
      expect(out).toContain("The last test may not show Asha&#x27;s level reliably, so the report offers Asha a new test with new questions.");
      expect(out).toContain('href="/account/report/r2">See the report');
      expect(out).not.toContain("po-bar");
      expect(out).not.toContain("The line marks");
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
      expect(await render(full())).not.toContain("may not show");
    });

    it("links to saved notes only for a child with the Maya tab, without a voice allowance read", async () => {
      expect(await render(full())).toContain('id="po-maya"');
      const withoutMaya = tabs.filter((t) => t !== "maya");
      expect(await render(full(withoutMaya), withoutMaya)).not.toContain('id="po-maya"');
      expect(parentMinutes).not.toHaveBeenCalled();
    });

    it.each(["active", "first_book_coming", "ended"] as const)("keeps %s notes access independent of voice usage and chat release", async (stage) => {
      const hasMaya = stage !== "first_book_coming";
      const t = hasMaya ? tabs : tabs.filter(tab => tab !== "maya");
      const child = { ...asha(t), stage, readOnly: stage === "ended", currentWorkbook: hasMaya ? { number: 2 } : null };
      dashboard.value = { children: [view("z-old", "Sam"), child], remembered: null, pinSet: true, timeZoneSaved: true };
      overview.value = { ...full(t), child, workbook: null, level: null, areas: [], resultPreparing: stage === "active" };
      minutes.value.set("c1", { used: 30, left: 0, backOn: "Monday, November 9" });
      const out = renderToStaticMarkup(createElement("div", null, await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({ child: "c1" }) })));
      expect(out.includes('href="/account/notes/c1"')).toBe(hasMaya);
      expect(out).not.toMatch(/of 30 minutes|minutes left|minutes start again|Try Maya|Start (?:a )?call|chat messages today/i);
      expect(out).not.toContain("Sam");
      expect(out).not.toContain("/account/notes/z-old");
      if (stage === "active") expect(out).toContain("Asha&#x27;s new result is being prepared.");
      expect(parentMinutes).not.toHaveBeenCalled();
    });

    // #771 review: the Overview says the result is late, so the test's line under it does not say it again.
    it("says once that a late result is late: in the Overview, and the test's line only says the test is done", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-19T06:00:00Z") });
      let out: string;
      try {
        out = await render({ ...full(), level: null, areas: [], resultPreparing: true, resultLate: true });
      } finally {
        vi.useRealTimers();
      }
      expect(out.match(/taking longer than it should/g)).toHaveLength(1);
      expect(out).toContain('class="po-preparing">Asha&#x27;s new result is taking longer than it should.');
      expect(out).toContain('<span class="small acct-done">Test done. The next test opens at <time');
      expect(out).not.toContain("The report comes by email");
    });

    it("a tile or a section with no data does not appear, and no card shows when none applies", async () => {
      const withoutMaya = tabs.filter((t) => t !== "maya");
      const out = await render({ ...full(withoutMaya), level: null, areas: [], workbook: null, action: null }, withoutMaya);
      expect(out).not.toContain("po-tiles");
      expect(out).not.toContain("Level by area");
      expect(out).not.toContain("po-action");
      expect(out).not.toContain("days scanned");
    });

    it("offers the monthly summary PDF of the month the view names, and nothing without one (#562)", async () => {
      const out = await render({ ...full(), summaryMonth: "2026-10" });
      expect(out).toContain('id="po-summary"');
      expect(out).toContain("October 2026");
      expect(out).toContain('href="/api/account/children/c1/monthly-summary?month=2026-10"');
      expect(out).toContain("One page on Asha&#x27;s month");
      expect(out).not.toMatch(/\b(?:she|her|hers|he|his|him)\b/i);
      expect(await render(full())).not.toContain("po-summary");
    });

    it("asks the parent to email us when the new result is late", async () => {
      const out = await render({ ...full(), level: null, areas: [], workbook: null, resultPreparing: true, resultLate: true });
      expect(out).toContain("taking longer than it should");
      expect(out).toContain("mailto:");
      expect(out).not.toContain("being prepared");
    });

    it("says a new result is being prepared, with no Level tile and no bars", async () => {
      const out = await render({ ...full(), level: null, areas: [], workbook: null, resultPreparing: true });
      expect(out).toContain("Asha&#x27;s new result is being prepared.");
      expect(out).not.toContain("Working at");
      expect(out).not.toContain("Level by area");
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
      expect(await render(full())).not.toContain("being prepared");
    });

    it("the card for an open test uses the start control's words", async () => {
      const out = await render({ ...full(), action: "continue_test" });
      expect(out).toContain("Go to the test");
      expect(out).toContain('href="#pd-test"');
      expect(out).not.toContain("Start the test");
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
    });

    it.each([
      ["start_test", "Start the test", "#pd-test"],
      ["payment_failed", "The last payment for Asha&#x27;s plan did not go through.", "/account/plan"],
      ["no_pin", "Set a 4-digit PIN before Asha uses the desk.", "/account/pin"],
    ] as const)("the card for %s", async (action, text, href) => {
      const out = await render({ ...full(), action });
      expect(out).toContain(text);
      expect(out).toContain(`href="${href}"`);
      expect(out).not.toMatch(/\b(?:she|her)\b/i);
    });

    it("shows nothing of the Overview for another child than the one read", async () => {
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
