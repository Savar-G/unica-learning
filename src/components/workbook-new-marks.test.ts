// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApproveDraft, NewMarksNotice, NextBookApproval } from "@/components/workbook-ship-actions";
import type { NewMarksView } from "@/lib/next-book-refresh";

// D-308 on the run page, with synthetic data: "New marks since this draft", "Update with new marks", "Update first?".
const f = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), confirm: vi.fn(() => true) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push, refresh: f.refresh }) }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); f.confirm.mockReturnValue(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", f.fetch); vi.stubGlobal("confirm", f.confirm);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const LINE = "New marks since this draft: Days 8-9 (2 pages)";
const NEW: NewMarksView = { state: "new", line: LINE, updated: null, unfinished: null, canUpdate: true, ready: true };
const answer = (status: number, body: unknown) => ({ status, json: async () => body });
const button = (name: string) => [...container.querySelectorAll("button")].find(b => b.textContent === name);
const click = (name: string) => act(async () => { button(name)!.click(); });
const posts = () => f.fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
  .map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);
const approveProps = { runId: "run", revision: 3, workbookPath: "/admin/workbooks/book", child: "Leah", pending: 0 };

it("shows the new marks and updates the plan with them", async () => {
  const changed = vi.fn();
  f.fetch.mockResolvedValue(answer(200, { ok: true, line: "Plan updated with the new marks (plan version 2). The pages are not drawn again yet." }));
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", view: NEW, onChanged: changed })));
  expect(container.textContent).toContain(`${LINE}. This draft was planned before these pages were marked.`);
  await click("Update with new marks");
  expect(posts()).toEqual([["/api/admin/workbooks/runs/run/update-marks", {}]]);
  expect(container.textContent).toContain("Plan updated with the new marks (plan version 2).");
  expect(changed).toHaveBeenCalled();
});

it("disables the update without a planner", async () => {
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", view: { ...NEW, ready: false }, onChanged: () => {} })));
  expect(button("Update with new marks")!.disabled).toBe(true);
  expect(container.textContent).toContain("The planner is not ready yet.");
});

// Falsifier (review 1, 2): after an update the notice reads "current", or a half-done update hides the button or says "Plan updated".
it("keeps the new marks after an update that drew nothing, and offers to finish a half-done update", async () => {
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", view: { ...NEW, updated: 2, canUpdate: false }, onChanged: () => {} })));
  expect(container.textContent).toContain(LINE);
  expect(container.textContent).toContain("Plan updated with the new marks (plan version 2). The pages are not drawn again yet.");
  expect(button("Update with new marks")).toBeUndefined();
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", view: { ...NEW, unfinished: 2 }, onChanged: () => {} })));
  expect(container.textContent).not.toContain("Plan updated");
  expect(container.textContent).toContain("Plan version 2 was saved but not planned yet.");
  expect(button("Update with new marks")!.disabled).toBe(false);
});

it("refreshes the check after a failed update too", async () => {
  const changed = vi.fn();
  f.fetch.mockResolvedValue(answer(503, { ok: false, line: "The new marks were saved, but the plan was not updated. Press Update with new marks again." }));
  await act(async () => root.render(createElement(NewMarksNotice, { runId: "run", view: NEW, onChanged: changed })));
  await click("Update with new marks");
  expect(container.textContent).toContain("The new marks were saved, but the plan was not updated.");
  expect(changed).toHaveBeenCalled();
});

it("asks \"Update first?\" before approving with new marks, and approves anyway with one confirm", async () => {
  f.fetch.mockResolvedValue(answer(200, { ok: true, workbookId: "book" }));
  await act(async () => root.render(createElement(ApproveDraft, { ...approveProps, newMarks: NEW })));
  await click("Approve version 3 for print");
  expect(f.fetch).not.toHaveBeenCalled();
  expect(container.querySelector("[role=dialog]")!.textContent).toContain(`Update first? ${LINE}. This draft does not use them yet.`);
  await click("Approve anyway");
  expect(f.confirm).toHaveBeenCalledTimes(1);
  expect(posts()).toEqual([["/api/admin/workbooks/runs/run/approve", { revision: 3, despiteNewMarks: true }]]);
  expect(f.push).toHaveBeenCalledWith("/admin/workbooks/book");
});

// Falsifier (review 6): the server's question confirms twice, or a successful update leaves "Update first?" open.
it("asks when the server finds new marks, confirms once, and closes the question after an update", async () => {
  const changed = vi.fn();
  f.fetch.mockResolvedValueOnce(answer(409, { ok: false, askUpdate: LINE }));
  await act(async () => root.render(createElement(ApproveDraft, { ...approveProps, onMarksChanged: changed })));
  await click("Approve version 3 for print");
  expect(posts()).toEqual([["/api/admin/workbooks/runs/run/approve", { revision: 3 }]]);
  expect(container.textContent).toContain("Update first?");
  expect(container.querySelector("[role=alert]")).toBeNull();
  f.fetch.mockResolvedValueOnce(answer(200, { ok: true, line: "Plan updated with the new marks (plan version 2). The pages are not drawn again yet." }));
  await click("Update with new marks");
  expect(container.querySelector("[role=dialog]")).toBeNull();
  expect(changed).toHaveBeenCalled();
  f.fetch.mockResolvedValueOnce(answer(409, { ok: false, askUpdate: LINE }));
  await click("Approve version 3 for print");
  f.fetch.mockResolvedValueOnce(answer(200, { ok: true, workbookId: "book" }));
  await click("Approve anyway");
  expect(f.confirm).toHaveBeenCalledTimes(2);
  expect(posts().at(-1)).toEqual(["/api/admin/workbooks/runs/run/approve", { revision: 3, despiteNewMarks: true }]);
  expect(f.push).toHaveBeenCalledWith("/admin/workbooks/book");
});

it("asks to approve anyway when the server cannot check the new marks", async () => {
  f.fetch.mockResolvedValueOnce(answer(409, { ok: false, askUpdate: "The new marks could not be checked", checkUnavailable: true }));
  await act(async () => root.render(createElement(ApproveDraft, approveProps)));
  await click("Approve version 3 for print");
  expect(container.querySelector("[role=dialog]")!.textContent).toContain("Approve anyway? The new marks could not be checked.");
  expect(button("Update with new marks")).toBeUndefined();
  await click("Cancel");
  expect(container.querySelector("[role=dialog]")).toBeNull();
  expect(f.push).not.toHaveBeenCalled();
});

// Falsifier (review 8): the check runs on every page refresh instead of once and after a press.
it("reads the check once when it opens, not on each page refresh, and again after an update", async () => {
  f.fetch.mockResolvedValue(answer(200, NEW));
  await act(async () => root.render(createElement(NextBookApproval, approveProps)));
  expect(f.fetch.mock.calls.map(c => c[0])).toEqual(["/api/admin/workbooks/runs/run/new-marks"]);
  expect(container.textContent).toContain(LINE);
  await act(async () => root.render(createElement(NextBookApproval, { ...approveProps, pending: 0 })));
  expect(f.fetch).toHaveBeenCalledTimes(1);
  f.fetch.mockResolvedValueOnce(answer(200, { ok: true, line: "Plan updated with the new marks (plan version 2). The pages are not drawn again yet." }))
    .mockResolvedValueOnce(answer(200, { ...NEW, updated: 2, canUpdate: false }));
  await click("Update with new marks");
  expect(f.fetch.mock.calls.map(c => c[0])).toEqual(["/api/admin/workbooks/runs/run/new-marks", "/api/admin/workbooks/runs/run/update-marks", "/api/admin/workbooks/runs/run/new-marks"]);
  expect(button("Update with new marks")).toBeUndefined();
});
