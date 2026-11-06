// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminParentDashboard } from "@/components/admin-parent-dashboard";
import { previewSelection } from "@/lib/admin-parent-dashboard";

const calls = vi.hoisted(() => ({ replace: vi.fn(), render: vi.fn(() => '<html><body><p>Static parent content</p></body></html>') }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: calls.replace }) }));
vi.mock("@/components/admin-parent-preview", () => ({ renderParentPreview: calls.render }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const draw = async (query: Record<string, string>) => { await act(async () => root.render(createElement(AdminParentDashboard, { selection: previewSelection(query) }))); };
const change = async (label: string, value: string) => {
  const field = [...host.querySelectorAll("label")].find(l => l.firstChild?.textContent === label)?.querySelector("select");
  if (!field) throw new Error(`Missing ${label}`);
  await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); });
};

it("preserves view, scenario, family, child and size in navigation and safely resets a scenario for a new view", async () => {
  await draw({ view: "plan", scenario: "restart_review", size: "phone", family: "two", child: "second" });
  await change("Screen size", "tablet");
  const url = new URL(calls.replace.mock.calls.at(-1)![0], "https://unicalearning.com");
  expect(Object.fromEntries(url.searchParams)).toEqual({ view: "plan", scenario: "restart_review", size: "tablet", family: "two", child: "second" });
  await change("View", "report");
  expect(new URL(calls.replace.mock.calls.at(-1)![0], url.origin).searchParams.get("scenario")).toBe("choose");
});

it("uses a sandbox with no script, form, account or top-navigation permission", async () => {
  await draw({ view: "overview", scenario: "active" });
  const frame = host.querySelector("iframe");
  expect(frame).not.toBeNull();
  expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
  expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(frame?.getAttribute("src")).toBeNull();
  expect(frame?.getAttribute("srcdoc")).toContain("Static parent content");
  expect(frame?.title).toContain("Read-only");
  expect(calls.render).toHaveBeenCalledTimes(1);
});
