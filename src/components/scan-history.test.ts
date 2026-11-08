// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanHistory, ScanHistoryView } from "./scan-history";
import { ScanPostChoice } from "./scan-post-choice";
import { readScanHistory, type HistoryPage, type HistoryRecord, type HistoryStore } from "@/lib/scan-history";
const fake = vi.hoisted(() => ({ auth: null as null | ((_event: string, session: { user: { id: string } }) => void), pathname: "/account/workbooks/child", events: [] as string[] }));
vi.mock("next/navigation", () => ({ usePathname: () => fake.pathname }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof fake.auth) => { fake.auth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) }));
vi.mock("@/lib/scan-track", () => ({ scanEventTicket: (current: () => boolean) => (event: string, status: string) => { if (current()) fake.events.push(`${event}:${status}`); } }));
let host: HTMLDivElement, root: Root;
const page: HistoryPage = { id: "page", childId: "child", childName: "Synthetic", workbookId: "book", book: 2, revision: "frozen", day: "Day 4", pageNumber: 8, status: "review", label: "Our team is checking", photo: "expired", photoAvailable: false, failedJob: false, counts: { scored: 0, unscored: 0, teamChecks: 1, pending: 0 }, right: 0, wrong: 0, blank: 0 };
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fake.events = []; fake.pathname = "/account/workbooks/child"; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("history groups retained results and links unfinished checks to the existing review", async () => {
  const paths: string[] = []; vi.stubGlobal("fetch", async (path: string) => { paths.push(path); return Response.json({ pages: [page], counts: { review: 1 }, after: "older" }); });
  await act(async () => root.render(createElement(ScanHistory, { parent: "parent", child: "child" })));
  expect(host.textContent).toContain("Workbook 2 · Day 4"); expect(host.textContent).toContain("Showing 1 printed page"); expect(host.textContent).toContain("Photo no longer available"); expect(host.querySelector("a")?.getAttribute("href")).toBe("/account/scan/results/expired");
  const more = [...host.querySelectorAll("button")].find((b) => b.textContent === "More pages")!; await act(async () => more.click()); expect(paths[1]).toContain("after=older");
});
it("a delayed history response cannot refill the replacement account", async () => {
  let resume!: (response: Response) => void; vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => { resume = resolve; }));
  await act(async () => root.render(createElement(ScanHistory, { parent: "parent", child: "child" })));
  await act(async () => fake.auth?.("SIGNED_IN", { user: { id: "other-parent" } }));
  await act(async () => resume(Response.json({ pages: [page], counts: { review: 1 }, after: null })));
  expect(host.textContent).not.toContain("Workbook 2"); expect(host.querySelector("a")).toBeNull();
});
it("the completed-page choice cannot activate Maya and only results_only is emitted", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(createElement(ScanPostChoice, { parent: "parent", photo: "photo" })));
  const maya = host.querySelector("button")!; expect(maya.disabled).toBe(true); await act(async () => maya.click()); expect(fake.events).toEqual([]);
  await act(async () => host.querySelector("a")!.click()); expect(fake.events).toEqual(["scan_post_scan_choice:results_only"]); expect(fetch).not.toHaveBeenCalled();
});

const listing = (pages: HistoryPage[] = [page]) => ({ pages, counts: { review: pages.filter(p => p.status === "review").length }, after: null });
const showHistory = async (child = "child", books?: string[]) => { await act(async () => root.render(createElement(ScanHistory, { parent: "parent", child, books }))); };
it.each(["child", "parent", "route"])("removes old results at the %s boundary and ignores its late reply", async boundary => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
  await showHistory();
  await act(async () => pending[0](Response.json(listing())));
  expect(host.textContent).toContain("Workbook 2");
  // A filter starts another old-context request without waiting for a timer.
  await act(async () => { const select = host.querySelector("select")!; select.value = "review"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  if (boundary === "route") fake.pathname = "/account/scan";
  await act(async () => root.render(createElement(ScanHistory, { parent: boundary === "parent" ? "new-parent" : "parent", child: boundary === "child" ? "new-child" : "child" })));
  expect(host.textContent).toContain("Loading page history");
  expect(host.textContent).not.toContain("Workbook 2");
  await act(async () => pending[1](Response.json(listing())));
  expect(host.textContent).not.toContain("Workbook 2");
  const nextPage = { ...page, childId: boundary === "child" ? "new-child" : "child", book: 7 };
  await act(async () => pending[2](Response.json(listing([nextPage]))));
  expect(host.textContent).toContain("Workbook 7");
  expect(host.textContent).not.toContain("Workbook 2");
});
it("discards an all-pages reply after the filter changes", async () => {
  const pending: ((response: Response) => void)[] = [], paths: string[] = [];
  vi.stubGlobal("fetch", (path: string) => { paths.push(path); return new Promise<Response>(resolve => pending.push(resolve)); });
  await showHistory();
  await act(async () => { const select = host.querySelector("select")!; select.value = "failed"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(paths[1]).toContain("status=failed");
  await act(async () => pending[1](Response.json(listing([]))));
  await act(async () => pending[0](Response.json(listing())));
  expect(host.textContent).toContain("No saved page results for this filter");
  expect(host.textContent).not.toContain("Workbook 2");
});
it.each(["child", "book"])("refuses an unexpected %s in a successful response", async boundary => {
  vi.stubGlobal("fetch", async () => Response.json(listing([{ ...page, ...(boundary === "child" ? { childId: "foreign" } : { workbookId: "foreign" }) }])));
  await showHistory("child", ["book"]);
  expect(host.textContent).toContain("Page history is not available here");
  expect(host.querySelector("a")).toBeNull();
});
it.each([401, 403, 404])("stops requests and hides result links after HTTP %s", async status => {
  vi.useFakeTimers(); const fetch = vi.fn(async () => new Response(null, { status })); vi.stubGlobal("fetch", fetch);
  await showHistory();
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Page history is not available here");
  expect(host.querySelector("a, select")).toBeNull();
});
it("shows a retryable load error and never overlaps history requests", async () => {
  vi.useFakeTimers(); let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resume => { resolve = resume; })); vi.stubGlobal("fetch", fetch);
  await showHistory(); await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(new Response(null, { status: 503 })));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("We cannot load page history");
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => resolve(Response.json(listing([]))));
  expect(host.textContent).toContain("No saved page results");
});
it("keeps the canonical result states distinct without inferring a missing scan", () => {
  const states = ["ready", "review", "pending", "failed", "blank", "unscored", "never-scanned"] as const;
  const pages = states.map((status, index) => ({ ...page, id: String(index), status, label: status, workbookId: index < 4 ? "current-book" : "past-book", book: index < 4 ? 3 : 2,
    photo: status === "never-scanned" ? null : "expired", right: status === "ready" ? 2 : 0, blank: status === "blank" ? 1 : 0,
    counts: { scored: 3, unscored: status === "unscored" ? 1 : 0, teamChecks: status === "review" ? 1 : 0, pending: status === "pending" ? 1 : 0 } }));
  const html = renderToStaticMarkup(createElement(ScanHistoryView, { listing: listing(pages), state: "ready" }));
  expect(html).toContain("2 of 3 right"); expect(html).toContain("1 blank"); expect(html).toContain("1 not scored");
  expect(html).toContain("View page results"); expect(html).not.toMatch(/continue checking|parent check|answers to check/i); expect(html).toContain("Photo no longer available");
  expect(html).toContain("No saved results"); expect(html).not.toContain("No photo yet");
  expect(html.indexOf("Workbook 3")).toBeLessThan(html.indexOf("Workbook 2"));
  expect((html.match(/href=/g) ?? []).length).toBe(6);
});

it("never commits the previous child's loaded history below the next child's heading", async () => {
  const snapshots: string[] = [];
  function Page({ child }: { child: string }) {
    useLayoutEffect(() => { snapshots.push(host.textContent ?? ""); }, [child]);
    return createElement("div", null, createElement("h1", null, child), createElement(ScanHistory, { parent: "parent", child }));
  }
  vi.stubGlobal("fetch", async () => Response.json(listing()));
  await act(async () => root.render(createElement(Page, { child: "child" })));
  expect(host.textContent).toContain("Workbook 2");
  vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
  await act(async () => root.render(createElement(Page, { child: "sibling" })));
  expect(snapshots.at(-1)).toContain("sibling");
  expect(snapshots.at(-1)).toContain("Loading page history");
  expect(snapshots.at(-1)).not.toContain("Workbook 2");
});

it("finishes the current workbook's bounded pages before visiting past workbooks", async () => {
  const records: HistoryRecord[] = Array.from({ length: 56 }, (_, index) => ({
    id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, childId: "child", childName: "Synthetic",
    workbookId: index < 26 ? "past" : "current", book: index < 26 ? 1 : 2, revision: "frozen",
    day: "Day 1", pageNumber: index < 26 ? index + 1 : index - 25, marks: [], photos: [], jobs: [], spend: [],
  }));
  const store: HistoryStore = { read: async filter => ({ budget: null, pages: records.filter(record =>
    (!filter.workbook || record.workbookId === filter.workbook) && (!filter.after || record.id > filter.after)) }) };
  const queries: URLSearchParams[] = [], shown: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    const query = new URL(path, "http://synthetic.local").searchParams; queries.push(query);
    const result = await readScanHistory(store, { child: query.get("child")!, workbook: query.get("workbook") ?? undefined,
      after: query.get("after") ?? undefined }, 0);
    shown.push(...result!.pages.map(page => page.id)); return Response.json(result);
  });
  const more = async () => { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "More pages")!.click()); };
  await showHistory("child", ["current", "past"]);
  expect(host.textContent).toContain("Workbook 2"); expect(host.textContent).not.toContain("Workbook 1");
  expect(queries[0].get("workbook")).toBe("current"); expect(shown).toHaveLength(25);
  await more(); expect(host.textContent).toContain("Workbook 2"); expect(host.textContent).not.toContain("Workbook 1");
  expect(queries[1].get("workbook")).toBe("current"); expect(queries[1].get("after")).toBe(records[50].id);
  await more(); expect(host.textContent).toContain("Workbook 1"); expect(host.textContent).not.toContain("Workbook 2");
  expect(queries[2].get("workbook")).toBe("past"); expect(queries[2].has("after")).toBe(false);
  await more(); expect(queries[3].get("workbook")).toBe("past");
  expect(shown).toHaveLength(56); expect(new Set(shown).size).toBe(56);
  expect([...host.querySelectorAll("button")].some(button => button.textContent === "More pages")).toBe(false);
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "First pages")!.click());
  expect(queries[4].get("workbook")).toBe("current"); expect(queries[4].has("after")).toBe(false);
});

it("keeps an empty current-book filter bounded and resets to that book when the filter changes", async () => {
  const paths: URLSearchParams[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    const query = new URL(path, "http://synthetic.local").searchParams; paths.push(query);
    return Response.json(listing(query.get("workbook") === "current" ? [] : [{ ...page, workbookId: "past", book: 1 }]));
  });
  await showHistory("child", ["current", "past"]);
  expect(paths).toHaveLength(1); expect(host.textContent).toContain("No saved page results in this workbook");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "More pages")!.click());
  expect(host.textContent).toContain("Workbook 1"); expect(paths[1].get("workbook")).toBe("past");
  await act(async () => { const select = host.querySelector("select")!; select.value = "review"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(paths[2].get("workbook")).toBe("current"); expect(paths[2].get("status")).toBe("review"); expect(paths[2].has("after")).toBe(false);
  expect(host.textContent).toContain("No saved page results in this workbook for this filter"); expect(host.textContent).not.toContain("Workbook 1");
});

it("does not request all-book history when the shipped-book list is empty", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await showHistory("child", []);
  expect(fetch).not.toHaveBeenCalled(); expect(host.textContent).toContain("No saved page results"); expect(host.querySelector("button")).toBeNull();
});

it("refuses a different shipped workbook than the one requested", async () => {
  vi.stubGlobal("fetch", async () => Response.json(listing([{ ...page, workbookId: "past" }])));
  await showHistory("child", ["current", "past"]);
  expect(host.textContent).toContain("Page history is not available here"); expect(host.querySelector("a")).toBeNull();
});

it("ignores a late current-book refresh after More pages opens a past book", async () => {
  vi.useFakeTimers(); let resume!: (value: ReturnType<typeof listing>) => void;
  const pending = new Promise<ReturnType<typeof listing>>(resolve => { resume = resolve; });
  const current = { ...page, workbookId: "current" }, past = { ...page, workbookId: "past", book: 1 };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(listing([current])))
    .mockResolvedValueOnce({ status: 200, ok: true, json: () => pending })
    .mockResolvedValueOnce(Response.json(listing([past])));
  vi.stubGlobal("fetch", fetch);
  await showHistory("child", ["current", "past"]);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "More pages")!.click());
  expect(host.textContent).toContain("Workbook 1");
  await act(async () => resume(listing([current])));
  expect(host.textContent).toContain("Workbook 1"); expect(host.textContent).not.toContain("Workbook 2");
});
