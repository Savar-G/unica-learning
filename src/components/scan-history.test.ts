// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanHistory } from "./scan-history";
import { ScanPostChoice } from "./scan-post-choice";
import type { HistoryPage } from "@/lib/scan-history";
const fake = vi.hoisted(() => ({ auth: null as null | ((_event: string, session: { user: { id: string } }) => void), events: [] as string[] }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof fake.auth) => { fake.auth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) }));
vi.mock("@/lib/scan-track", () => ({ scanEventTicket: (current: () => boolean) => (event: string, status: string) => { if (current()) fake.events.push(`${event}:${status}`); } }));
let host: HTMLDivElement, root: Root;
const page: HistoryPage = { id: "page", childId: "child", childName: "Synthetic", workbookId: "book", book: 2, revision: "frozen", day: "Day 4", pageNumber: 8, status: "review", label: "Please check", photo: "expired", photoAvailable: false, failedJob: false, counts: { scored: 0, unscored: 0, parentChecks: 1, pending: 0 }, right: 0, wrong: 0, blank: 0 };
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fake.events = []; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
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
