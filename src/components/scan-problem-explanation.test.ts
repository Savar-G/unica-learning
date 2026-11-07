// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanMarkingResults } from "./scan-marking-results";
const context = vi.hoisted(() => ({ auth: [] as ((event: string, session: { user: { id: string } }) => void)[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: (cb: typeof context.auth[number]) => { context.auth.push(cb); return { data: { subscription: { unsubscribe() { context.auth = context.auth.filter(x => x !== cb); } } } }; } } }) }));
vi.mock("@/lib/scan-track", () => ({ scanEventTicket: () => () => {} }));
vi.mock("./scan-private-images", () => ({ ScanPrivateImages: () => null }));
let root: Root, host: HTMLDivElement;
const item = { number: 1, itemId: "question", version: 2, state: "scored" as const, result: "wrong" as const, readAnswerText: "41", canChange: true, actor: "system" as const, at: "saved", evidencePhoto: "photo", photoAvailable: true, label: "Wrong" };
const base = { completion: { status: "complete" as const, total: 1, finished: 1, items: [] }, counts: { scored: 1, unscored: 0, parentChecks: 0, pending: 0 }, solutionsAvailable: true, photoAvailable: true, items: [item] };
const ready = { status: "ready", context: "version", correctAnswer: "42", explanation: { steps: ["Add one more ten."], say: "Check the tens." } };
const render = async (result: Parameters<typeof ScanMarkingResults>[0]["result"] = base, parent = "parent", photo = "photo") => { await act(async () => root.render(createElement(ScanMarkingResults, { result, parent, photo }))); };
const press = async (label = "Explain this problem") => { const b = [...host.querySelectorAll("button")].find(b => b.textContent?.startsWith(label)); expect(b).toBeDefined(); await act(async () => b!.click()); };
beforeEach(() => { context.auth = []; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("shows a nearby stored key and plain steps after an explicit press with references only", async () => {
  const fetch = vi.fn(async () => Response.json(ready)); vi.stubGlobal("fetch", fetch);
  await render(); expect(host.textContent).not.toContain("Stored correct answer"); await press();
  expect(fetch).toHaveBeenCalledTimes(1); const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/account/scans/photo/explanation"); expect(JSON.parse(String(init.body))).toEqual({ itemId: "question", version: 2 });
  expect(host.textContent).toContain("Stored correct answer: 42"); expect(host.textContent).toContain("Say to your child: Check the tens.");
  expect(host.querySelector('[aria-label="Explanation for question 1"]')).not.toBeNull();
  const b = [...host.querySelectorAll("button")].find(b => b.textContent?.startsWith("Show explanation again"))!;
  expect(document.getElementById(b.getAttribute("aria-controls")!)).not.toBeNull();
});
it.each(["right", "blank", null] as const)("%s has no explanation control or request", async result => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); await render({ ...base, items: [{ ...item, result }] });
  expect(host.textContent).not.toContain("Explain this problem"); expect(fetch).not.toHaveBeenCalled();
});
it.each(["pending", "parent-pending"] as const)("a %s sibling withholds all explanations until the whole page is complete", async state => {
  const fetch = vi.fn(async () => Response.json(ready)); vi.stubGlobal("fetch", fetch);
  const sibling = { ...item, itemId: "sibling", number: 2, state, result: null, label: "Please check this answer" };
  await render({ ...base, completion: { ...base.completion, total: 2, finished: 1, status: "incomplete" }, solutionsAvailable: false, items: [item, sibling] });
  expect(host.textContent).not.toContain("Explain this problem"); expect(fetch).not.toHaveBeenCalled();
  await render({ ...base, completion: { ...base.completion, total: 2, finished: 2 }, items: [item, { ...sibling, state: "parent-checked", result: "right" }] });
  await press(); expect(fetch).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("Stored correct answer: 42");
});
it("the control hides as soon as a parent changes the wrong mark to right", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ status: "saved", result: { ...base, items: [{ ...item, version: 3, result: "right", label: "Right" }] } }));
  await render(); await press("Change this mark"); await press("Right"); expect(host.textContent).not.toContain("Explain this problem");
});
it.each(["retry", "cap", "unavailable", "busy", "refused"])("%s announces its state without invented steps or an automatic retry", async status => {
  const fetch = vi.fn(async () => Response.json({ status })); vi.stubGlobal("fetch", fetch); await render(); await press();
  expect(fetch).toHaveBeenCalledTimes(1); expect(host.textContent).not.toContain("Stored correct answer"); expect(host.textContent).toMatch(/try again|Try again|not available|Refresh/);
});
it.each(["child", "version", "reading", "auth"])("a delayed reply cannot appear after %s changes", async change => {
  let resume!: (r: Response) => void; const fetch = vi.fn(() => new Promise<Response>(resolve => { resume = resolve; })); vi.stubGlobal("fetch", fetch);
  await render(); await press(); expect(host.textContent).toContain("Preparing the explanation");
  if (change === "child") await render(base, "other-parent", "other-photo");
  else if (change === "auth") await act(async () => context.auth.forEach(cb => cb("SIGNED_IN", { user: { id: "other-parent" } })));
  else await render({ ...base, items: [{ ...item, ...(change === "version" ? { version: 3 } : { readAnswerText: "40" }) }] });
  await act(async () => resume(Response.json(ready))); expect(host.textContent).not.toContain("Stored correct answer");
});
it("a replacement child starts with its own lower mark version after a saved correction", async () => {
  const fetch = vi.fn(async () => Response.json({ status: "saved", result: { ...base, items: [{ ...item, version: 8, readAnswerText: "old child reading" }] } })); vi.stubGlobal("fetch", fetch);
  await render(); await press("Change this mark"); await press("Wrong");
  await render({ ...base, items: [{ ...item, version: 1, readAnswerText: "new child reading" }] }, "parent", "sibling-photo");
  fetch.mockImplementation(async () => Response.json(ready)); await press();
  const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]; expect(url).toContain("sibling-photo/explanation"); expect(JSON.parse(String(init.body)).version).toBe(1);
  expect(host.textContent).not.toContain("old child reading");
});
