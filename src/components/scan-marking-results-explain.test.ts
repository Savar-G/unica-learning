// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanMarkingResults } from "./scan-marking-results";
import type { markingPageView } from "@/lib/scan-marking";
const context = vi.hoisted(() => ({ refresh: vi.fn(), auth: null as null | ((_event: string, session: { user: { id: string } }) => void), events: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: context.refresh }) }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof context.auth) => { context.auth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) }));
vi.mock("@/lib/scan-track", () => ({ scanEventTicket: (current: () => boolean = () => true) => (name: string) => { if (current()) context.events.push(name); } }));
vi.mock("./scan-private-images", () => ({ ScanPrivateImages: ({ photo }: { photo: string }) => createElement("span", { "data-evidence-photo": photo }, "Private crop") }));
let host: HTMLDivElement, root: Root, calls: { path: string; init: RequestInit }[], answer: Response;
const item = { number: 1, itemId: "original", version: 2, state: "scored" as const, result: "wrong" as const,
  readAnswerText: "56", canChange: true, evidencePhoto: "photo", photoAvailable: false, actor: "system" as const, at: "2026-11-05T00:00:00Z", label: "Wrong" };
const page: ReturnType<typeof markingPageView> & { photoAvailable: boolean } = { items: [item], photoAvailable: false,
  completion: { status: "complete", total: 1, finished: 1, items: [] }, counts: { scored: 1, unscored: 0, teamChecks: 0, pending: 0 }, solutionsAvailable: true };
const show = async (result = page, parent?: string) => { await act(async () => root.render(createElement(ScanMarkingResults, { result, photo: "photo", parent }))); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); calls = []; context.events = []; context.refresh.mockClear();
  answer = Response.json({ status: "refused" }, { status: 403 });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => { calls.push({ path, init }); return answer; });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("page results offer a parent no way to change a mark: only our team marks (2026-11-14)", async () => {
  for (const items of [[item], [{ ...item, actor: "parent" as const, state: "parent-checked" as const }], [{ ...item, result: "right" as const, label: "Right" }], [{ ...item, result: "blank" as const, label: "Blank" }]]) {
    await show({ ...page, photoAvailable: true, items: items.map((i) => ({ ...i, photoAvailable: true })) }, "parent");
    expect(host.textContent).not.toMatch(/Change this mark|Choose the right mark|does not record another try/);
    expect(host.querySelector('[role="group"]')).toBeNull();
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toEqual(expect.arrayContaining(["Right", "Wrong", "Blank"]));
  }
  expect(calls.filter((c) => c.path.endsWith("/marking"))).toHaveLength(0);
});
it("an answer with no mark yet has no control and asks nothing (#715)", async () => {
  for (const label of ["Not marked yet", "Our team is checking this answer."]) {
    await show({ ...page, completion: { ...page.completion, status: "incomplete" }, items: [{ ...item, state: "pending", result: null, label }] });
    expect(host.querySelector("button")).toBeNull(); expect(host.textContent).toContain(label);
    expect(host.textContent).not.toMatch(/check this answer|please check/i); expect(calls).toHaveLength(0);
  }
  await show({ ...page, items: [{ ...item, state: "unscored", result: null, canChange: false, label: "Not scored" }] });
  expect(host.querySelector("button")).toBeNull();
});
it("a Wrong mark of an answer the AI read, on a complete page, offers Explain; with no reading it offers nothing (#715)", async () => {
  const team = { ...item, state: "parent-checked" as const, actor: "admin" as const, result: "wrong" as const, label: "Wrong", readAnswerText: "56" };
  await show({ ...page, items: [team] });
  expect(host.textContent).toContain("Our team");
  expect([...host.querySelectorAll("button")].map((b) => b.textContent?.replace(" for question 1", ""))).toEqual(["Explain this problem"]);
  for (const readAnswerText of [null, "", "   "]) {
    await show({ ...page, items: [{ ...team, readAnswerText }] });
    expect(host.querySelector("button")).toBeNull();
  }
  expect(calls).toHaveLength(0);
});
