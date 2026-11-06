// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbookEmails } from "@/components/workbook-emails";
import type { WorkbookEmailRecord } from "@/lib/workbook-email";

const f = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: f.refresh }) }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", f.fetch);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const props = { cardId: "child-card", parentName: "Priya", parentEmail: "parent@example.invalid", childName: "Asha", records: [] as WorkbookEmailRecord[], observedAt: 0, workbookNumber: 7 };
const button = (text: string) => {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!found) throw Error(`Missing button: ${text}`);
  return found;
};
async function click(text: string) { await act(async () => button(text).click()); }

it("previews ready and hand delivery before sending the stored workbook number", async () => {
  f.fetch.mockResolvedValue(Response.json({ status: "sent" }));
  await act(async () => root.render(createElement(WorkbookEmails, props)));
  expect(container.querySelector('input[type="number"]')).toBeNull();
  await click("Workbook ready");
  expect(container.querySelector('[aria-label="Email preview"]')?.textContent).toContain("Your workbook is ready");
  expect(f.fetch).not.toHaveBeenCalled();
  await click("Send workbook ready email");
  expect(button("Workbook ready").disabled).toBe(true);
  await click("Hand delivery");
  expect(container.querySelector('[aria-label="Email preview"]')?.textContent).toContain("on its way by hand delivery");
  await click("Send delivery email");
  expect(f.fetch.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
    { kind: "ready", workbookNumber: 7, delivery: null }, { kind: "dispatch", workbookNumber: 7, delivery: { method: "hand" } },
  ]);
  expect(f.fetch.mock.calls.every(([url]) => url === "/api/admin/cards/child-card/workbook-email")).toBe(true);
  expect(button("Courier").disabled).toBe(true);
  expect(button("Hand delivery").disabled).toBe(true);
});

it("requires courier tracking and clears a courier preview when a field changes", async () => {
  await act(async () => root.render(createElement(WorkbookEmails, props)));
  await click("Courier");
  expect(button("Preview courier email").disabled).toBe(true);
  const inputs = [...container.querySelectorAll("input")];
  for (const [index, text] of ["Carrier", "ABC123"].entries()) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], text);
      inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await click("Preview courier email");
  expect(container.querySelector('[aria-label="Email preview"]')?.textContent).toContain("Tracking number: ABC123");
  expect(f.fetch).not.toHaveBeenCalled();
});

it("holds both delivery buttons after a lost response, and respects persisted dispatches", async () => {
  f.fetch.mockRejectedValue(Error("Lost"));
  await act(async () => root.render(createElement(WorkbookEmails, props)));
  await click("Hand delivery"); await click("Send delivery email");
  expect(button("Courier").disabled).toBe(true);
  expect(button("Hand delivery").disabled).toBe(true);
  expect(container.textContent).toContain("Reload the page");
  expect(f.fetch).toHaveBeenCalledTimes(1);
});

it("does not offer ready or a second delivery after a persisted dispatch", async () => {
  const sent: WorkbookEmailRecord = { id: "email", kind: "dispatch", workbook_number: 7, status: "sent", claimed_at: null, sent_at: null, delivery: { method: "hand" }, subject: null, text_body: null };
  await act(async () => root.render(createElement(WorkbookEmails, { ...props, records: [sent] })));
  for (const name of ["Workbook ready", "Hand delivery", "Courier"]) expect(button(name).disabled).toBe(true);
});

it.each(["ready", "dispatch"] as const)("permits a busy %s retry only after refreshed data confirms a definite refusal", async (kind) => {
  const row: WorkbookEmailRecord = { id: "email", kind, workbook_number: 7, status: "failed", claimed_at: null, sent_at: null, delivery: {}, subject: null, text_body: null };
  const records = [row];
  const action = kind === "ready" ? "Workbook ready" : "Hand delivery";
  const confirm = kind === "ready" ? "Send workbook ready email" : "Send delivery email";
  f.fetch.mockResolvedValueOnce(Response.json({ status: "busy" })).mockResolvedValueOnce(Response.json({ status: "sent" }));
  await act(async () => root.render(createElement(WorkbookEmails, { ...props, records })));
  await click(action); await click(confirm);
  expect(button(action).disabled).toBe(true);
  // The failed row from before the busy response is insufficient evidence for a retry.
  await act(async () => root.render(createElement(WorkbookEmails, { ...props, records })));
  expect(button(action).disabled).toBe(true);
  for (const status of ["sending", "unknown", "sent"] as const) {
    await act(async () => root.render(createElement(WorkbookEmails, { ...props, records: [{ ...row, status }] })));
    expect(button(action).disabled).toBe(true);
  }
  await act(async () => root.render(createElement(WorkbookEmails, { ...props, records: [{ ...row }] })));
  expect(button(action).disabled).toBe(false);
  if (kind === "dispatch") expect(button("Courier").disabled).toBe(false);
  await click(action); await click(confirm);
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(button(action).disabled).toBe(true);
  // A confirmed send stays held even if an older failed snapshot arrives afterward.
  await act(async () => root.render(createElement(WorkbookEmails, { ...props, records: [{ ...row }] })));
  expect(button(action).disabled).toBe(true);
});
