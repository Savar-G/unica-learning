// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReviewComment } from "@/lib/workbook-edit";
import { WorkbookLayoutReview } from "./workbook-layout-review";

const comment: ReviewComment = { id: "synthetic-comment", draftId: "synthetic-draft", revision: 1, page: 1, question: null,
  x: .5, y: .5, note: "Use normal capitals on the cover.", route: "layout", item: null,
  actor: { id: "synthetic-admin", email: "synthetic@example.invalid" }, createdAt: "2026-11-07T00:00:00Z",
  status: "pending", error: null, batchId: null, before: null, after: null };
let root: Root, container: HTMLDivElement;
const apply = vi.fn<Parameters<typeof WorkbookLayoutReview>[0]["apply"]>(async () => true);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);apply.mockReset().mockResolvedValue(true);
  container = document.createElement("div");document.body.append(container);root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount());container.remove();vi.unstubAllGlobals(); });
const mount = async (busy = false) => { await act(async () => root.render(createElement(WorkbookLayoutReview, { comments: [comment], pages: [1, 2, 3], busy, apply }))); };
const button = () => container.querySelector<HTMLButtonElement>("button")!;
const setStatus = async (status: string) => { await act(async () => {
  const select = container.querySelector<HTMLSelectElement>("select")!;select.value = status;select.dispatchEvent(new Event("change", { bubbles: true }));
}); };
async function text(selector: string, value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const review = async () => { await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); };
const click = async () => { await act(async () => button().click()); };

it("requires a reviewed result, note and affected page scope before rendering", async () => {
  await mount();expect(button().disabled).toBe(true);await click();expect(apply).not.toHaveBeenCalled();
  await setStatus("applied");await review();await click();expect(apply).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Select the affected pages");
  await text("textarea", "Normal display case is ready.");await text('input:not([type="checkbox"])', "1");await click();
  expect(apply).toHaveBeenCalledExactlyOnceWith({ reviewed: true, pages: [1], results: [{ id: comment.id, page: 1, status: "applied", note: "Normal display case is ready." }] });
  expect(button().disabled).toBe(true);
});
it("saves an unsupported reason without requiring a render scope", async () => {
  await mount();await setStatus("unsupported");await text("textarea", "This request needs a new template correction.");await review();
  expect(button().textContent).toBe("Save unresolved results");await click();
  expect(apply).toHaveBeenCalledExactlyOnceWith({ reviewed: true, pages: [1], results: [{ id: comment.id, page: 1, status: "unsupported", note: "This request needs a new template correction." }] });
});
it("preserves a partial result and permits all pages only after explicit selection", async () => {
  await mount();await setStatus("partial");await text("textarea", "The cover case is ready. Personal text is still pending.");
  await text('input:not([type="checkbox"])', "all");await review();await click();
  expect(apply.mock.calls[0][0]).toMatchObject({ pages: [1, 2, 3], results: [{ status: "partial" }] });
  expect(container.textContent).toContain("Only part is ready - keep open");
});
it.each(["2", "1, 1", "1, 99", "1,", "NaN"])("refuses incomplete or invalid scope %s", async scope => {
  await mount();await setStatus("applied");await text("textarea", "The correction is ready.");await text('input:not([type="checkbox"])', scope);await review();await click();
  expect(apply).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
it("retains review inputs when the request was not accepted", async () => {
  apply.mockResolvedValue(false);await mount();await setStatus("partial");await text("textarea", "The remaining request stays open.");await text('input:not([type="checkbox"])', "1");await review();await click();
  expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("partial");
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
});
it("prevents an active or locked workbook from submitting another layout review", async () => {
  await mount();await setStatus("applied");await text("textarea", "The correction is ready.");await text('input:not([type="checkbox"])', "1");await review();await mount(true);
  expect(button().disabled).toBe(true);await click();expect(apply).not.toHaveBeenCalled();
});
