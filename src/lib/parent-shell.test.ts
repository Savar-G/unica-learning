import { describe, expect, it } from "vitest";
import type { ChildTab } from "@/lib/child-stage";
import { notesPath } from "@/lib/parent-maya-notes";
import { reportPath } from "@/lib/report-view";
import type { ChildView } from "@/lib/parent-view";
import { activeTab, addressChild, lastChildCookie, phoneNav, pickChild, tabLinks, workbooksPath, type TabLink } from "@/lib/parent-shell";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const child = (id: string, over: Partial<ChildView> = {}): ChildView => ({
  id, firstName: id, schoolGrade: 3, stage: "no_test", opensOn: "start_test", tabs: ["assessment", "account"], readOnly: false, currentWorkbook: null, reportIds: [], ...over,
});
const leah = child("leah", { reportIds: ["r2", "r1"] });
const omar = child("omar");
const tabsOf = (links: TabLink[]) => links.map((l) => l.tab);

describe("the last child viewed", () => {
  it("opens on the last child viewed", () => {
    expect(pickChild([leah, omar], null, "omar")?.id).toBe("omar");
  });
  it("lets the address win over the remembered child", () => {
    expect(pickChild([leah, omar], "leah", "omar")?.id).toBe("leah");
  });
  it.each([[null, null], ["another-family", null], [null, "another-family"], ["another-family", "also-not-ours"]])("ignores an id that is not this family's and opens on the oldest child: %s, %s", (url, remembered) => {
    expect(pickChild([leah, omar], url, remembered)?.id).toBe("leah");
  });
  it("has no child for a family with no children", () => {
    expect(pickChild([], "leah", "leah")).toBeNull();
  });
  it("finds the child in the address of each child's page", () => {
    expect(addressChild("/account", "omar", [leah, omar])).toBe("omar");
    expect(addressChild("/account/notes/omar", null, [leah, omar])).toBe("omar");
    expect(addressChild("/account/notes/omar/call-1", null, [leah, omar])).toBe("omar");
    expect(addressChild("/account/learning/omar", null, [leah, omar])).toBe("omar");
    expect(addressChild("/account/workbooks/omar", null, [leah, omar])).toBe("omar");
    expect(addressChild("/account/report/r1", null, [leah, omar])).toBe("leah");
    expect(addressChild("/account/report/unknown", null, [leah, omar])).toBeNull();
    expect(addressChild("/account/plan", "omar", [leah, omar])).toBeNull();
  });
  it("keeps the remembered child only as an id, for the account pages", () => {
    const cookie = lastChildCookie("omar", true);
    expect(cookie).toContain("=omar;");
    expect(cookie).toContain("Path=/account");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(lastChildCookie("omar", false)).not.toContain("Secure");
  });
});

describe("tabs by stage", () => {
  it("links each pre-trial tab to a page that exists", () => {
    const links = tabLinks(leah);
    expect(tabsOf(links)).toEqual(["assessment", "account"]);
    expect(links[0].href).toBe(reportPath("r2"));
    expect(links[1].href).toBe("/account/settings");
  });
  it("sends Assessment to the child's own home before the first report", () => {
    expect(tabLinks(omar)[0].href).toBe("/account?child=omar");
  });
  it("leaves out a tab with no page yet, even when the stage and its switch allow it", () => {
    const all: ChildTab[] = ["overview", "progress", "workbooks", "scan_pages", "maya", "assessment", "account"];
    const links = tabLinks(child("leah", { tabs: all }));
    expect(tabsOf(links)).toEqual(["overview", "workbooks", "scan_pages", "maya", "assessment", "account"]);
    expect(links.find((l) => l.tab === "maya")?.href).toBe(notesPath("leah"));
    expect(links.find((l) => l.tab === "scan_pages")?.href).toBe("/account/scan");
    expect(links.find((l) => l.tab === "overview")?.href).toBe("/account?child=leah");
  });
  it("links Workbooks to the child's own Workbooks page when the stage gives the tab", () => {
    const links = tabLinks(child("leah", { stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "workbooks", "assessment", "account"] }));
    expect(links.find((l) => l.tab === "workbooks")).toEqual({ tab: "workbooks", label: "Workbooks", href: workbooksPath("leah") });
    expect(workbooksPath("a b")).toBe("/account/workbooks/a%20b");
  });
  it("gives no Workbooks tab before the stage has one", () => {
    expect(tabsOf(tabLinks(leah))).not.toContain("workbooks");
  });
  it("gives a family with no children only Account", () => {
    expect(tabsOf(tabLinks(null))).toEqual(["account"]);
  });
  it("names no tab Companion calls", () => {
    expect(tabLinks(child("leah", { tabs: ["maya"] }))[0].label).toBe("Maya");
  });
});

describe("the current tab", () => {
  const full = tabLinks(child("leah", { tabs: ["overview", "workbooks", "scan_pages", "maya", "assessment", "account"] }));
  const pre = tabLinks(omar);
  it.each([
    ["/account", "overview"], ["/account/scan", "scan_pages"], ["/account/notes/leah", "maya"], ["/account/notes/leah/call", "maya"],
    ["/account/report/r1", "assessment"], ["/account/settings", "account"], ["/account/plan", "account"], ["/account/pin", "account"], ["/account/password", "account"], ["/account/learning/leah", "overview"],
    ["/account/workbooks/leah", "workbooks"],
  ] as const)("%s is %s", (path, tab) => {
    expect(activeTab(path, full)).toBe(tab);
  });
  it("shows Assessment on the home of a child with no Overview", () => {
    expect(activeTab("/account", pre)).toBe("assessment");
    expect(activeTab("/account/learning/omar", pre)).toBe("assessment");
  });
  it("marks no tab when the page's tab is not shown", () => {
    expect(activeTab("/account/notes/omar", pre)).toBeNull();
    expect(activeTab("/account/workbooks/omar", pre)).toBeNull();
  });
});

describe("the phone layout (set 2, option A)", () => {
  const links = (...tabs: ChildTab[]): TabLink[] => tabs.map((tab) => ({ tab, label: tab, href: `/${tab}` }));
  it("has only a top bar when a child has only Assessment and Account", () => {
    expect(phoneNav(links("assessment", "account"))).toEqual({ kind: "top", links: links("assessment", "account") });
    expect(phoneNav(links("account")).kind).toBe("top");
  });
  it("has the decided bar and a More sheet when every tab is there", () => {
    const nav = phoneNav(links("overview", "progress", "workbooks", "scan_pages", "maya", "assessment", "account"));
    expect(nav.kind).toBe("bar");
    if (nav.kind !== "bar") return;
    expect(tabsOf(nav.bar)).toEqual(["overview", "progress", "scan_pages", "workbooks"]);
    expect(tabsOf(nav.more)).toEqual(["maya", "assessment", "account"]);
  });
  it("has no More with five tabs or fewer", () => {
    for (const tabs of [["overview", "assessment", "account"], ["overview", "scan_pages", "maya", "assessment", "account"]] as ChildTab[][]) {
      const nav = phoneNav(links(...tabs));
      expect(nav).toEqual({ kind: "bar", bar: links(...tabs), more: [] });
    }
  });
});
