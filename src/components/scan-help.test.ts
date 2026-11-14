// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanHelp } from "./scan-help";
let root: Root, host: HTMLDivElement;
const render = async (parent = "family", checks = true, marking = true, mode: "phone" | "desktop" = "phone") => {
  await act(async () => root.render(createElement(ScanHelp, { key: parent, parent, checks, marking, mode })));
};
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
  await act(async () => { button.focus(); button.click(); });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("offers without taking focus, persists dismissal across remounts, and always permits reopening", async () => {
  await render(); expect(host.textContent).toContain("New to scanning?"); expect(host.querySelector("dialog")).toBeNull();
  await click("Not now"); expect(document.activeElement?.textContent).toBe("How scanning works");
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(host.textContent).not.toContain("New to scanning?");
  await click("How scanning works"); expect(host.querySelector("dialog")?.open).toBe(true);
  expect(document.activeElement?.textContent).toBe("How scanning works");
  await click("Close instructions"); expect(document.activeElement?.textContent).toBe("How scanning works");
});
it("keeps dismissal across feature changes, but scopes it to the parent", async () => {
  await render(); await click("Not now"); await render("family", false, false);
  expect(host.textContent).not.toContain("New to scanning?");
  await render("other"); expect(host.textContent).toContain("New to scanning?");
});
it("explains checks, sending, results and retakes when available, and Escape returns focus", async () => {
  await render(); await click("How scanning works");
  expect(host.textContent).toContain("Send pages for marking"); expect(host.textContent).toContain("Page history");
  expect(host.textContent).toContain("team mark"); expect(host.textContent).toContain("bottom");
  const dialog = host.querySelector("dialog")!;
  await act(async () => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
  expect(host.querySelector("dialog")).toBeNull(); expect(document.activeElement?.textContent).toBe("How scanning works");
});
it("does not offer unavailable sending/results, and desktop tells parents to add and retake on a phone", async () => {
  await render("family", false, false, "desktop"); await click("How scanning works");
  expect(host.textContent).not.toContain("Send pages for marking"); expect(host.textContent).not.toContain("Page history");
  expect(host.textContent).toContain("phone"); expect(host.textContent).toContain("not available");
  expect(host.textContent).toContain("replace it");
});
it("survives blocked storage and remembers dismissal for this mounted visit", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  await render(); await click("Not now"); await render(); expect(host.textContent).not.toContain("New to scanning?");
  await click("How scanning works"); expect(host.querySelector("dialog")?.open).toBe(true);
});
