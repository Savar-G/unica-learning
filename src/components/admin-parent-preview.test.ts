// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderParentPreview } from "@/components/admin-parent-preview";
import { PARENT_PREVIEW_VIEWS, SAMPLE_PLANS, SAMPLE_STAGE_FACTS, previewSelection, previewUrl, sampleChildren } from "@/lib/admin-parent-dashboard";
import { sampleReportView } from "@/lib/sample-children";
import { STATE_ORDER } from "@/lib/skill-state-words";
import { childStage } from "@/lib/child-stage";
import { readOnlyPreviewMarkup, parentPreviewDocument } from "@/lib/admin-parent-preview-document";

const calls = vi.hoisted(() => ({ client: vi.fn(() => { throw new Error("No provider may be opened"); }), track: vi.fn(), fetch: vi.fn(() => { throw new Error("No network may be used"); }) }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: calls.client }));
vi.mock("@/lib/track", () => ({ track: calls.track }));
const styles = { origin: "https://unicalearning.com", links: [], inline: [] };
const rendered = (view: string, scenario: string, family = "one", size = "desktop") => renderParentPreview(previewSelection({ view, scenario, family, size }), styles);
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");

it("shows the real Schedule table on both sizes with each child's rows and honest unknown or waiting states", () => {
  for (const size of ["desktop", "phone"]) {
    const selection = previewSelection({ view: "schedule", scenario: "partial", family: "two", child: "second", size });
    const output = dom(renderParentPreview(selection, styles));
    expect(output.querySelector("h1")?.textContent).toBe("Kai's schedule");
    expect(output.querySelectorAll(".ps-table tbody tr")).toHaveLength(10);
    expect(output.querySelector(".ps-table")?.textContent).toContain("Multiplication");
    expect(output.querySelector(".ps-table")?.textContent).toContain("3 of 8 accepted");
  }
  expect(rendered("schedule", "unknown")).toContain("Scan status unavailable");
  expect(rendered("schedule", "waiting")).toContain("No printed workbook yet");
  expect(rendered("schedule", "expired")).toContain("8 of 8 accepted");
  expect(rendered("schedule", "unavailable")).not.toContain("ps-table");
});

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", calls.fetch); });
afterEach(() => vi.unstubAllGlobals());

it("covers each product stage through the actual rule and each plan through a rendered PlanText", () => {
  const seen = new Set<string>(PARENT_PREVIEW_VIEWS.flatMap(view => view.scenarios.map(s => s.stage)));
  for (const [stage, facts] of Object.entries(SAMPLE_STAGE_FACTS)) {
    expect(seen.has(stage)).toBe(true);
    expect(childStage(facts, { progress: true, maya: true, scanPages: true }).stage).toBe(stage);
  }
  for (const plan of Object.values(SAMPLE_PLANS)) {
    const selection = previewSelection({ view: "plan", scenario: plan.kind });
    expect(selection.scenario).toBe(plan.kind);
    const output = dom(renderParentPreview(selection, styles));
    expect(output.querySelector(".acct-plan b")?.textContent).toBe("Leah");
    expect(output.querySelector(".acct-plan p")?.textContent?.length).toBeGreaterThan(10);
  }
});

it.each(PARENT_PREVIEW_VIEWS.flatMap(view => view.scenarios.map(s => ({ view: view.id, scenario: s.id }))))("renders $view / $scenario with no mounted effects, active links, forms, writes or providers", ({ view, scenario }) => {
  // The old live parent controls would fail this test when mounted. Only static HTML enters the frame.
  const output = dom(rendered(view, scenario));
  expect(output.querySelector("h1")?.textContent?.length).toBeGreaterThan(0);
  expect(output.querySelector(view === "feedback" && scenario === "admin_rows" ? '.adm-root[data-look="warm"]' : '.pd-shell[data-look="warm"]')).not.toBeNull();
  expect(output.querySelector("script, form, iframe, object, embed, base, [href], [src]:not([src=\"/desk/maya.webp\"]), [action], [formaction], [onclick], [download], [contenteditable]")).toBeNull();
  for (const control of output.querySelectorAll("button, input, select, textarea")) {
    expect(control.hasAttribute("disabled")).toBe(true);
    control.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    control.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
  for (const link of output.querySelectorAll('a[role="link"]')) {
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("0");
    link.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }
  expect(calls.client).not.toHaveBeenCalled();
  expect(calls.fetch).not.toHaveBeenCalled();
  expect(calls.track).not.toHaveBeenCalled();
  expect(output.querySelector("[inert]")).toBeNull();
});

it("renders the actual confirmation, late mailing, paid restart, decline and scan-result words", () => {
  const text = (view: string, scenario: string) => dom(rendered(view, scenario)).body.textContent;
  expect(text("plan", "pause_review")).toContain("6 weeks remain in 2026");
  expect(text("plan", "pause_late")).toContain("applies from workbook 5");
  expect(text("plan", "restart_review")).toContain("We charge CAD 79.99 immediately");
  expect(text("plan", "cancel_review")).toContain("Yes, cancel plan");
  expect(text("plan", "cancel_pending")).toContain("We could not confirm cancellation");
  expect(text("plan", "pause_saved")).toContain("The pause is saved");
  expect(text("plan", "restart_started")).toContain("The paid plan has restarted");
  const map = dom(rendered("progress", "map"));
  for (const state of STATE_ORDER) expect(map.querySelector(`.pp-tile.is-${state}`)).not.toBeNull();
  expect(text("plan", "restart_declined")).toContain("Your payment did not go through");
  expect(text("scan_results", "uncertain")).toContain("Please check this answer");
  expect(text("scan_results", "unscored")).toContain("Not scored");
  expect(text("scan_results", "expired")).toContain("Photo no longer available");
  expect(text("scan_results", "budget")).toContain("We cannot check more pages right now");
  expect(text("progress", "panel")).toContain("Skills inside this one");
  expect(text("report", "unreliable")).toContain("Start a new test");
  expect(text("report", "waitlist")).toContain("Join the waitlist");
  expect(text("report", "waitlist")).not.toContain("BC topics");
  expect(text("report", "choose")).toContain("Start free month");
  const areas = dom(rendered("report", "choose")).querySelectorAll(".rpt-areas tbody tr");
  const strands = sampleReportView().model.strands;
  expect(areas).toHaveLength(strands.length);
  for (const [index, strand] of strands.entries()) {
    expect(areas[index].textContent).toContain(strand.name);
    expect(areas[index].querySelector(".rpt-count")?.textContent).toBe(`${strand.correct} of ${strand.total}`);
  }
});

it("preserves empty families, child selection, long names and URL round trips without account links", () => {
  for (const family of ["none", "one", "two", "long"]) {
    const selection = previewSelection({ view: "account", family, size: "phone", child: "second" });
    expect(previewSelection(Object.fromEntries(new URL(previewUrl(selection), styles.origin).searchParams))).toEqual(selection);
    const children = sampleChildren(selection);
    const output = dom(renderParentPreview(selection, styles));
    expect(output.querySelectorAll(".acd-child")).toHaveLength(children.length);
    if (family === "two") expect(output.querySelector(".pd-kid b")?.textContent).toBe("Kai");
    if (family === "long") expect(output.body.textContent).toContain("Alexandria Rose Montgomery");
    if (family === "none") expect(output.body.textContent).toContain("Add another child");
    expect(output.querySelector('a[href^="/account"], a[href^="/api"]')).toBeNull();
  }
});

it.each(["pause_review", "restart_review", "cancel_review"].flatMap(scenario => ["first", "second"].map(child => ({ scenario, child }))))("uses each plan row's child for $scenario with $child selected", ({ scenario, child }) => {
  const output = dom(renderParentPreview(previewSelection({ view: "plan", scenario, family: "two", child }), styles));
  const rows = [...output.querySelectorAll(".acct-plan")];
  expect(rows).toHaveLength(2);
  const action = scenario === "cancel_review" ? "Cancel" : scenario === "restart_review" ? "Restart" : "Pause";
  for (const [index, name] of ["Leah", "Kai"].entries()) {
    expect(rows[index].textContent).toContain(`${action} ${name}'s plan`);
    expect(rows[index].textContent).not.toContain(`${action} ${index === 0 ? "Kai" : "Leah"}'s plan`);
  }
});

it.each(PARENT_PREVIEW_VIEWS.find(view => view.id === "scan")!.scenarios.flatMap(scenario => ["first", "second"].map(child => ({ scenario: scenario.id, child }))))("selects the same child in the shell and Scan view for $scenario / $child", ({ scenario, child }) => {
  const output = dom(renderParentPreview(previewSelection({ view: "scan", scenario, family: "two", child }), styles));
  const name = child === "second" ? "Kai" : "Leah";
  expect(output.querySelector(".pd-kid b")?.textContent).toBe(name);
  expect(output.querySelector(".scan-child option[selected]")?.textContent).toBe(name);
  expect(output.querySelectorAll(".scan-child option")).toHaveLength(2);
});

it("fails safely on arbitrary, duplicate and cross-view query values", () => {
  const fallback = previewSelection({});
  for (const value of ["__proto__", "constructor", "/account", "javascript:alert(1)", ["paying", "ended"]]) {
    expect(previewSelection({ view: value, scenario: value, family: value, size: value, child: value })).toEqual(fallback);
  }
  expect(previewSelection({ view: "maya", scenario: "pause_review" }).scenario).toBe("notes");
});

it("removes active HTML even if a future component adds it and restricts style sources", () => {
  const html = readOnlyPreviewMarkup('<form action="/api/account/family/delete"><input value="Leah" formaction="/api/account/card"><button onclick="fetch(1)">Send</button></form><a href="/account" target="_top" ping="/api/visit">Account</a><script>fetch(1)</script><img src="/api/account/scans/photo/image" onerror="fetch(1)"><iframe src="/account"></iframe><meta http-equiv="refresh" content="0;url=/account"><div style="background:url(/api/account/scans/image)">Keep this text</div>');
  const output = dom(html);
  expect(output.querySelector("form, [href], [src], [action], [formaction], [onclick], [onerror], [ping], iframe, script, meta")).toBeNull();
  expect(output.body.textContent).toContain("Keep this text");
  expect(output.querySelector("input")?.getAttribute("value")).toBe("Leah");
  const documentHtml = parentPreviewDocument(html, { ...styles, className: "fonts", links: ["/_next/static/css/app.css", "/api/account/scan-link", "https://other.invalid/a.css"], inline: [] });
  const doc = dom(documentHtml.replace(/<link[^>]+>/g, ""));
  expect((documentHtml.match(/<link /g) ?? [])).toHaveLength(1);
  expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain("connect-src 'none'");
  expect(doc.documentElement.className).toBe("fonts");
});


it("keeps parent PDFs out of Workbooks previews and shows the real answer-only component for each key scenario", () => {
  const listing = dom(rendered("workbooks", "delivered"));
  expect(listing.body.textContent).toContain("Answer keys");
  expect(listing.body.textContent).not.toMatch(/Download PDF|Print a page again/);
  const full = dom(rendered("workbook_answers", "complete"));
  expect(full.querySelectorAll(".pw-answers > li")).toHaveLength(8);
  expect(full.body.textContent).toContain("425");
  expect(full.body.textContent).not.toContain("268");
  const mixed = dom(rendered("workbook_answers", "mixed"));
  expect(mixed.body.textContent).toContain("Example answers");
  expect(mixed.body.textContent).toContain("There is no single fixed answer");
  expect(mixed.body.textContent).toContain("The answer is not available");
});


it("renders Feedback and its frame entry for every parent stage and a family with no children", () => {
  for (const stage of Object.keys(SAMPLE_STAGE_FACTS)) {
    const output = dom(rendered("feedback", `stage_${stage}`));
    expect(output.querySelector("h1")?.textContent).toBe("Feedback");
    expect(output.querySelectorAll("select,textarea")).toHaveLength(2);
    expect(output.querySelector(".pd-top-feedback")?.textContent).toBe("Feedback");
  }
  const empty = dom(rendered("feedback", "form", "none"));
  expect(empty.querySelector("h1")?.textContent).toBe("Feedback");
  expect(empty.querySelector("textarea")).not.toBeNull();
});
