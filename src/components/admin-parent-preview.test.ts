// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderParentPreview } from "@/components/admin-parent-preview";
import { PARENT_PREVIEW_VIEWS, SAMPLE_PLANS, SAMPLE_STAGE_FACTS, previewSelection, previewUrl, sampleChildren } from "@/lib/admin-parent-dashboard";
import { sampleReportView } from "@/lib/sample-children";
import { childStage } from "@/lib/child-stage";
import { readOnlyPreviewMarkup, parentPreviewDocument } from "@/lib/admin-parent-preview-document";

const calls = vi.hoisted(() => ({ client: vi.fn(() => { throw new Error("No provider may be opened"); }), track: vi.fn(), fetch: vi.fn(() => { throw new Error("No network may be used"); }) }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: calls.client }));
vi.mock("@/lib/track", () => ({ track: calls.track }));
const styles = { origin: "https://unicalearning.com", links: [], inline: [] };
const rendered = (view: string, scenario: string, family = "one", size = "desktop") => renderParentPreview(previewSelection({ view, scenario, family, size }), styles);
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");

it.each(PARENT_PREVIEW_VIEWS.filter(view => view.id === "overview" || view.id === "maya")
  .flatMap(view => view.scenarios.flatMap(scenario => ["desktop", "phone"].map(size => ({ view: view.id, scenario: scenario.id, size })))))
  ("keeps the first-ship $view / $scenario / $size free of voice allowances and launch controls", ({ view, scenario, size }) => {
    for (const child of ["first", "second"]) {
      const output = dom(renderParentPreview(previewSelection({ view, scenario, family: "two", child, size }), styles));
      expect(output.body.textContent).not.toMatch(/of 30 minutes|minutes left|minutes start again|weekly minutes|Try Maya|Start (?:a )?call/i);
      // The week line and Highlights (#990) say "this week" on purpose: the guard reads the rest of the Home, and the two
      // parts are held to the allowance words alone.
      const home = output.querySelector(".po")?.cloneNode(true) as Element | undefined;
      const story = [...(home?.querySelectorAll(".po-line, .po-hl") ?? [])];
      story.forEach((part) => part.remove());
      expect(home?.textContent ?? "").not.toMatch(/minutes|messages|this week/i);
      expect(story.map((part) => part.textContent).join(" ")).not.toMatch(/minutes|messages/i);
      const name = child === "first" ? "Leah" : "Kai";
      if (view === "overview" && scenario === "active") {
        // Option A (#1003): the Home holds no Maya tile; the Maya tab holds the notes.
        expect(output.querySelector("#po-maya")).toBeNull();
        expect(output.querySelector(".po")?.textContent).not.toContain("Notes from Maya");
        expect(output.querySelector(".po")?.textContent).toContain("Since");
      }
      if (view === "maya" && scenario === "notes") {
        expect(output.body.textContent).toContain("Read the call");
        expect(output.body.textContent).toContain("Read the chat");
        expect(output.body.textContent).toContain(`${name} used 12 of 60 chat messages today.`);
      }
      if (view === "maya" && scenario === "used") expect(output.body.textContent).toContain(`${name} used all 60 chat messages today.`);
      if (view === "maya" && ["ended", "closed"].includes(scenario)) {
        expect(output.querySelector(".maya-tab-week")).toBeNull();
        expect(output.body.textContent).toContain("Read the call");
        expect(output.body.textContent).toContain("Read the chat");
      }
      if (view === "maya" && scenario === "session") expect(output.body.textContent).toContain("Call length5 minutes");
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(calls.client).not.toHaveBeenCalled();
      expect(calls.track).not.toHaveBeenCalled();
    }
  });

it.each(PARENT_PREVIEW_VIEWS.find(view => view.id === "overview")!.scenarios.map(scenario => scenario.id))
  ("keeps the Home's sentences true to the circles and skill counts of its own scenario (#990): %s", scenario => {
    for (const child of ["first", "second"]) {
      const out = dom(renderParentPreview(previewSelection({ view: "overview", scenario, family: "two", child, size: "desktop" }), styles));
      const line = out.querySelector(".po-line")?.textContent ?? "";
      const hl = [...out.querySelectorAll(".po-hl p")].map(p => p.textContent ?? "");
      const all = [line, ...hl].join(" ");
      const days = [...out.querySelectorAll(".po-day")].map(li => /is-(\w+)/.exec(li.className)![1]);
      const isDone = (state: string) => state === "done" || state === "today_done";
      const todayAt = days.findIndex(state => state.startsWith("today"));
      const counts = Object.fromEntries([...out.querySelectorAll(".po-count")].map(b => [b.querySelector("span")!.textContent!, Number(b.querySelector("b")!.textContent)]));
      const ended = sampleChildren(previewSelection({ view: "overview", scenario, family: "two", child })).at(child === "first" ? 0 : 1)!.stage === "ended";

      // The days done say the days the circles show done.
      const doneSaid = /(\d+) days? done/.exec(line);
      if (doneSaid) expect(Number(doneSaid[1])).toBe(days.filter(isDone).length);
      // "Day N is ready" names an open circle before today's.
      const ready = /Day (\d+) is ready/.exec(line);
      if (ready) { const at = Number(ready[1]) - 1; expect(days[at]).toBe("open"); expect(at).toBeLessThan(todayAt); }
      // A streak is the run of done circles ending at today's, and an ended plan has none and no line.
      const streak = /done (\d+) workbook days in a row/.exec(all);
      if (streak) {
        expect(ended).toBe(false);
        let run = 0;
        for (let i = days[todayAt] === "today_done" ? todayAt : todayAt - 1; i >= 0 && isDone(days[i]); i--) run++;
        expect(Number(streak[1])).toBe(run);
      }
      if (ended) { expect(line).toBe(""); expect(all).not.toMatch(/in a row/); }
      // "One to watch" only with a Needs help list; new skills only with Mastered skills, as many as the dated rows say.
      if (/one to watch/.test(all)) expect(counts["Needs help"]).toBeGreaterThan(0);
      const fromLine = /(\d+) new skills? mastered/.exec(line), fromHl = /mastered (\d+) skills|mastered (?!1 new)[^.]+ this week/.exec(hl.join(" "));
      const said = fromLine ? Number(fromLine[1]) : fromHl ? (fromHl[1] ? Number(fromHl[1]) : 1) : 0;
      expect(said).toBeLessThanOrEqual(counts["Mastered"] ?? 0);
      if (fromLine && fromHl) expect(Number(fromLine[1])).toBe(fromHl[1] ? Number(fromHl[1]) : 1);
      // When the Mastered list is the one shown, the rows dated this week are the new skills the sentences count.
      const thisWeek = [...out.querySelectorAll(".po-skill small")].filter(row => /Mastered (today|Monday|Tuesday|Wednesday|Thursday|Friday)/.test(row.textContent ?? "")).length;
      if ([...out.querySelectorAll(".pa-sh h2")].some(h => h.textContent === "Mastered")) expect(thisWeek).toBe(said);
      // Nothing to say, and a plan with nothing mastered, says nothing of the kind.
      if (scenario === "nothing_to_say") { expect(line).toBe(""); expect(hl).toEqual([]); }
    }
  });

it("shows the sentence under each skill, written by the real module from facts of its own scenario (#989)", () => {
  const rows = (scenario: string, child = "first") => [...dom(renderParentPreview(previewSelection({ view: "overview", scenario, family: "two", child, size: "desktop" }), styles)).querySelectorAll(".po-skill")]
    .map(row => [row.querySelector("b")?.textContent, row.querySelector("small")?.textContent ?? null]);
  // Needs help is the list that opens: a mistake in its reviewed parent words, and no next-workbook clause with no next workbook.
  expect(rows("active")).toEqual([
    ["Value of each digit in big numbers", "Mixes up which place each digit is in, such as tens and hundreds."],
    ["Subtracting across a zero", "Subtracts the wrong way across a zero."],
  ]);
  // With the next workbook in the mail, and only then, the sentence says what comes next.
  for (const scenario of ["book_2_mailed", "book_over"]) {
    for (const [, sentence] of rows(scenario)) expect(sentence).toMatch(/\. Back in the next workbook\.$/);
  }
  for (const scenario of ["active", "today_done", "behind", "ended"]) for (const [, sentence] of rows(scenario)) expect(sentence).not.toContain("next workbook");
  // No Needs help skill: the list that opens is Learning. One steady run, one recorded start; no percent and no count of wrong answers.
  expect(rows("nothing_to_say")).toEqual([
    ["Rounding to the nearest hundred", "Getting steadier: right the last 3 times"],
    ["Number patterns", "Started Tuesday"],
  ]);
  for (const scenario of ["active", "nothing_to_say", "book_2_mailed"]) expect(rows(scenario).map(([, s]) => s).join(" ")).not.toMatch(/%|percent|of the last/);
});

it("shows the real Workbooks tab for each book state on both sizes, with the Schedule folded in (#1031)", () => {
  for (const size of ["desktop", "phone"]) {
    const midway = dom(renderParentPreview(previewSelection({ view: "workbooks", scenario: "delivered", family: "two", child: "second", size }), styles));
    expect(midway.querySelector("h1")?.textContent).toBe("Kai's workbooks");
    expect(midway.querySelectorAll(".wd-row")).toHaveLength(10);
    expect(midway.querySelectorAll(".wd-row.is-ok")).toHaveLength(2);
    expect(midway.querySelector(".wb-cover")?.textContent).toContain("Day 3 of 10 · Adding with regrouping");
    // Day 3 is today, nothing of it scanned yet: the one orange row.
    expect(midway.querySelectorAll(".wb-scan")).toHaveLength(1);
    expect(midway.querySelector(".wb-scan")?.textContent).toContain("Day 3 still to scan");
    expect(midway.querySelector(".wb-scan")?.textContent).toContain("Pages 19–26");
  }
  expect(dom(rendered("workbooks", "partial_day")).querySelector(".wb-scan")?.textContent).toContain("Day 3 still to scan");
  expect(dom(rendered("workbooks", "partial_day")).querySelector(".wb-scan")?.textContent).toContain("Pages 22–26");
  expect(dom(rendered("workbooks", "not_started")).body.textContent).toContain("0 of 80 pages scanned");
  expect(dom(rendered("workbooks", "not_started")).querySelector(".wb-scan")?.textContent).toContain("Day 1 still to scan");
  const unknown = dom(rendered("workbooks", "scans_unknown"));
  expect(unknown.body.textContent).toContain("Scan status unavailable right now.");
  expect(unknown.querySelector(".wb-scan")).toBeNull();
  expect(unknown.querySelector(".wd-st")).toBeNull();
  const all = dom(rendered("workbooks", "all_scanned"));
  expect(all.querySelectorAll(".wd-row.is-ok")).toHaveLength(10);
  expect(all.body.textContent).toContain("80 of 80 pages scanned");
  expect(rendered("schedule", "partial")).not.toContain("ps-table");
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
  expect(text("plan", "restart_review")).toContain("We charge no more than CAD 79.99 immediately");
  expect(text("plan", "cancel_review")).toContain("Yes, cancel plan");
  expect(text("plan", "cancel_pending")).toContain("We could not confirm cancellation");
  expect(text("plan", "pause_saved")).toContain("The pause is saved");
  expect(text("plan", "restart_started")).toContain("The paid plan has restarted");
  const week = dom(rendered("progress", "week"));
  expect(week.querySelectorAll(".pp-tile")).toHaveLength(4);
  expect(week.body.textContent).toContain("Skills mastered over time");
  expect(text("plan", "restart_declined")).toContain("Your payment did not go through");
  expect(text("scan_results", "uncertain")).toContain("Our team is checking this answer.");
  expect(text("scan_results", "uncertain")).not.toContain("We cannot read this answer");
  expect(text("scan_results", "uncertain")).not.toMatch(/please check|check this answer/i);
  expect(text("scan_results", "pending")).toContain("Your page is not marked yet.");
  expect(text("scan_results", "unscored")).toContain("Not scored");
  expect(text("scan_results", "expired")).toContain("Photo no longer available");
  expect(text("scan_results", "budget")).toContain("We cannot check more pages right now");
  expect(text("progress", "empty")).toContain("Progress starts after the first marked pages");
  expect(text("report", "unreliable")).toContain("Start a new test");
  expect(text("report", "waitlist")).toContain("Join the waitlist");
  expect(text("report", "waitlist")).not.toContain("BC topics");
  expect(text("report", "choose")).toContain("Start plan");
  const areas = dom(rendered("report", "choose")).querySelectorAll(".rpt-areas tbody tr");
  const strands = sampleReportView().model.strands;
  expect(areas).toHaveLength(strands.length);
  for (const [index, strand] of strands.entries()) {
    expect(areas[index].textContent).toContain(strand.name);
    expect(areas[index].querySelector(".rpt-count")?.textContent).toBe(`${strand.correct} of ${strand.total}`);
  }
});

it("shows the Overview's first line as the child's name once, with the desk beside it and no eyebrow (#1024)", () => {
  const output = dom(rendered("overview", "active", "one", "phone"));
  const headings = [...output.querySelectorAll("h1")];
  expect(headings.map(h => h.textContent)).toEqual(["Leah"]);
  expect(headings[0].closest(".pd-name-row")?.querySelector('.pd-desk-form button')?.textContent).toContain("Open the desk");
  expect(output.querySelector(".support-page > .eyebrow")).toBeNull();
  expect(output.querySelector(".po-book .eyebrow")?.textContent).toBe("Workbook 3");
  expect(output.querySelector(".pd-top .pd-kid b")?.textContent).toBe("Leah");
});

it("draws the workbook ring filled to its percent, so the preview matches the page (#1024)", () => {
  const output = dom(rendered("overview", "active", "one", "phone"));
  const [track, fill] = [...output.querySelectorAll(".po-ring circle")];
  expect(track.getAttribute("stroke-dasharray")).toBeNull();
  const [drawn, whole] = (fill.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
  expect(Math.round((drawn / whole) * 100)).toBe(38);
});

it("keeps the eyebrow, without a square, on the other pages (#1024)", () => {
  const output = dom(rendered("progress", "week", "one", "phone"));
  expect(output.querySelector(".support-page .eyebrow")?.textContent).toBe("Progress");
  expect(output.querySelector(".pd-name-row")).toBeNull();
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
  expect(listing.body.textContent).toContain("Older workbooks");
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

it("shows every parent explanation state in the inert preview without network or scripts", () => {
  for (const state of ["idle", "loading", "ready", "retry", "cap", "stale", "unavailable"]) {
    const html = rendered("scan_results", `explain_${state}`);
    const output = dom(html);
    expect(output.body.textContent).toContain("Wrong");
    expect(output.querySelector(".scan-marking-results li .scan-explanation")).not.toBeNull();
    expect(output.body.textContent).toContain(state === "ready" ? "Stored correct answer: 42" : state === "retry" ? "Try explanation again" : "Explain this problem");
    expect(output.querySelector("script")).toBeNull(); expect(output.querySelector("form")).toBeNull();
    expect(calls.fetch).not.toHaveBeenCalled(); expect(calls.client).not.toHaveBeenCalled(); expect(calls.track).not.toHaveBeenCalled();
  }
});

it.each(["desktop", "phone"].flatMap(size => ["first", "second"].map(child => ({ size, child }))))(
  "renders the selected child's real history states in the opened day of the inert $size preview for $child",
  ({ size, child }) => {
    const output = dom(renderParentPreview(previewSelection({ view: "workbooks", scenario: "history_populated", family: "two", child, size }), styles));
    const day = output.querySelector("details#day-1[open]")!;
    expect(output.querySelector("h1")?.textContent).toBe(`${child === "first" ? "Leah" : "Kai"}'s workbooks`);
    for (const text of ["Results ready", "2 of 3 right", "answer for our team to check", "Not marked yet", "Could not mark", "All answers blank", "Not scored", "No saved results"]) expect(day.textContent).toContain(text);
    expect(day.textContent).not.toContain("Loading page history");
    expect(day.querySelectorAll('a[role="link"]')).toHaveLength(6);
    expect(output.querySelectorAll("details[open]")).toHaveLength(1);
    expect(calls.fetch).not.toHaveBeenCalled(); expect(calls.client).not.toHaveBeenCalled();
  },
);
it("has real empty, expired, missing-photo, loading, error and closed history states in the Admin sandbox", () => {
  const history = (state: string) => dom(rendered("workbooks", state)).querySelector("details#day-1")!;
  expect(history("history_empty").textContent).toContain("No photo yet");
  expect(history("history_review").textContent).toContain("1 answer for our team to check");
  expect(history("history_review").textContent).not.toMatch(/continue checking|parent check|answers to check/i);
  expect(history("history_pending").textContent).toContain("Not marked yet");
  expect(history("history_failed").textContent).toContain("Could not mark");
  expect(history("history_expired").textContent).toContain("Photo no longer available");
  expect(history("history_expired").querySelector('a[role="link"]')).not.toBeNull();
  expect(history("history_missing_photo").textContent).toContain("2 of 3 right");
  expect(history("history_missing_photo").querySelector("a")).toBeNull();
  expect(history("history_loading").textContent).toContain("Loading page history");
  expect(history("history_error").querySelector('[role="alert"]')).not.toBeNull();
  expect(history("history_unavailable").textContent).toContain("Page history is not available here");
  expect(calls.fetch).not.toHaveBeenCalled(); expect(calls.client).not.toHaveBeenCalled(); expect(calls.track).not.toHaveBeenCalled();
});
