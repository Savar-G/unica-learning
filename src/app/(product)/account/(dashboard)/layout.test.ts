import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardLayout from "./layout";
import AccountSettings from "./settings/page";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import type { ChildView } from "@/lib/parent-view";

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({ path: "/account", query: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => nav.query,
  useRouter: () => ({}),
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));
const state = vi.hoisted(() => ({ dashboard: null as ParentDashboard | null, parent: "p1" as string | null, card: true }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => state.parent,
  sessionClient: async () => ({
    from: (table: string) => ({
      select: () => {
        const data = table === "card_setups" ? [{ card_saved_at: state.card ? "2026-11-01T00:00:00Z" : null }] : [{ province: "BC" }];
        const query = { order: () => query, then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data }) };
        return query;
      },
    }),
  }),
}));

const child = (over: Partial<ChildView> = {}): ChildView => ({ id: "c1", firstName: "Leah", schoolGrade: 3, stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], ...over });
const family = (over: Partial<ParentDashboard> = {}): ParentDashboard => ({ children: [child()], remembered: null, pinSet: true, timeZoneSaved: true, ...over });
const page = createElement("p", null, "the page");
const render = async () => renderToStaticMarkup(createElement("div", null, await DashboardLayout({ children: page })));

beforeEach(() => { state.dashboard = family(); state.parent = "p1"; state.card = true; nav.path = "/account"; nav.query = new URLSearchParams(); });

it("adds nothing around the page for a family the switch does not open to", async () => {
  state.dashboard = null;
  expect(await render()).toBe("<div><p>the page</p></div>");
});

it("shows the child, with no dropdown for one child, and no desk before the first shipped workbook", async () => {
  const out = await render();
  expect(out).toContain("Leah");
  expect(out).toContain("Grade 3");
  expect(out).not.toContain("<details");
  expect(out).not.toContain("/api/desk/open");
  expect(out).toContain("<p>the page</p>");
});

it("has a dropdown for two children, opens on the last child viewed, and links each child", async () => {
  state.dashboard = family({ children: [child(), child({ id: "c2", firstName: "Omar", schoolGrade: 0 })], remembered: "c2" });
  const out = await render();
  expect(out).toContain("<details");
  expect(out).toContain('href="/account?child=c1"');
  expect(out).toContain('href="/account?child=c2"');
  expect(out).toContain('aria-label="Omar. Change child"');
});

it("follows a page that belongs to one child, over the last child viewed", async () => {
  state.dashboard = family({ children: [child({ reportIds: ["r1"] }), child({ id: "c2", firstName: "Omar" })], remembered: "c2" });
  nav.path = "/account/report/r1";
  expect(await render()).toContain('aria-label="Leah. Change child"');
});

it("opens the desk from the first shipped workbook, as a form to the desk route, and asks for a PIN first", async () => {
  state.dashboard = family({ children: [child({ currentWorkbook: { number: 2 } })] });
  const open = await render();
  expect(open).toContain('action="/api/desk/open"');
  expect(open).toContain('name="child" value="c1"');
  expect(open).toContain("Workbook 2");
  state.dashboard = family({ children: [child({ currentWorkbook: { number: 2 } })], pinSet: false });
  const noPin = await render();
  expect(noPin).not.toContain("/api/desk/open");
  expect(noPin).toContain('href="/account/pin?desk=1"');
});

it("shows only tabs with a page, a top bar for Assessment and Account, and no bottom bar", async () => {
  const out = await render();
  expect(out).toContain('class="pd-top-links"');
  expect(out).not.toContain('class="pd-bar"');
  expect(out).not.toContain("Workbooks");
  expect(out).not.toContain("Progress");
});

it("has the bottom bar once the child has more tabs, and marks the current page", async () => {
  state.dashboard = family({ children: [child({ stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "workbooks", "assessment", "account"] })] });
  const out = await render();
  expect(out).toContain('class="pd-bar"');
  expect(out).not.toContain('class="pd-top-links"');
  expect(out).toContain('aria-current="page" href="/account?child=c1"');
  expect(out).not.toContain("Workbooks");
});

it("has the account page's links, add a child and sign out for a family the switch opens to", async () => {
  const out = renderToStaticMarkup(await AccountSettings());
  for (const text of ['href="/account/plan"', 'href="/account/password"', 'href="/account/pin"', "Add another child", "Sign out"]) expect(out).toContain(text);
  state.card = false;
  expect(renderToStaticMarkup(await AccountSettings())).not.toContain('href="/account/plan"');
});

it("sends everyone else away from the new account page", async () => {
  state.dashboard = null;
  await expect(AccountSettings()).rejects.toThrow("REDIRECT /account");
  state.parent = null;
  await expect(AccountSettings()).rejects.toThrow("REDIRECT /sign-in?next=/account/settings");
});
