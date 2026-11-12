import { describe, expect, it } from "vitest";
import { ADMIN_NAV, ADMIN_NAV_ITEMS, adminFolderOf, adminSectionForPath, isFolder } from "@/lib/admin-nav";

// The admin sidebar (D-313): its folders in the decided order, and which item every admin address highlights.

describe("the admin sidebar", () => {
  it("has the decided folders and items, in order", () => {
    expect(ADMIN_NAV.map((e) => (isFolder(e) ? [e.folder, e.items.map((i) => i.label)] : e.label))).toEqual([
      "Home",
      ["Families", ["Families", "Tests", "Feedback"]],
      ["Workbooks", ["Production", "Plans and delivery", "Marking"]],
      ["Maya", ["Calls"]],
      ["Marketing", ["Flyers", "Emails"]],
      ["Quality", ["Templates", "Skill map", "AI reviews", "AI usage"]],
      ["Team tools", ["Parent app preview", "Export"]],
    ]);
  });

  it("keeps every old address", () => {
    expect(ADMIN_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/admin", "/admin/parents", "/admin/tests", "/admin/feedback", "/admin/workbooks", "/admin/next-steps", "/admin/scans",
      "/admin/maya", "/admin/flyers", "/admin/emails", "/admin/templates", "/admin/skill-map", "/admin/reviews", "/admin/ai", "/admin/dashboard", "/admin/export",
    ]);
  });

  it("highlights each item on its own page", () => {
    for (const item of ADMIN_NAV_ITEMS) expect(adminSectionForPath(item.href)).toBe(item.key);
  });

  it.each([
    ["/admin/", "home"],
    ["/admin/activity", "home"],
    ["/admin/parents/0b6f0c6e-1111-4111-8111-111111111111", "families"],
    ["/admin/children", "families"],
    ["/admin/children/0b6f0c6e-1111-4111-8111-111111111111", "families"],
    ["/admin/children/0b6f0c6e-1111-4111-8111-111111111111/preview-plan", "families"],
    ["/admin/children/0b6f0c6e-1111-4111-8111-111111111111/profile", "families"],
    ["/admin/maya-chat", "families"],
    ["/admin/assessments/abc", "tests"],
    ["/admin/assessments/abc/profile", "tests"],
    ["/admin/reports/abc", "tests"],
    ["/admin/workbooks/abc", "production"],
    ["/admin/workbooks/runs/abc", "production"],
    ["/admin/scans/abc", "marking"],
    ["/admin/maya/abc", "calls"],
    ["/admin/emails/abc:report", "emails"],
    ["/admin/templates/add-within-10", "templates"],
    ["/admin/parent-dashboard", "preview"],
    ["/admin/dashboard?view=account", "preview"],
  ])("highlights the right item on %s", (path, key) => {
    expect(adminSectionForPath(path)).toBe(key);
  });

  it("highlights nothing outside the admin or on an unknown address", () => {
    for (const path of [null, "", "/", "/account", "/administer", "/admin/board", "/admin/constructor", "/admin/toString"]) expect(adminSectionForPath(path)).toBeNull();
  });

  it("names the folder of an item", () => {
    expect(adminFolderOf("home")).toBeNull();
    expect(adminFolderOf("marking")).toBe("Workbooks");
    expect(adminFolderOf("preview")).toBe("Team tools");
  });
});
