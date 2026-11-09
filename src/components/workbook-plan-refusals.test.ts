// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import { ApproveDraft, MarkWorkbook } from "@/components/workbook-ship-actions";

const f = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push, refresh: f.refresh }) }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", f.fetch);
  vi.stubGlobal("confirm", vi.fn(() => true));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const states = [
  "This family's plan is cancelled",
  "A pause, cancellation or restart for this family is still in progress",
  "This family's pause requires the previous workbook to be shipped first",
  "This family's plan is paused",
];
const actions = [
  { name: "prepare", suffix: ", so no new workbook can be prepared.", view: () => createElement(PrepareWorkbook, { childId: "child", child: "Leah" }), response: (message: string) => ({ ok: false, error: message }) },
  { name: "approve", suffix: ". Approval must wait.", view: () => createElement(ApproveDraft, { runId: "run", revision: 1, workbookPath: "/admin/workbooks/book", child: "Leah" }), response: (message: string) => ({ ok: false, reasons: [message] }) },
  { name: "mark printed", suffix: ". This workbook cannot be marked printed.", view: () => createElement(MarkWorkbook, { workbookId: "book", to: "printed", number: 2 }), response: (message: string) => ({ ok: false, reason: message }) },
  { name: "ship", suffix: ". This workbook cannot be marked shipped.", view: () => createElement(MarkWorkbook, { workbookId: "book", to: "shipped", number: 2 }), response: (message: string) => ({ ok: false, reason: message }) },
];
for (const action of actions) {
  it.each(states)(`${action.name} shows the complete action-specific refusal: %s`, async (state) => {
    const message = state + action.suffix;
    f.fetch.mockResolvedValue(Response.json(action.response(message), { status: 409 }));
    await act(async () => root.render(action.view()));
    await act(async () => container.querySelector("button")!.click());
    const alert = container.querySelector('[role="alert"]')!;
    if (action.name === "approve") expect(alert.querySelector("li")?.textContent).toBe(message);
    else expect(alert.textContent).toBe(message);
    expect(alert.textContent).not.toContain("being deleted");
    expect(f.push).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
  });
}
