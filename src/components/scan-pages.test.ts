// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props); } }));
vi.mock("@/lib/scan-photo-browser", () => ({ prepareScanPhoto: async () => new Blob(["normalized"]) }));
import { ScanPages } from "./scan-pages";
let root: Root, host: HTMLDivElement;
let acknowledged: boolean, saved: boolean, deleted: boolean;
let releaseDelete: (() => void) | null;
let holdDelete: boolean;
const calls: string[] = [];
const photo = () => ({ id: "photo-1", child_id: "child", child: "Alex", book: 1, day: "Day 1", page: 3, state: saved ? "saved" : "pending", expires_at: "2027-01-01T00:00:00Z" });
const button = (text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text)!;
const render = async (seen = acknowledged) => act(async () => root.render(createElement(ScanPages, { childrenList: [{ id: "child", first_name: "Alex" }], parent: "parent", noticeAcknowledged: seen })));
const click = (text: string) => act(async () => button(text).click());
const choose = () => act(async () => {
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["photo"], "page.jpg", { type: "image/jpeg" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  acknowledged = false; saved = false; deleted = false; releaseDelete = null; holdDelete = false; calls.length = 0;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"; calls.push(`${method} ${path}`);
    if (path === "/api/account/scans/notice") { acknowledged = true; return Response.json({ acknowledged: true }); }
    if (path.includes("?child=")) return Response.json({ photos: deleted ? [] : [photo()] });
    if (path.endsWith("/image")) return new Response(new Blob(["private photo"]));
    if (method === "DELETE") { if (holdDelete) await new Promise<void>(resolve => { releaseDelete = resolve; }); deleted = true; return Response.json({ state: "deleted" }); }
    if (path === "/api/account/scans") return Response.json({ state: "reserved", id: "photo-1" });
    if (method === "PUT") { deleted = false; return Response.json({ photo: photo() }); }
    if (method === "POST") { saved = true; acknowledged = true; return Response.json({ photo: photo() }); }
    return Response.json({ photo: photo() });
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows the first notice, remembers acknowledgement, and can reopen the full text", async () => {
  await render(); expect(host.textContent).toContain("Before you take a photo");
  expect(host.textContent).toContain("Take a photo of each finished page. Later, we'll use it to mark your child's work.");
  await click("Got it"); expect(acknowledged).toBe(true); expect(host.textContent).not.toContain("Before you take a photo");
  expect(host.textContent).toContain("Photos are private and kept for 90 days.");
  await click("More about photos"); expect(host.textContent).toContain("Before you take a photo");
  await click("Close photo details"); expect(host.textContent).not.toContain("Before you take a photo");
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(host.textContent).not.toContain("Before you take a photo");
});

it("saving the first photo suppresses the notice on the next capture", async () => {
  await render(); await choose(); await click("Save this page"); await click("Another page");
  expect(host.textContent).toContain("Photos are private and kept for 90 days.");
  expect(host.textContent).not.toContain("Before you take a photo");
});

it("opens the picker in the retake click and waits for server discard before replacing the photo", async () => {
  await render(true); await choose();
  expect(button("Discard photo")).toBeUndefined(); expect(button("Another page")).toBeUndefined();
  expect(button("Save this page")).toBeDefined();
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  const pickerClick = vi.spyOn(input, "click").mockImplementation(() => { calls.push("picker opened"); });
  holdDelete = true;
  await click("Take a different photo");
  expect(pickerClick).toHaveBeenCalledOnce(); expect(deleted).toBe(false);
  const uploadsBefore = calls.filter(x => x.startsWith("PUT")).length;
  await choose(); expect(calls.filter(x => x.startsWith("PUT"))).toHaveLength(uploadsBefore);
  await act(async () => { releaseDelete!(); });
  expect(calls.filter(x => x.startsWith("PUT"))).toHaveLength(uploadsBefore + 1);
  expect(host.textContent).toContain("Confirm this page");
});
