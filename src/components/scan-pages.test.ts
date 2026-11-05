// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props); } }));
// The prepared photo carries the file's name, so the fake server knows which page it shows.
vi.mock("@/lib/scan-photo-browser", () => ({ prepareScanPhoto: async (file: File) => new Blob([file.name]) }));
import { ScanPages } from "./scan-pages";

// A fake server: Day 4 has pages p10 to p13. A photo named "p11.jpg" shows page p11; "junk.jpg" has no page code;
// "two-p12.jpg" shows two sheets, which the check refuses.
type Photo = { id: string; pageId: string; workbookId: string; book: number; pageNumber: number; state: "pending" | "saved"; check: string; reason: string | null; sentAt: string | null; createdAt: string };
const PAGES = [10, 11, 12, 13].map((n, i) => ({ id: `p${n}`, workbookId: "book", book: 1, pageNumber: n, day: "Day 4", pageOfDay: i + 1, pagesInDay: 4 }));
let root: Root, host: HTMLDivElement;
let checks: boolean, acknowledged: boolean;
let photos: Map<string, Photo & { two: boolean }>;
let uploading: number, overlap: boolean;
const calls: string[] = [];

const buttons = () => [...document.querySelectorAll("button")];
const button = (text: string) => buttons().find((b) => b.textContent === text || b.getAttribute("aria-label") === text);
const settle = async () => { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async () => { await act(async () => root.render(createElement(ScanPages, { childrenList: [{ id: "child", first_name: "Leah" }], parent: "parent", noticeAcknowledged: acknowledged }))); await settle(); };
const choose = async (input: "camera" | "library", ...names: string[]) => {
  const el = host.querySelector<HTMLInputElement>(input === "camera" ? "input[capture]" : "input[multiple]")!;
  Object.defineProperty(el, "files", { configurable: true, value: names.map((n) => new File(["x"], n, { type: "image/jpeg" })) });
  await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
};
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  checks = true; acknowledged = true; photos = new Map(); uploading = 0; overlap = false; calls.length = 0;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"; calls.push(`${method} ${path}`);
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (path === "/api/account/scans/notice") { acknowledged = true; return Response.json({ acknowledged: true }); }
    if (path.startsWith("/api/account/scans?child=")) {
      return Response.json({ checks, pages: PAGES, photos: [...photos.values()].map(({ two, ...p }) => { void two; return p; }) });
    }
    if (path === "/api/account/scans" && method === "POST") return Response.json({ state: "reserved", id: JSON.parse(String(init!.body)).id });
    if (path === "/api/account/scans/send") {
      const ids: string[] = JSON.parse(String(init!.body)).ids;
      for (const pid of ids) { const p = photos.get(pid); if (p && p.check === "ready" && p.state === "saved") p.sentAt = "2026-11-05T12:00:00Z"; }
      return Response.json({ sent: [...photos.values()].filter((p) => p.sentAt && ids.includes(p.id)).map((p) => p.id) });
    }
    if (path.endsWith("/image")) return new Response(new Blob(["private photo"]));
    if (path.endsWith("/preview") && id) {
      const p = photos.get(id)!;
      p.check = p.two ? "refused" : "ready"; p.reason = p.two ? "ambiguous-page" : null;
      return Response.json({ preview: p.two ? { status: "refused", reason: "ambiguous-page" } : { status: "ready", straight: { part: "straight", width: 1, height: 1 }, crops: [], notSupported: [] } });
    }
    if (method === "PUT" && id) {
      uploading++; if (uploading > 1) overlap = true;
      await new Promise((r) => setTimeout(r, 1));
      uploading--;
      const name = await (init!.body as Blob).text();
      const page = PAGES.find((p) => name.includes(p.id));
      if (!page) return Response.json({ error: "qr" }, { status: 422 });
      if ([...photos.values()].some((p) => p.pageId === page.id)) return Response.json({ error: "duplicate" }, { status: 422 });
      photos.set(id, { id, pageId: page.id, workbookId: "book", book: 1, pageNumber: page.pageNumber, state: "pending", check: checks ? "checking" : "none", reason: null, sentAt: null, createdAt: `2026-11-05T10:00:0${photos.size}Z`, two: name.startsWith("two") });
      return Response.json({ photo: { id, state: "pending" } });
    }
    if (method === "POST" && id) { photos.get(id)!.state = "saved"; return Response.json({ photo: { id, state: "saved" } }); }
    if (method === "DELETE" && id) { photos.delete(id); return Response.json({ state: "deleted" }); }
    return Response.json({ photo: id ? { id, state: photos.get(id)?.state } : null });
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("starts with the tips, Choose photos and Start scanning, and shows the photo notice once before the first photo", async () => {
  acknowledged = false;
  await render();
  expect(text()).toContain("Fold the book back, so only one page shows.");
  expect(button("Choose photos")).toBeDefined();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  const opened = vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Start scanning")!.click());
  expect(opened).not.toHaveBeenCalled();
  expect(text()).toContain("Before you take a photo");
  await act(async () => button("Got it")!.click()); await settle();
  expect(opened).toHaveBeenCalledOnce();
  expect(acknowledged).toBe(true);
});

it("takes several chosen photos one at a time, saves each with no confirm, and groups them by day with the gaps", async () => {
  const logged = vi.spyOn(console, "error");
  await render();
  await choose("library", "p10.jpg", "p12.jpg", "p13.jpg");
  expect(overlap).toBe(false);
  expect(calls.filter((c) => c.startsWith("PUT"))).toHaveLength(3);
  expect([...photos.values()].every((p) => p.state === "saved")).toBe(true);
  expect(button("Save this page")).toBeUndefined();
  expect(text()).toContain("Day 4");
  expect(text()).toContain("No photo yet: page 2");
  expect(text()).toContain("3 photos. 3 pages are ready to send.");
  expect(button("Send 3 pages for marking")).toBeDefined();
  expect(logged.mock.calls.filter(([m]) => String(m).includes('unique "key"'))).toEqual([]);
});

it("does not ask for another photo of a page that already has one, and focus never lands on Delete", async () => {
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  await choose("library", "copy-p10.jpg");
  expect(text()).toContain("Already has a photo");
  expect(button("Take the photo again")).toBeUndefined();
  await act(async () => button("Page 1: Ready")!.click()); await settle();
  expect(document.activeElement?.textContent).toBe("Close");
});

it("keeps a refused photo first with its reason while the other pages go on, and Send counts only ready pages", async () => {
  await render();
  await choose("library", "junk.jpg", "p10.jpg", "two-p11.jpg");
  expect(text()).toContain("2 pages need another photo");
  expect(text()).toContain("Not a workbook page");
  expect(text()).toContain("Two pages");
  expect(text()).toContain("Unknown page");
  expect(button("Send this page for marking")).toBeDefined();
  await act(async () => button("Send this page for marking")!.click()); await settle();
  const sent = calls.find((c) => c === "POST /api/account/scans/send");
  expect(sent).toBeDefined();
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).toContain("1 page sent for marking.");
  expect(text()).toContain("Sent for marking");
  // The refused pages stay in the stack.
  expect(text()).toContain("2 pages need another photo");
});

it("retakes a refused page: the camera opens in the tap, and the old photo goes only once a new one is chosen", async () => {
  await render();
  await choose("library", "two-p11.jpg");
  const old = [...photos.keys()][0];
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  const opened = vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Take the photo again")!.click());
  expect(opened).toHaveBeenCalledOnce();
  expect(photos.has(old)).toBe(true);
  await choose("camera", "p11.jpg");
  expect(calls.indexOf(`DELETE /api/account/scans/${old}`)).toBeGreaterThan(-1);
  expect(photos.has(old)).toBe(false);
  expect([...photos.values()].map((p) => [p.pageId, p.check])).toEqual([["p11", "ready"]]);
  expect(text()).toContain("We can read this page.");
});

it("asks for no check and offers no Send unless the server says this family has checks", async () => {
  checks = false;
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(calls.filter((c) => c.includes("/preview"))).toEqual([]);
  expect(text()).toContain("2 photos saved.");
  expect(buttons().some((b) => /for marking/.test(b.textContent ?? ""))).toBe(false);
});
