// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApproveDraft, NewMarksNotice } from "@/components/workbook-ship-actions";

// D-308 on the run page, with synthetic data: "New marks since this draft", "Update with new marks", "Update first?".
const f = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push, refresh: f.refresh }) }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", f.fetch);
  vi.stubGlobal("confirm", vi.fn(() => true));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const LINE = "New marks since this draft: Days 8-9 (2 pages)";
const answer = (status: number, body: unknown) => ({ status, json: async () => body });
const button = (name: string) => [...container.querySelectorAll("button")].find(b => b.textContent === name)!;
const click = (name: string) => act(async () => { button(name).click(); });
const bodies = () => f.fetch.mock.calls.map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);

it("shows the new marks and updates the plan with them", async () => {
  f.fetch.mockResolvedValue(answer(200, { ok: true, line: "Plan updated with the new marks (plan version 2). The pages are not drawn again yet." }));
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", line: LINE, updated: null, ready: true })));
  expect(container.textContent).toContain(`${LINE}. This draft was planned before these pages were marked.`);
  await click("Update with new marks");
  expect(bodies()).toEqual([["/api/admin/workbooks/runs/run/update-marks", {}]]);
  expect(container.textContent).toContain("Plan updated with the new marks (plan version 2).");
  expect(f.refresh).toHaveBeenCalled();
});

it("disables the update without a planner, and says when an update was made", async () => {
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", line: LINE, updated: null, ready: false })));
  expect(button("Update with new marks").disabled).toBe(true);
  expect(container.textContent).toContain("The planner is not ready yet.");
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", line: null, updated: 2, ready: true })));
  expect(container.textContent).toBe("Plan updated with the new marks (plan version 2). The pages are not drawn again yet.");
});

it("asks \"Update first?\" before approving with new marks, and approves anyway on request", async () => {
  f.fetch.mockResolvedValue(answer(200, { ok: true, workbookId: "book" }));
  await act(async () => root.render(createElement(ApproveDraft, { runId: "run", revision: 3, workbookPath: "/admin/workbooks/book", child: "Leah", pending: 0, newMarks: LINE })));
  await click("Approve version 3 for print");
  expect(f.fetch).not.toHaveBeenCalled();
  expect(container.querySelector("[role=dialog]")!.textContent).toContain(`Update first? ${LINE}. This draft does not use them yet.`);
  await click("Approve anyway");
  expect(bodies()).toEqual([["/api/admin/workbooks/runs/run/approve", { revision: 3, despiteNewMarks: true }]]);
  expect(f.push).toHaveBeenCalledWith("/admin/workbooks/book");
});

it("asks when the server finds new marks the page did not show", async () => {
  f.fetch.mockResolvedValueOnce(answer(409, { ok: false, askUpdate: LINE }));
  await act(async () => root.render(createElement(ApproveDraft, { runId: "run", revision: 3, workbookPath: "/admin/workbooks/book", child: "Leah", pending: 0 })));
  await click("Approve version 3 for print");
  expect(bodies()).toEqual([["/api/admin/workbooks/runs/run/approve", { revision: 3 }]]);
  expect(container.textContent).toContain("Update first?");
  expect(container.querySelector("[role=alert]")).toBeNull();
  await click("Cancel");
  expect(container.querySelector("[role=dialog]")).toBeNull();
  expect(f.push).not.toHaveBeenCalled();
});
