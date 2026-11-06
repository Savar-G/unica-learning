// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanMarkingResults } from "./scan-marking-results";
import type { markingPageView } from "@/lib/scan-marking";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("./scan-private-images", () => ({ ScanPrivateImages: ({ photo }: { photo: string }) => createElement("span", { "data-evidence-photo": photo }, "Private crop") }));
let host: HTMLDivElement, root: Root, calls: { path: string; init: RequestInit }[], answer: Response;
const item = { number: 1, itemId: "original", version: 2, state: "scored" as const, result: "wrong" as const,
  readAnswerText: "56", canChange: true, evidencePhoto: "photo", photoAvailable: false, actor: "system" as const, at: "2026-11-05T00:00:00Z", label: "Wrong" };
const page: ReturnType<typeof markingPageView> & { photoAvailable: boolean } = { items: [item], photoAvailable: false,
  completion: { status: "complete", total: 1, finished: 1, items: [] }, counts: { scored: 1, unscored: 0, parentChecks: 0, pending: 0 }, solutionsAvailable: true };
const click = async (text: string) => { const button = [...host.querySelectorAll("button")].find((b) => b.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); };
const show = async (result = page) => { await act(async () => root.render(createElement(ScanMarkingResults, { result, photo: "photo" }))); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); calls = [];
  answer = Response.json({ status: "saved", result: { ...page, items: [{ ...item, version: 3, result: "blank", label: "Blank", actor: "parent" }] } });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => { calls.push({ path, init }); return answer; });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it.each(["Right", "Wrong", "Blank"])("expired saved marks expose explicit %s through the current-version action", async label => {
  await show(); await click("Change this mark");
  expect(host.textContent).toContain("Photo no longer available"); expect(host.textContent).toContain("We read: 56");
  expect([...host.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual(["Right", "Wrong", "Blank"]);
  await click(label); expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("/api/account/scans/photo/marking"); expect(calls[0].init.method).toBe("PATCH");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ itemId: "original", version: 2, result: label.toLowerCase() });
  expect(host.textContent).toContain("Your mark is saved."); expect(host.textContent).toContain("We read: 56");
});
it("a pending check has no selected result and an unscored observation has no score controls", async () => {
  await show({ ...page, items: [{ ...item, state: "pending", result: null, label: "Please check this answer" }] });
  await click("Check this answer"); expect(host.querySelector('[aria-pressed="true"], :checked')).toBeNull(); expect(calls).toHaveLength(0);
  await show({ ...page, items: [{ ...item, state: "unscored", result: null, canChange: false, label: "Not scored" }] });
  expect(host.querySelector("button")).toBeNull();
});
it("a conflict shows the new result and requires another explicit choice against its version", async () => {
  await show(); await click("Change this mark");
  answer = Response.json({ status: "conflict", result: { ...page, items: [{ ...item, version: 5, result: "right", label: "Right" }] } }, { status: 409 });
  await click("Blank"); expect(host.textContent).toContain("This mark changed on another device");
  await show({ ...page, items: [{ ...item, version: 5, result: "right", label: "Right" }] });
  expect(host.textContent).toContain("This mark changed on another device");
  answer = Response.json({ status: "saved", result: page }); await click("Wrong");
  expect(JSON.parse(String(calls[1].init.body)).version).toBe(5);
});
it("a parent can revise a previous parent judgment after image deletion", async () => {
  await show({ ...page, items: [{ ...item, actor: "parent", state: "parent-checked" }] });
  await click("Change this mark"); await click("Right"); expect(calls).toHaveLength(1);
});

it("a retake review shows the canonical evidence crop instead of the newer photo", async () => {
  await show({ ...page, photoAvailable: true, items: [{ ...item, evidencePhoto: "original-photo", photoAvailable: true }] });
  await click("Change this mark");
  expect(host.querySelector("[data-evidence-photo]")?.getAttribute("data-evidence-photo")).toBe("original-photo");
  await click("Blank"); expect(calls[0].path).toBe("/api/account/scans/photo/marking");
});
