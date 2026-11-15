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
// Day 1 starts open, as a `?day=1` link opens it: the results load when a day is open.
const show = async (props: Partial<Parameters<typeof WorkbookDays>[0]> = {}) => { await act(async () => root.render(createElement(WorkbookDays, { parent: "parent", child: "child", book: "book", weeks, open: true, openDay: 1, ...props }))); };
const toggle = async (day: number, open: boolean) => { const details = host.querySelector<HTMLDetailsElement>(`#day-${day}`)!; details.open = open; await act(async () => { details.dispatchEvent(new Event("toggle")); }); };
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
  await toggle(2, true);
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

it("makes no request until a day is opened, loads once when the first opens, and stops refreshing when every day is closed", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => Response.json({ pages: [result(3)], counts: {}, after: null })); vi.stubGlobal("fetch", fetch);
  await show({ openDay: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetch).not.toHaveBeenCalled();
  await toggle(1, true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(host.querySelector("#day-1")?.textContent).toContain("Page 3: Results ready");
  await toggle(2, true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await toggle(1, false); await toggle(2, false);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("pages through every cursor until the last, with no cap, and fails on a cursor it was given twice", async () => {
  const rest = Array.from({ length: 11 }, (_, i) => result(3, { id: `p${i}` }));
  let n = 0;
  vi.stubGlobal("fetch", async () => Response.json({ pages: [rest[n]], counts: {}, after: ++n < rest.length ? `cursor-${n}` : null }));
  await show();
  expect(n).toBe(11);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  n = 0;
  vi.stubGlobal("fetch", async () => Response.json({ pages: [result(3)], counts: {}, after: "same" }));
  await act(async () => root.unmount()); root = createRoot(host);
  await show();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("We cannot load page history now");
});

it("lists a day's extra practice pages after its required ones, with the state words and the results link", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ pages: [result(3), result(9, { day: "Day 1", status: "review", label: "Our team is checking", counts: { scored: 0, unscored: 0, teamChecks: 1, pending: 0 }, right: 0 })], counts: {}, after: null }));
  await show();
  const items = [...host.querySelectorAll("#day-1 li")];
  expect(items).toHaveLength(3);
  expect(items[2].textContent).toContain("Page 9 · Extra practice: 1 answer for our team to check");
  expect(items[2].querySelector("a")?.getAttribute("href")).toBe("/account/scan/results/photo-9");
  expect(items[2].querySelector("a")?.getAttribute("aria-label")).toContain("extra practice page 9");
  expect(host.querySelector("#day-2")?.textContent).not.toContain("Extra practice");
});

it("says once, above the weeks, how many pages our team is checking, and nothing when there are none", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ pages: [], counts: {}, after: null }));
  await show({ checking: 3 });
  expect(host.querySelector(".wd-check")?.textContent).toBe("Our team is checking 3 pages");
  expect(host.querySelector(".wd-check")?.nextElementSibling?.tagName).toBe("SECTION");
  await show({ checking: 1 });
  expect(host.querySelector(".wd-check")?.textContent).toBe("Our team is checking 1 page");
  await show({ checking: 0 });
  expect(host.querySelector(".wd-check")).toBeNull();
});
