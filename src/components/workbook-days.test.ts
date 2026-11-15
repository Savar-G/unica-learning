// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbookDays } from "./workbook-days";
import type { HistoryPage } from "@/lib/scan-history";
import type { DayRow } from "@/lib/workbook-days";

// The live day list (#1031): it loads the book's saved page results over the same API the Page history used, with the same
// checks: a change of parent, a closed access or a reply that names another child or book hides every result.
const fake = vi.hoisted(() => ({ auth: null as null | ((_event: string, session: { user: { id: string } }) => void) }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof fake.auth) => { fake.auth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) }));
let host: HTMLDivElement, root: Root;
const row = (day: number, first: number): DayRow => ({ day, topic: `Topic ${day}`, pages: [first, first + 1], requiredPages: [first, first + 1], status: null, today: false, missing: [] });
const weeks: [DayRow[], DayRow[]] = [[row(1, 3), row(2, 5)], []];
const result = (pageNumber: number, extra: Partial<HistoryPage> = {}): HistoryPage => ({ id: `page-${pageNumber}`, childId: "child", childName: "Leah", workbookId: "book", book: 2, revision: "r", day: "Day 1", pageNumber, status: "ready", label: "Results ready", photo: `photo-${pageNumber}`, photoAvailable: true, failedJob: false,
  counts: { scored: 3, unscored: 0, teamChecks: 0, pending: 0 }, right: 3, wrong: 0, blank: 0, ...extra });
const show = async (props: Partial<Parameters<typeof WorkbookDays>[0]> = {}) => { await act(async () => root.render(createElement(WorkbookDays, { parent: "parent", child: "child", book: "book", weeks, open: true, ...props }))); };
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fake.auth = null; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("loads every page of the book's results, in order, and puts each in the day it belongs to", async () => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => { paths.push(path); return Response.json(paths.length === 1 ? { pages: [result(3)], counts: {}, after: "cursor" } : { pages: [result(5, { status: "review", label: "Our team is checking", counts: { scored: 0, unscored: 0, teamChecks: 2, pending: 0 }, right: 0 })], counts: {}, after: null }); });
  await show();
  expect(paths).toHaveLength(2);
  expect(paths[0]).toContain("child=child"); expect(paths[0]).toContain("workbook=book"); expect(paths[0]).toContain("status=all");
  expect(paths[1]).toContain("after=cursor");
  const [one, two] = [...host.querySelectorAll("details")];
  expect(one.textContent).toContain("Page 3: Results ready · 3 of 3 right");
  expect(one.querySelector("a")?.getAttribute("href")).toBe("/account/scan/results/photo-3");
  expect(one.textContent).toContain("Page 4: No photo yet");
  expect(two.textContent).toContain("Page 5: 2 answers for our team to check");
});

it("says it is loading, then that results cannot load, and never invents a page", async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { release = resolve; }));
  await show();
  expect(host.textContent).toContain("Loading page history...");
  await act(async () => release(new Response("{}", { status: 503 })));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("We cannot load page history now");
  expect(host.querySelector("a")).toBeNull();
});

it("a family with no saved results open makes no request and says so", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await show({ open: false });
  expect(fetch).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Page history is not available here.");
});

it.each(["child", "book"])("refuses a reply that names another %s", async boundary => {
  vi.stubGlobal("fetch", async () => Response.json({ pages: [result(3, boundary === "child" ? { childId: "foreign" } : { workbookId: "foreign" })], counts: {}, after: null }));
  await show();
  expect(host.textContent).toContain("Page history is not available here");
  expect(host.querySelector("a")).toBeNull();
});

it.each([401, 403, 404])("hides the results after HTTP %s", async status => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status }));
  await show();
  expect(host.textContent).toContain("Page history is not available here");
  expect(host.querySelector("a")).toBeNull();
});

it("a delayed reply cannot refill the page after another account signs in", async () => {
  let resume!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { resume = resolve; }));
  await show();
  await act(async () => fake.auth?.("SIGNED_IN", { user: { id: "other-parent" } }));
  await act(async () => resume(Response.json({ pages: [result(3)], counts: {}, after: null })));
  expect(host.querySelector("a")).toBeNull();
  expect(host.textContent).toContain("Page history is not available here");
});

it("refreshes while the page is visible and stops when it goes away", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => Response.json({ pages: [result(3)], counts: {}, after: null })); vi.stubGlobal("fetch", fetch);
  await show();
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetch).toHaveBeenCalledTimes(2);
  root = createRoot(host);
});
