// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
const context = vi.hoisted(() => ({ auth: null as null | ((_event: string, session: { user: { id: string } } | null) => void), prepare: null as null | (() => Promise<Blob>), code: null as null | "read" | "unread", encodings: [] as number[] }));
vi.mock("@/lib/supabase-browser", () => ({
  browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof context.auth) => {
    context.auth = callback;
    return { data: { subscription: { unsubscribe() {} } } };
  } } }),
}));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props); } }));
// The prepared photo carries the file's name, so the fake server knows which page it shows.
vi.mock("@/lib/scan-photo-browser", () => ({
  prepareScanPhoto: async (file: File, encoding?: { maxSide: number }) => { context.encodings.push(encoding?.maxSide ?? 0); return context.prepare ? context.prepare() : new Blob([file.name]); },
  phoneCodeCheck: async () => context.code ?? null, scanThumbnail: async () => null,
  PHOTO_ENCODING: { maxSide: 2800, qualities: [0.9] }, SMALLER_ENCODING: { maxSide: 2000, qualities: [0.75] },
}));
import { CAPTURE_CLASS, CAPTURE_ENTRY, PICK_RETURN_MS, ScanPages } from "./scan-pages";
import { refusalCopy } from "@/lib/scan-stack";

// A fake server: Day 4 has pages p10 to p13. A photo named "p11.jpg" shows page p11; "junk.jpg" has no page code;
// "two-p12.jpg" shows two sheets, which the check refuses.
type Photo = { id: string; pageId: string; workbookId: string; book: number; pageNumber: number; state: "pending" | "saved"; check: string; reason: string | null; sentAt: string | null; createdAt: string; marks?: unknown };
const PAGES = [10, 11, 12, 13].map((n, i) => ({ id: `p${n}`, workbookId: "book", book: 1, pageNumber: n, day: "Day 4", pageOfDay: i + 1, pagesInDay: 4 }));
// Earlier days of the same book, before Day 4, for the strip's ‹ and › (2026-11-14). Empty unless a test sets them.
let earlierPages: typeof PAGES = [];
const allBookPages = () => [...earlierPages, ...PAGES];
let root: Root, host: HTMLDivElement;
let checks: boolean, acknowledged: boolean;
let photos: Map<string, Photo & { two: boolean }>;
let uploading: number, mostAtOnce: number;
// While true, every admission answers busy, as the server does when the family has no room.
let full: boolean;
// Admission ids in order; how many admissions commit and then lose their answer; how many saves fail; which ids' leases ended.
let admitted: string[], loseAdmissions: number, saveFailures: number, expired: Set<string>;
// Uploads that land and lose their answer; status answers lost; the list down; the children on the page; the ids released.
let losePuts: number, loseStatus: boolean, listDown: boolean, kids: { id: string; first_name: string }[], released: string[];
const calls: string[] = [];
// How many sent pages the fake Send says marking started on; null: an answer from before the field existed.
let marking: number | null;
// While set, every upload waits for it: a photo stays sending.
let putGate: Promise<void> | null;
// How long the Undo holds a page that passed (#915): long by default, so a test sends only when it says so.
let undoMs: number;
// A sibling whose book the next upload's code belongs to (#915), and whether marking is open in the list.
let filedTo: { child_id: string; child: string } | null, markingOn: boolean;
// Children whose Workbooks page shows their page history (the server decides, src/lib/workbooks-page-server.ts).
let allPages: string[];
// The holds the page wrote on the server (#3): `{ ids, seconds }`, or `{ ids, undo: true }`.
let holds: { ids: string[]; seconds?: number; undo?: boolean }[];
// How long a duplicate's note shows (#4): long by default. Hold requests that fail before one succeeds.
let duplicateMs: number, holdFailures: number, captureRenewMs: number;

const buttons = () => [...document.querySelectorAll("button")];
const button = (text: string) => buttons().find((b) => b.textContent === text || b.getAttribute("aria-label") === text);
const settle = async () => { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async () => { await act(async () => root.render(createElement(ScanPages, { childrenList: kids, parent: "parent", noticeAcknowledged: acknowledged, undoMs, allPages, duplicateMs, captureRenewMs }))); await settle(); };
const choose = async (input: "camera" | "library", ...names: string[]) => {
  const el = host.querySelector<HTMLInputElement>(input === "camera" ? "input[capture]" : "input[multiple]")!;
  Object.defineProperty(el, "files", { configurable: true, value: names.map((n) => new File(["x"], n, { type: "image/jpeg" })) });
  await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
};
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  marking = null; putGate = null; undoMs = 60_000; filedTo = null; markingOn = false; earlierPages = []; allPages = ["child"]; holds = []; context.encodings = []; duplicateMs = 60_000; holdFailures = 0; captureRenewMs = 270_000;
  try { localStorage.setItem("unica.scan-tips.v1:parent", "seen"); localStorage.removeItem("unica.scan-undone.v1:parent"); } catch {}
  context.auth = null; context.prepare = null; context.code = null; checks = true; acknowledged = true; photos = new Map(); uploading = 0; mostAtOnce = 0; full = false; calls.length = 0;
  admitted = []; loseAdmissions = 0; saveFailures = 0; expired = new Set();
  losePuts = 0; loseStatus = false; listDown = false; kids = [{ id: "child", first_name: "Leah" }]; released = [];
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"; calls.push(`${method} ${path}`);
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (path === "/api/account/scans/notice") { acknowledged = true; return Response.json({ acknowledged: true }); }
    if (path.startsWith("/api/account/scans?child=")) {
      if (listDown) return Response.json({ error: "unavailable" }, { status: 503 });
      if (path.includes("child=other")) return Response.json({ checks, pages: PAGES, photos: [] });
      return Response.json({ checks, marking: markingOn, pages: allBookPages(), photos: [...photos.values()].map(({ two, ...p }) => { void two; return p; }) });
    }
    if (path === "/api/account/scans" && method === "POST") {
      const asked: string = JSON.parse(String(init!.body)).id;
      admitted.push(asked);
      if (full) return Response.json({ error: "busy" }, { status: 429 });
      if (loseAdmissions > 0) { loseAdmissions--; throw new TypeError("the answer was lost"); }
      return Response.json({ state: photos.get(asked)?.state ?? "reserved", id: asked });
    }
    if (path === "/api/account/scans/hold") {
      const body = JSON.parse(String(init!.body));
      if (holdFailures > 0) { holdFailures--; return Response.json({ error: "unavailable" }, { status: 503 }); }
      holds.push(body);
      const unsent = (body.ids as string[]).filter((pid) => !photos.get(pid)?.sentAt);
      return Response.json(body.undo || body.release ? { released: unsent } : { held: unsent });
    }
    if (path === "/api/account/scans/send") {
      const ids: string[] = JSON.parse(String(init!.body)).ids;
      for (const pid of ids) { const p = photos.get(pid); if (p && p.check === "ready" && p.state === "saved") p.sentAt = "2026-11-05T12:00:00Z"; }
      const sent = [...photos.values()].filter((p) => p.sentAt && ids.includes(p.id)).map((p) => p.id);
      return Response.json(marking === null ? { sent } : { sent, marking: Math.min(marking, sent.length) });
    }
    // As the database does: only a reservation with no photo yet lets go.
    if (path.endsWith("/release") && id) {
      if (photos.has(id)) return Response.json({ error: photos.get(id)!.state }, { status: 409 });
      released.push(id); return Response.json({ state: "released" });
    }
    if (path.endsWith("/image")) return new Response(new Blob(["private photo"]));
    if (path.endsWith("/preview") && id) {
      const p = photos.get(id)!;
      p.check = p.two ? "refused" : "ready"; p.reason = p.two ? "ambiguous-page" : null;
      return Response.json({ preview: p.two ? { status: "refused", reason: "ambiguous-page" } : { status: "ready", straight: { part: "straight", width: 1, height: 1 }, crops: [], notSupported: [] } });
    }
    if (method === "PUT" && id) {
      if (expired.has(id)) return Response.json({ error: "expired" }, { status: 409 });
      uploading++; mostAtOnce = Math.max(mostAtOnce, uploading);
      if (putGate) await putGate;
      await new Promise((r) => setTimeout(r, 1));
      uploading--;
      const name = await (init!.body as Blob).text();
      const page = PAGES.find((p) => name.includes(p.id));
      if (!page) return Response.json({ error: "qr" }, { status: 422 });
      // As the server does (F5): a new photo of a page whose photo the check refused, never sent, replaces it.
      for (const [old, p] of photos) if (p.pageId === page.id && p.state === "saved" && p.check === "refused" && !p.sentAt) photos.delete(old);
      // A duplicate names its page, and its photo when that one is ready and not sent (#4); `?replace=` swaps that one.
      const first = [...photos.values()].find((p) => p.pageId === page.id);
      const replace = new URL(path, "https://x").searchParams.get("replace");
      if (first && replace === first.id && first.check === "ready" && !first.sentAt) photos.delete(first.id);
      else if (first) return Response.json({ error: "duplicate", page: page.pageNumber, ...(first.check === "ready" && !first.sentAt ? { replaceable: first.id } : {}) }, { status: 422 });
      photos.set(id, { id, pageId: page.id, workbookId: "book", book: 1, pageNumber: page.pageNumber, state: "pending", check: checks ? "checking" : "none", reason: null, sentAt: null, createdAt: `2026-11-05T10:00:0${photos.size}Z`, two: name.startsWith("two") });
      if (losePuts > 0) { losePuts--; throw new TypeError("the answer was lost"); }
      if (filedTo) { photos.delete(id); return Response.json({ photo: { id, state: "pending", ...filedTo, page: page.pageNumber } }); }
      return Response.json({ photo: { id, state: "pending" } });
    }
    if (method === "GET" && id && loseStatus) throw new TypeError("the answer was lost");
    if (method === "POST" && id && saveFailures > 0) { saveFailures--; return Response.json({ error: "refused" }, { status: 409 }); }
    if (method === "POST" && id) { photos.get(id)!.state = "saved"; return Response.json({ photo: { id, state: "saved" } }); }
    if (method === "DELETE" && id) { photos.delete(id); return Response.json({ state: "deleted" }); }
    return Response.json({ photo: id ? { id, state: photos.get(id)?.state } : null });
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); try { history.replaceState(null, ""); } catch {} });
/** A browser whose file input has no `cancel` event (older Safari): the focus return is the only sign of a cancel. */
const withoutCancel = () => {
  let owner: object | null = document.createElement("input");
  while (owner && !Object.prototype.hasOwnProperty.call(owner, "oncancel")) owner = Object.getPrototypeOf(owner);
  if (!owner) return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(owner, "oncancel")!;
  delete (owner as Record<string, unknown>).oncancel;
  return () => Object.defineProperty(owner, "oncancel", descriptor);
};

it("keeps both saved photos when the older concurrent list reply arrives last", async () => {
  checks = false;
  const server = global.fetch;
  let releaseOld!: () => void, releaseSecond!: () => void, captured = false;
  const oldReply = new Promise<void>((resolve) => { releaseOld = resolve; });
  const secondUpload = new Promise<void>((resolve) => { releaseSecond = resolve; });
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT" && await (init.body as Blob).text() === "p11.jpg") await secondUpload;
    const response = await server(path, init);
    if (path.startsWith("/api/account/scans?child=")) {
      const data = await response.clone().json();
      if (!captured && data.photos.length === 1) { captured = true; releaseSecond(); await oldReply; }
    }
    return response;
  });
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(captured).toBe(true);
  expect(text()).toContain("2 of 4 pages scanned");
  await act(async () => releaseOld()); await settle();
  expect(photos.size).toBe(2);
  expect(text()).toContain("2 of 4 pages scanned");
  expect(text()).not.toContain("1 of 4 pages scanned");
});

it("shows the four tips on the first visit only, then Scan pages opens the camera after the photo notice (#915)", async () => {
  acknowledged = false; localStorage.clear();
  await render();
  expect(text()).toContain("Fill the photo with the page");
  expect(text()).toContain("Snap all your pages, then tap Done");
  expect(text()).not.toMatch(/two pages/i);
  expect(button("Choose from your photos")).toBeDefined();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  const opened = vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(opened).not.toHaveBeenCalled();
  expect(text()).toContain("Before you take a photo");
  await act(async () => button("Got it")!.click()); await settle();
  expect(opened).toHaveBeenCalledOnce();
  expect(acknowledged).toBe(true);
  // The capture screen: the shutter, the photos button and Done.
  expect(text()).toContain("Take a photo of the first page.");
  expect(button("Take a photo")).toBeDefined();
  await choose("camera", "p10.jpg");
  expect(text()).toContain("1 photo taken");
  expect(host.querySelector('[aria-label="Photo 1, added"]')).not.toBeNull();
  await act(async () => button("Done")!.click()); await settle();
  // Every later visit opens on the day strip.
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(text()).not.toContain("Fill the photo with the page");
  expect(text()).toContain("Day 4");
});

it("opens the phone's photos for several at once from the capture screen", async () => {
  await render();
  await act(async () => button("Scan pages")!.click());
  const library = host.querySelector<HTMLInputElement>("input[multiple]")!;
  expect(library.accept).toContain("image/jpeg");
  const opened = vi.spyOn(library, "click").mockImplementation(() => {});
  await act(async () => button("Choose from Photos")!.click());
  expect(opened).toHaveBeenCalledOnce();
});

it("takes several chosen photos two at a time, saves each with no confirm, and groups them by day with the gaps", async () => {
  const logged = vi.spyOn(console, "error");
  await render();
  await choose("library", "p10.jpg", "p12.jpg", "p13.jpg");
  expect(mostAtOnce).toBeLessThanOrEqual(2);
  expect(calls.filter((c) => c.startsWith("PUT"))).toHaveLength(3);
  expect([...photos.values()].every((p) => p.state === "saved")).toBe(true);
  expect(button("Save this page")).toBeUndefined();
  expect(text()).toContain("Day 4");
  expect(button("Page 11, still to scan")).toBeDefined();
  expect(button("Page 10, ready, not sent yet")).toBeDefined();
  // Auto-send (#915): the pages that passed are held here with Undo; nothing is sent yet.
  expect(text()).toContain("3 pages send for marking in a moment");
  expect(button("Undo")).toBeDefined();
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(logged.mock.calls.filter(([m]) => String(m).includes('unique "key"'))).toEqual([]);
});

it("does not ask for another photo of a page that already has one, and focus never lands on Delete", async () => {
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  await choose("library", "copy-p10.jpg");
  expect(text()).toContain("Page 10 is already scanned.");
  expect(text()).not.toContain("need another photo");
  expect(button("Take the photo again")).toBeUndefined();
  await act(async () => button("Page 10, ready, not sent yet")!.click()); await settle();
  expect(document.activeElement?.textContent).toBe("Close");
});

it("closes an open photo with the corner Close button", async () => {
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  await act(async () => button("Page 10, ready, not sent yet")!.click()); await settle();
  const x = document.querySelector<HTMLButtonElement>(".scan-sheet-x");
  expect(x?.getAttribute("aria-label")).toBe("Close");
  expect(document.querySelector(".scan-sheet")).not.toBeNull();
  await act(async () => x!.click()); await settle();
  expect(document.querySelector(".scan-sheet")).toBeNull();
});

it("steps through the pages that need another photo while a page that passed is sent on its own after Undo's wait", async () => {
  undoMs = 1;
  await render();
  await choose("library", "junk.jpg", "p10.jpg", "two-p11.jpg");
  expect(text()).toContain("2 pages need another photo");
  expect(text()).toContain("Your photo");
  expect(text()).toContain("Like this");
  const unread = "We couldn't tell which page this is.";
  const first = text().includes(unread) ? unread : "More than one page";
  const second = first === unread ? "More than one page" : unread;
  expect(text()).not.toContain(second);
  await act(async () => button("Next (1 of 2)")!.click());
  expect(text()).toContain(second);
  await settle();
  expect(calls).toContain("POST /api/account/scans/send");
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).toContain("1 page sent for marking. Marking is not ready yet. The pages wait here.");
  // The refused pages stay.
  expect(text()).toContain("2 pages need another photo");
});

it("Undo keeps the pages here, unsent, and each can still be sent from its page", async () => {
  undoMs = 200;
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(text()).toContain("2 pages send for marking in a moment");
  await act(async () => button("Undo")!.click());
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); await settle();
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(text()).toContain("Not sent. The pages wait here.");
  expect(button("Send 2 pages for marking")).toBeDefined();
  await act(async () => button("Page 10, ready, not sent yet")!.click()); await settle();
  await act(async () => button("Send for marking")!.click()); await settle();
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
});

it("an Undo sticks on a later visit: the kept-back page is not held and sent again", async () => {
  undoMs = 5_000;
  await render();
  await choose("library", "p10.jpg");
  await act(async () => button("Undo")!.click()); await settle();
  await act(async () => root.unmount()); root = createRoot(host); await render();
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); }); await settle();
  expect(button("Undo")).toBeUndefined();
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(button("Send this page for marking")).toBeDefined();
});

it("keeps the Undo wait while the page is only hidden (the phone's camera is open), and keeps the page unsent when the page closes", async () => {
  await render();
  await choose("library", "p10.jpg");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); }); await settle();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(button("Undo")).toBeDefined();
  await act(async () => { window.dispatchEvent(new Event("pagehide")); }); await settle();
  expect(calls).not.toContain("POST /api/account/scans/send");
});

it.each([
  [3, "3 pages sent for marking. Marks show here when they are ready."],
  [2, "3 pages sent for marking. Marks show here when they are ready."],
  [0, "3 pages sent for marking. Marking is not ready yet. The pages wait here."],
])("the Send result says whether marking started (%s of 3 started)", async (started, words) => {
  marking = started;
  await render();
  await choose("library", "p10.jpg", "p11.jpg", "p12.jpg");
  await act(async () => button("Undo")!.click());
  await act(async () => button("Send 3 pages for marking")!.click()); await settle();
  expect(text()).toContain(words);
});

it.each([
  [1, "1 page sent for marking. Marks show here when they are ready."],
  [0, "1 page sent for marking. Marking is not ready yet. The pages wait here."],
])("the Send result for one page (%s started)", async (started, words) => {
  marking = started; undoMs = 1;
  await render();
  await choose("library", "p10.jpg");
  await settle();
  expect(text()).toContain(words);
});

it.each([0, 1, 2, 3])("no Send result says \"started\" or \"later\" (%s of 3 started)", async (started) => {
  marking = started;
  await render();
  await choose("library", "p10.jpg", "p11.jpg", "p12.jpg");
  await act(async () => button("Undo")!.click());
  await act(async () => button("Send 3 pages for marking")!.click()); await settle();
  // The whole page after Send, so the message cannot hide a promise anywhere on it.
  expect(text()).toContain("3 pages sent for marking.");
  expect(text()).not.toMatch(/started|later/i);
});

it("retakes a refused page: the camera opens in the tap, and the old photo goes only once a new one is chosen", async () => {
  await render();
  await choose("library", "two-p11.jpg");
  const old = [...photos.keys()][0];
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  const opened = vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Retake page 11")!.click());
  expect(opened).toHaveBeenCalledOnce();
  expect(photos.has(old)).toBe(true);
  await choose("camera", "p11.jpg");
  expect(calls.indexOf(`DELETE /api/account/scans/${old}`)).toBeGreaterThan(-1);
  expect(photos.has(old)).toBe(false);
  expect([...photos.values()].map((p) => [p.pageId, p.check])).toEqual([["p11", "ready"]]);
  expect(button("Page 11, ready, not sent yet")).toBeDefined();
});

it("asks for no check and offers no Send unless the server says this family has checks", async () => {
  checks = false;
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(calls.filter((c) => c.includes("/preview"))).toEqual([]);
  expect(text()).toContain("2 of 4 pages scanned");
  expect(button("Page 10, saved")).toBeDefined();
  expect(text()).not.toContain("sent for marking");
  expect(buttons().some((b) => /for marking/.test(b.textContent ?? ""))).toBe(false);
});

const seed = (id: string, pageId: string, fields: Partial<Photo> = {}) => {
  const page = allBookPages().find((p) => p.id === pageId)!;
  photos.set(id, { id, pageId, workbookId: "book", book: 1, pageNumber: page.pageNumber, state: "saved", check: "ready", reason: null, sentAt: null, createdAt: `2026-11-05T09:00:0${photos.size}Z`, two: false, ...fields });
};
const saves = (id: string) => calls.filter((c) => c === `POST /api/account/scans/${id}`).length;

it("reuses the reservation when Try again follows a lost admission answer, so no second upload slot is taken", async () => {
  loseAdmissions = 2;
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(admitted).toHaveLength(2);
  for (let tile = 0; tile < 2; tile++) {
    await act(async () => button("Try again")!.click());
    await settle();
  }
  // One id for each photo, however many times it was asked.
  expect(admitted).toHaveLength(4);
  expect(new Set(admitted).size).toBe(2);
  expect([...photos.keys()].sort()).toEqual([...new Set(admitted)].sort());
  expect(text()).toContain("2 of 4 pages scanned");
});

it("takes a new reservation when the kept one has ended, so the photo is not stuck on Try again", async () => {
  loseAdmissions = 1;
  await render();
  await choose("library", "p10.jpg");
  const lost = admitted[0];
  expired.add(lost);
  await act(async () => button("Try again")!.click());
  await settle();
  expect(admitted.slice(0, 2)).toEqual([lost, lost]);
  expect(new Set(admitted).size).toBe(2);
  expect(photos.has(lost)).toBe(false);
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).not.toContain("Not sent");
});

it("gives the slot back when a photo with a lost admission answer is deleted", async () => {
  loseAdmissions = 1;
  await render();
  await choose("library", "p10.jpg");
  await act(async () => button("Open your photo of Unknown page")!.click());
  await act(async () => button("Delete this photo")!.click());
  await settle();
  expect(calls).toContain(`DELETE /api/account/scans/${admitted[0]}`);
  // The parent asked for this delete: it is not the release path.
  expect(calls).not.toContain(`POST /api/account/scans/${admitted[0]}/release`);
});

it("asks to save again when a save fails after the upload, so the page reaches its check and Send", async () => {
  saveFailures = 1;
  await render();
  await choose("library", "p10.jpg");
  const id = [...photos.keys()][0];
  expect(saves(id)).toBe(2);
  expect(photos.get(id)?.state).toBe("saved");
  expect(photos.get(id)?.check).toBe("ready");
  expect(button("Page 10, ready, not sent yet")).toBeDefined();
});

it("retries a failed save of a photo left pending on the next refresh, and not in a tight loop", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    seed("left", "p10", { state: "pending", check: "checking" });
    saveFailures = 2;
    await render();
    expect(saves("left")).toBe(1);
    await act(async () => { vi.advanceTimersByTime(4000); }); await settle();
    expect(saves("left")).toBe(2);
    expect(photos.get("left")?.state).toBe("pending");
    await act(async () => { vi.advanceTimersByTime(4000); }); await settle();
    expect(saves("left")).toBe(3);
    expect(photos.get("left")?.state).toBe("saved");
    expect(photos.get("left")?.check).toBe("ready");
  } finally { vi.useRealTimers(); }
});

it("shows and deletes a sent photo when the only open page is one ready photo", async () => {
  seed("sent", "p10", { sentAt: "2026-11-05T08:00:00Z" });
  seed("ready", "p11");
  await render();
  expect(button("Page 11, ready, not sent yet")).toBeDefined();
  // No "Sent earlier" list (2026-11-14): the sent page opens from its strip tile.
  expect(text()).not.toContain("Sent earlier");
  const tile = button("Page 10, sent for marking");
  expect(tile).toBeDefined();
  await act(async () => tile!.click());
  // The sheet's own Delete: the one page's Delete sits behind the sheet.
  const inSheet = [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "Delete this photo") as HTMLButtonElement;
  await act(async () => inSheet.click());
  await settle();
  expect(photos.has("sent")).toBe(false);
  expect(photos.has("ready")).toBe(true);
});

/** The waits between status requests, without their seconds. */
const shortWaits = () => { const real = setTimeout; vi.stubGlobal("setTimeout", (run: () => void, ms?: number) => real(run, Math.min(ms ?? 0, 1))); };
const changeChild = async () => {
  const select = host.querySelector<HTMLSelectElement>(".scan-child select")!;
  select.value = "other";
  await act(async () => { select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
};
const twoChildren = () => { kids = [{ id: "child", first_name: "Leah" }, { id: "other", first_name: "Sam" }]; };

it("keeps a saved photo when the child changes after the upload landed and every answer about it was lost", async () => {
  shortWaits(); twoChildren(); losePuts = 1; loseStatus = true;
  await render();
  await choose("library", "p10.jpg");
  const id = admitted[0];
  // The next list found the photo and saved it.
  expect(photos.get(id)?.state).toBe("saved");
  await changeChild();
  expect(calls).not.toContain(`DELETE /api/account/scans/${id}`);
  expect(photos.get(id)?.state).toBe("saved");
});

it("shows a photo the list found once, with no refused entry left beside it", async () => {
  shortWaits(); losePuts = 1; loseStatus = true;
  await render();
  await choose("library", "p10.jpg");
  expect(photos.size).toBe(1);
  expect(text()).not.toContain("Not sent");
  expect(text()).toContain("1 of 4 pages scanned");
});

it("asks the server to release when the list is down too, and the server keeps the photo", async () => {
  shortWaits(); twoChildren();
  await render();
  listDown = true; losePuts = 1; loseStatus = true;
  await choose("library", "p10.jpg");
  const id = admitted[0];
  expect(text()).toContain("Not sent");
  await changeChild();
  expect(calls).toContain(`POST /api/account/scans/${id}/release`);
  expect(calls).not.toContain(`DELETE /api/account/scans/${id}`);
  expect(released).toEqual([]);
  expect(photos.get(id)?.state).toBe("pending");
});

it("releases only a reservation with no photo when the child changes, by the release path", async () => {
  twoChildren(); loseAdmissions = 1;
  await render();
  await choose("library", "p10.jpg");
  const id = admitted[0];
  await changeChild();
  expect(released).toEqual([id]);
  expect(calls).not.toContain(`DELETE /api/account/scans/${id}`);
});

it("account replacement during normalization sends no later admission, save or thumbnail", async () => {
  let resume!: (value: Blob) => void;
  context.prepare = () => new Promise<Blob>((resolve) => { resume = resolve; });
  await render(); await choose("library", "p11.jpg");
  expect(calls.filter((c) => c === "POST /api/account/scans")).toEqual([]);
  await act(async () => context.auth?.("SIGNED_IN", { user: { id: "new-parent" } }));
  await act(async () => resume(new Blob(["p11.jpg"]))); await settle();
  expect(calls.filter((c) => c === "POST /api/account/scans" || c.startsWith("PUT "))).toEqual([]);
  expect(host.textContent).toContain("Your account changed"); expect(host.querySelectorAll("img")).toHaveLength(0);
});
it("a held old-account upload response cannot save, refill the stack or start a second request", async () => {
  const original = globalThis.fetch; let resume!: (response: Response) => void;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") { calls.push(`PUT ${path}`); return new Promise<Response>((resolve) => { resume = resolve; }); }
    return original(path, init);
  });
  await render(); await choose("library", "p11.jpg"); expect(admitted).toHaveLength(1);
  await act(async () => context.auth?.("SIGNED_IN", { user: { id: "new-parent" } }));
  await act(async () => resume(Response.json({ photo: { id: admitted[0], state: "pending" } }))); await settle();
  expect(calls).not.toContain(`POST /api/account/scans/${admitted[0]}`);
  expect(host.textContent).toContain("Your account changed"); expect(host.querySelectorAll("img")).toHaveLength(0);
});

it("brings the tips back from How to scan, and says pages can go in any order", async () => {
  await render();
  await choose("library", "p10.jpg");
  expect(text()).not.toContain("Fill the photo with the page");
  await act(async () => button("How to scan")!.click());
  expect(text()).toContain("Fill the photo with the page");
  expect(text()).toContain("Pages can be scanned in any order.");
});

it("shows Checking, never Got it, while a page is checked (#915)", async () => {
  let open!: () => void;
  putGate = new Promise<void>((resolve) => { open = resolve; });
  await render();
  await choose("library", "p10.jpg");
  await act(async () => { open(); }); await settle();
  expect(text()).not.toContain("Got it");
});

it("keeps photos the server has no room for in their place, says so, and sends them when there is room", async () => {
  shortWaits();
  await render();
  await choose("library", "p10.jpg");
  full = true;
  await choose("library", "p11.jpg", "p12.jpg", "p13.jpg");
  // The tile says only Loading…; the dock says there is no room yet.
  expect(text()).toContain("There is no room for more photos yet");
  expect(text()).not.toContain("Waiting for room");
  expect(button("New photo: Loading…")).toBeDefined();
  expect(text()).not.toContain("Not sent");
  expect(photos.size).toBe(1);
  full = false;
  // The first page went for marking on its own; the waiting photos ask again and go.
  await settle(); await settle();
  expect(text()).not.toContain("There is no room for more photos yet");
  expect([...photos.values()].map((p) => p.pageId).sort()).toEqual(["p10", "p11", "p12", "p13"]);
});

it("without checks, a photo waiting for room says it goes on its own", async () => {
  shortWaits(); checks = false; full = true;
  await render();
  await choose("library", "p10.jpg");
  expect(text()).not.toContain("Waiting for room");
  expect(text()).toContain("There is no room for more photos yet. The waiting photo keeps its place and goes when there is room.");
  expect(text()).not.toContain("Not sent");
  full = false; await settle(); await settle();
  expect(photos.size).toBe(1);
});

it("a new photo in progress says only Loading…, never a code warning, and the server's refusal names the code (2026-11-14)", async () => {
  context.code = "unread";
  let open!: () => void;
  putGate = new Promise<void>((resolve) => { open = resolve; });
  await render();
  await choose("camera", "junk.jpg");
  expect(calls.some((c) => c.startsWith("PUT /api/account/scans/"))).toBe(true);
  expect(button("New photo: Loading…")).toBeDefined();
  expect(text()).not.toContain("Code may not read");
  expect([...document.querySelectorAll(".scan-tile-s")].map((e) => e.textContent)).toEqual(["Loading…"]);
  await act(async () => { open(); }); await settle();
  // The server read no code: the photo is refused with the plain refusal copy.
  expect(text()).not.toContain("Code not read");
  await act(async () => button("Open your photo of Unknown page")!.click()); await settle();
  expect(text()).toContain("We couldn't tell which page this is. Take the photo again with the whole page in view, including the small code in the bottom-left corner.");
  expect(text()).not.toMatch(/Code (may )?not read/);
});

it("says where a page went when its code filed it with a sibling's book (#915)", async () => {
  filedTo = { child_id: "sibling", child: "Aisha" };
  await render();
  await choose("library", "p12.jpg");
  expect(text()).toContain("Page 12 went to Aisha's pages.");
  expect(text()).not.toMatch(/another photo|not this child/i);
});

it("ends on today's marks: a score per page linking to its results, and the day's score (#915)", async () => {
  markingOn = true;
  const today = new Date().toISOString();
  seed("a", "p10", { sentAt: today, marks: { right: 7, scored: 8, total: 8, toPractise: 1, waiting: 0, complete: true } });
  seed("b", "p11", { sentAt: today, marks: { right: 10, scored: 11, total: 11, toPractise: 1, waiting: 0, complete: true } });
  seed("c", "p12", { sentAt: today, marks: null });
  await render();
  expect(text()).toContain("Leah got 17 of 19 right on today's pages · 1 page still marking");
  expect(text()).toContain("7 of 8 · 1 to practise");
  expect(text()).toContain("Marking…");
  expect(host.querySelector('a[href="/account/scan/results/a"]')).not.toBeNull();
  expect(button("Page 10, marked")).toBeDefined();
  expect(button("Page 12, marking")).toBeDefined();
  expect(text()).toContain("2 of 4 pages marked");
});

it("offers Send by hand when the automatic send fails, so a page is never stuck unsent (#915)", async () => {
  undoMs = 1;
  const server = global.fetch;
  let failSend = true;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/api/account/scans/send" && failSend) { calls.push("POST /api/account/scans/send"); return Response.json({ error: "unavailable" }, { status: 503 }); }
    return server(path, init);
  });
  await render();
  await choose("library", "p10.jpg");
  await settle();
  expect(text()).toContain("We could not send the pages. Try again.");
  failSend = false;
  await act(async () => button("Send this page for marking")!.click()); await settle();
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
});

it("tells a family with two children that any page goes to the right child, and says nothing for one child", async () => {
  try { localStorage.removeItem("unica.scan-tips.v1:parent"); } catch {}
  await render();
  expect(text()).toContain("Open the book flat");
  expect(text()).not.toContain("Scanning for");
  await act(async () => root.unmount()); root = createRoot(host);
  kids = [{ id: "child", first_name: "Leah" }, { id: "omar", first_name: "Omar" }];
  await render();
  expect(text()).toContain("Scanning for Leah and Omar?");
  expect(text()).toContain("Each one goes to the right child.");
});


it("does not start the send hold until Done, even when photos are already checked", async () => {
  undoMs = 10;
  await render();
  await act(async () => button("Scan pages")!.click());
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); }); await settle();
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(button("Undo")).toBeUndefined();
  await act(async () => button("Done")!.click());
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); }); await settle();
  expect(calls).toContain("POST /api/account/scans/send");
});

it("never automatically sends a photo whose photo check remains pending beyond two waits", async () => {
  undoMs = 5;
  const server = global.fetch;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const response = await server(path, init);
    if (path.endsWith("/preview")) return Response.json({ ...(await response.json()), photoCheck: { state: "pending" } });
    return response;
  });
  await render();
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); }); await settle();
  expect(calls).not.toContain("POST /api/account/scans/send");
  expect(button("Send this page for marking")).toBeDefined();
});

it("adds the glare tip to the first-visit tips and to How to scan", async () => {
  try { localStorage.removeItem("unica.scan-tips.v1:parent"); } catch {}
  await render();
  expect(text()).toContain("Keep your hand's shadow off the page. If you see a shiny patch, tilt the book or step to the side.");
  await act(async () => button("Choose from your photos")!.click());
  await choose("library", "p10.jpg");
  await act(async () => button("Done")!.click()); await settle();
  await act(async () => button("How to scan")!.click());
  expect(text()).toContain("If you see a shiny patch, tilt the book or step to the side.");
});

it("says the photo is checked as soon as it is taken, in the photo notice", async () => {
  acknowledged = false;
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(text()).toContain("We check each photo as soon as you take it. To do that, we send the whole page photo to an AI service. Your child's first name and the printed page code can be in the photo.");
  expect(text()).not.toContain("When you ask us to check it");
  expect(text()).toContain("We keep one private page photo for up to 90 days.");
});

it("asks to hold the phone closer, never says cut off, when a page with a read code could not be lined up", async () => {
  seed("cut", "p11", { check: "refused", reason: "marks-missing" });
  await render();
  expect(text()).toContain("Hold the phone closer so the page fills the photo, and tilt it away from the light.");
  expect(text()).not.toMatch(/cut off/i);
});

it("puts the page that needs another photo above the day, and the dock's main button retakes it (F5)", async () => {
  seed("bad", "p11", { check: "refused", reason: "corner-covered" });
  await render();
  const need = host.querySelector(".scan-need")!, strip = host.querySelector(".scan-strip")!;
  expect(need.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const dock = [...host.querySelectorAll<HTMLButtonElement>(".scan-dock button")];
  expect(dock[0].textContent).toBe("Retake page 11");
  expect(dock.map((b) => b.textContent)).toContain("Scan pages");
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => dock[0].click());
  await choose("camera", "p11.jpg");
  expect(calls).toContain("DELETE /api/account/scans/bad");
  expect([...photos.values()].map((p) => [p.pageId, p.check])).toEqual([["p11", "ready"]]);
  expect(host.querySelector(".scan-need")).toBeNull();
  expect([...host.querySelectorAll(".scan-dock button")].map((b) => b.textContent)).not.toContain("Retake page 11");
});

it("a plain scan of a page that needs another photo replaces its photo, not refused as already scanned (F5)", async () => {
  seed("bad", "p11", { check: "refused", reason: "marks-missing" });
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await choose("camera", "p11.jpg");
  expect(host.querySelector('[aria-label="Photo 1, added"]')).not.toBeNull();
  await act(async () => button("Done")!.click()); await settle();
  expect(photos.has("bad")).toBe(false);
  expect(text()).not.toContain("Already has a photo");
  expect(host.querySelector(".scan-need")).toBeNull();
});

it("shows a photo that failed while offline as waiting for the connection, not as a bad photo, and sends it when back online (F3)", async () => {
  const server = global.fetch;
  let offline = false;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (offline && path !== "/api/account/scans?child=child") { calls.push(`offline ${path}`); throw new TypeError("offline"); }
    return server(path, init);
  });
  await render();
  offline = true;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  await act(async () => { window.dispatchEvent(new Event("offline")); }); await settle();
  expect(text()).toContain("You are offline. Keep this page open: your photos send when you are back online.");
  await choose("library", "p10.jpg");
  expect(host.querySelector(".scan-need")).toBeNull();
  expect(text()).not.toContain("needs another photo");
  expect(text()).not.toContain("Not sent");
  expect(text()).toContain("New photos");
  expect(text()).toContain("Waiting for connection");
  await act(async () => button("New photo: Waiting for connection")!.click()); await settle();
  expect(text()).toContain("This photo is waiting for a connection.");
  await act(async () => button("Close")!.click()); await settle();
  offline = false;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  await act(async () => { window.dispatchEvent(new Event("online")); }); await settle();
  expect(text()).not.toContain("Waiting for connection");
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
});

it("has no child picker on the tips or camera screens, and a small Showing switch on home (F4)", async () => {
  try { localStorage.removeItem("unica.scan-tips.v1:parent"); } catch {}
  kids = [{ id: "child", first_name: "Leah" }, { id: "other", first_name: "Sam" }];
  await render();
  expect(text()).toContain("Scanning for Leah and Sam?");
  expect(host.querySelector("select")).toBeNull();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(host.querySelector("select")).toBeNull();
  await act(async () => button("Done")!.click()); await settle();
  const pick = host.querySelector<HTMLSelectElement>(".scan-child select")!;
  expect(pick.closest("label")!.textContent).toContain("Showing:");
  expect(pick.selectedOptions[0].textContent).toBe("Leah");
});

it("gives a page held for Undo a clock, never the sent arrow, and keeps the arrow for a sent page (F9)", async () => {
  seed("sent", "p10", { sentAt: "2026-11-05T08:00:00Z" });
  seed("held", "p11");
  await render();
  const tile = (label: string) => button(label)!.querySelector(".scan-strip-glyph")!;
  expect(tile("Page 10, sent for marking").textContent).toBe("↑");
  expect(tile("Page 11, ready, not sent yet").textContent).not.toBe("↑");
  expect(tile("Page 11, ready, not sent yet").querySelector("svg circle")).not.toBeNull();
});

it("has no Page history on the scan screen: one See all pages link opens the child's Workbooks page history (#915)", async () => {
  markingOn = true;
  seed("a", "p10", { sentAt: new Date().toISOString(), marks: { right: 7, scored: 8, total: 8, toPractise: 1, waiting: 0, complete: true } });
  await render();
  expect(text()).not.toContain("Page history");
  expect(calls.some((c) => c.includes("/api/account/scans/history"))).toBe(false);
  const all = [...host.querySelectorAll("a")].filter((a) => a.textContent === "See all pages");
  expect(all).toHaveLength(1);
  expect(all[0].getAttribute("href")).toBe("/account/workbooks/child#page-history");
  expect([...host.querySelectorAll("a")].find((a) => a.textContent === "See all progress")?.getAttribute("href")).toBe("/account/workbooks/child#page-history");
  // Each of today's pages still links to its own results.
  expect(host.querySelector('a[href="/account/scan/results/a"]')).not.toBeNull();
});

it("shows no page history and no link for a child whose Workbooks page would not show it (2026-11-14)", async () => {
  markingOn = true; allPages = [];
  seed("a", "p10", { sentAt: new Date().toISOString(), marks: { right: 7, scored: 8, total: 8, toPractise: 1, waiting: 0, complete: true } });
  await render();
  expect(text()).not.toMatch(/See all pages|See all progress|Page history|Show:|Saved results stay/);
  expect(host.querySelector("#scan-history")).toBeNull();
  expect(host.querySelector("select")).toBeNull();
  expect(calls.some((c) => c.includes("/api/account/scans/history"))).toBe(false);
});

describe("the strip's ‹ and › step through the book's days (2026-11-14)", () => {
  const day = (n: number, numbers: number[]) => numbers.map((p, i) => ({ id: `p${p}`, workbookId: "book", book: 1, pageNumber: p, day: `Day ${n}`, pageOfDay: i + 1, pagesInDay: numbers.length }));
  const heading = () => host.querySelector(".scan-strip h2")!.textContent;
  const step = async (label: "Previous day" | "Next day") => { await act(async () => button(label)!.click()); await settle(); };
  const marks = { right: 3, scored: 4, total: 4, toPractise: 1, waiting: 0, complete: true };
  beforeEach(() => {
    markingOn = true;
    earlierPages = [...day(1, [1, 2]), ...day(2, [3, 4, 5]), ...day(3, [6, 7, 8, 9])];
    seed("d1", "p1", { sentAt: "2026-11-01T09:00:00Z", marks }); seed("d1b", "p2", { sentAt: "2026-11-01T09:00:00Z", marks });
    seed("d3", "p7", { sentAt: "2026-11-03T09:00:00Z", marks });
    seed("now", "p11", { sentAt: new Date().toISOString(), marks });
  });

  it("opens on the current day, steps back to Day 1 and stops there, and steps forward to the current day and stops", async () => {
    await render();
    expect(heading()).toBe("Day 4");
    expect((button("Next day") as HTMLButtonElement).disabled).toBe(true);
    expect((button("Previous day") as HTMLButtonElement).disabled).toBe(false);
    await step("Previous day");
    expect(heading()).toBe("Day 3");
    expect(host.querySelector(".scan-strip-count")!.textContent).toBe("1 of 4 pages marked");
    expect(button("Page 7, marked")).toBeDefined(); expect(button("Page 6, still to scan")).toBeDefined();
    expect(text()).not.toContain("Next: ");
    await step("Previous day"); await step("Previous day");
    expect(heading()).toContain("Day 1");
    expect(host.querySelector(".scan-strip-count")!.textContent).toBe("2 of 2 pages marked");
    expect((button("Previous day") as HTMLButtonElement).disabled).toBe(true);
    await step("Previous day");
    expect(heading()).toContain("Day 1");
    await step("Next day"); expect(heading()).toBe("Day 2");
    await step("Next day"); await step("Next day"); expect(heading()).toBe("Day 4");
    expect((button("Next day") as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens an earlier day's page results from its tile", async () => {
    await render();
    await step("Previous day");
    await act(async () => button("Page 7, marked")!.click()); await settle();
    expect(document.querySelector('.scan-sheet a[href="/account/scan/results/d3"]')?.textContent).toBe("View page results");
  });

  it("gives the arrows their accessible labels", async () => {
    await render();
    await step("Previous day"); expect(heading()).toBe("Day 3");
    expect(button("Previous day")!.getAttribute("aria-label")).toBe("Previous day");
    expect(button("Next day")!.getAttribute("aria-label")).toBe("Next day");
  });
});

it("shows no See all pages link while marking is closed, as the Workbooks page has no history then", async () => {
  await render();
  expect(text()).not.toContain("See all pages");
});

it("makes the capture screen full screen only while it is open (#915)", async () => {
  await render();
  const html = document.documentElement;
  expect(html.classList.contains(CAPTURE_CLASS)).toBe(false);
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(html.classList.contains(CAPTURE_CLASS)).toBe(true);
  await act(async () => button("Done")!.click()); await settle();
  expect(html.classList.contains(CAPTURE_CLASS)).toBe(false);
});

const onHome = () => !text().includes("Take a photo of the first page.") && button("Scan pages") !== undefined && !document.documentElement.classList.contains(CAPTURE_CLASS);

it("goes straight home when the camera is cancelled before the first photo: the cancel event (#915)", async () => {
  await render();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(text()).toContain("Take a photo of the first page.");
  await act(async () => { camera.dispatchEvent(new Event("cancel")); }); await settle();
  expect(onHome()).toBe(true);
});

it("goes straight home when the phone's photos close with no file and the browser sends no cancel: the focus return (#915)", async () => {
  const restore = withoutCancel();
  onTestFinished(restore);
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  vi.spyOn(host.querySelector<HTMLInputElement>("input[multiple]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await act(async () => button("Choose from Photos")!.click());
  // A focus with no leave first is not a return from the picker.
  await act(async () => { window.dispatchEvent(new Event("focus")); await new Promise((r) => setTimeout(r, PICK_RETURN_MS + 100)); }); await settle();
  expect(text()).toContain("Take a photo of the first page.");
  await act(async () => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); await new Promise((r) => setTimeout(r, PICK_RETURN_MS + 100)); }); await settle();
  expect(onHome()).toBe(true);
});

it("keeps the capture screen when a photo arrives after the focus return, and when a later pick is cancelled (#915)", async () => {
  await render();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await act(async () => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); });
  await choose("camera", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, PICK_RETURN_MS + 100)); }); await settle();
  expect(text()).toContain("1 photo taken");
  await act(async () => button("Take next page")!.click());
  await act(async () => { camera.dispatchEvent(new Event("cancel")); }); await settle();
  expect(text()).toContain("1 photo taken");
  expect(document.documentElement.classList.contains(CAPTURE_CLASS)).toBe(true);
});

it("shows the photos taken as a calm tray: a count, a thumbnail each, sending then added, and no large card (#915, 2026-11-14)", async () => {
  let open!: () => void;
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  expect(text()).toContain("Take a photo of the first page.");
  await choose("camera", "p10.jpg");
  expect(text()).toContain("Day 4 · 1 of 4");
  expect(text()).toContain("1 photo taken");
  expect(text()).toContain("Take the next page, or tap Done when you've finished.");
  putGate = new Promise<void>((resolve) => { open = resolve; });
  await choose("camera", "p11.jpg");
  // Still sending: a spinner, never a tick.
  expect(host.querySelector('[aria-label="Photo 2, sending"] .scan-spin')).not.toBeNull();
  await act(async () => { open(); }); await settle();
  putGate = null;
  await choose("camera", "p12.jpg");
  expect(text()).toContain("3 photos taken");
  expect(text()).toContain("Day 4 · 3 of 4");
  const shots = [...host.querySelectorAll(".scan-shots li")];
  expect(shots.map((li) => li.querySelector("[role=img]")?.getAttribute("aria-label"))).toEqual(["Photo 1, added", "Photo 2, added", "Photo 3, added"]);
  expect(shots.every((li) => li.querySelector("button") === null)).toBe(true);
  expect(host.querySelector(".scan-tray-card, .scan-tray-ph")).toBeNull();
  // Each control's accessible name holds its visible label (WCAG 2.5.3).
  expect(button("Take next page")?.textContent).toContain("Take next page");
  expect(button("Choose from Photos")?.hasAttribute("aria-label")).toBe(false);
});

it("shows no verdict while capturing, even when a check has already refused a photo (#915, 2026-11-14)", async () => {
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await choose("camera", "two-p12.jpg");
  await choose("camera", "junk.jpg");
  await choose("camera", "p10.jpg");
  await settle();
  // The server has already refused page 12, and the code of the second photo was not read.
  expect([...photos.values()].find((p) => p.pageId === "p12")?.check).toBe("refused");
  const tray = host.querySelector(".scan-tray")!.textContent ?? "";
  expect(tray).toContain("3 photos taken");
  expect(tray).not.toMatch(/retake|another photo|looks good|code not read|more than one page/i);
  expect(tray).not.toContain(refusalCopy("ambiguous-page").action);
  expect(tray).not.toContain("!");
  expect(buttons().some((b) => /retake|another photo/i.test(b.textContent ?? ""))).toBe(false);
  expect([...host.querySelectorAll(".scan-shots [role=img]")].map((e) => e.getAttribute("aria-label"))).toEqual(["Photo 1, added", "Photo 2, added", "Photo 3, added"]);
  expect(host.querySelector(".sr-only[aria-live]")?.textContent).toBe("Photo 3 added");
});

it("after Done, puts the refused page in the retake card at the top and starts the Undo for the page that passed (#915, 2026-11-14)", async () => {
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await choose("camera", "p10.jpg");
  await choose("camera", "two-p12.jpg");
  await settle();
  expect(host.querySelector(".scan-need")).toBeNull();
  await act(async () => button("Done")!.click()); await settle();
  const need = host.querySelector(".scan-need")!, strip = host.querySelector(".scan-strip")!;
  expect(need.textContent).toContain("1 page needs another photo");
  expect(need.textContent).toContain("Page 12");
  expect(need.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelector(".scan-dock button")?.textContent).toBe("Retake page 12");
  expect(text()).toContain("1 page sends for marking in a moment");
  expect(button("Undo")).toBeDefined();
});

it("a check that ends after Done moves its page into the retake card, with no reload (#915, 2026-11-14)", async () => {
  const server = global.fetch;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path.endsWith("/preview") && init?.method === "POST" && [...photos.values()].find((p) => path.includes(p.id))?.two) await gate;
    return server(path, init);
  });
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await choose("camera", "p10.jpg");
  await choose("camera", "two-p12.jpg");
  await act(async () => button("Done")!.click()); await settle();
  expect(button("Page 12, checking")).toBeDefined();
  expect(host.querySelector(".scan-need")).toBeNull();
  await act(async () => { finish(); }); await settle();
  expect(host.querySelector(".scan-need")?.textContent).toContain("Page 12");
  expect(button("Page 12, needs another photo")).toBeDefined();
  expect(host.querySelector(".scan-dock button")?.textContent).toBe("Retake page 12");
});

it("files photos taken in any order on their own pages (#915, 2026-11-14)", async () => {
  await render();
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
  await choose("camera", "p13.jpg");
  await choose("camera", "p10.jpg");
  await choose("camera", "p12.jpg");
  await act(async () => button("Done")!.click()); await settle();
  expect(button("Page 10, ready, not sent yet")).toBeDefined();
  expect(button("Page 11, still to scan")).toBeDefined();
  expect(button("Page 12, ready, not sent yet")).toBeDefined();
  expect(button("Page 13, ready, not sent yet")).toBeDefined();
  expect(Object.fromEntries([...photos.values()].map((p) => [p.pageId, p.pageNumber]))).toEqual({ p10: 10, p12: 12, p13: 13 });
});

const openCapture = async () => {
  vi.spyOn(host.querySelector<HTMLInputElement>("input[capture]")!, "click").mockImplementation(() => {});
  vi.spyOn(host.querySelector<HTMLInputElement>("input[multiple]")!, "click").mockImplementation(() => {});
  await act(async () => button("Scan pages")!.click());
};
const pickerAway = async (ms: number) => { await act(async () => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); await new Promise((r) => setTimeout(r, ms)); }); await settle(); };

it("a slow first photo never closes capture where the input has a cancel event: no timer (#915)", async () => {
  await render();
  await openCapture();
  await pickerAway(PICK_RETURN_MS + 300);
  expect(text()).toContain("Take a photo of the first page.");
  await choose("camera", "p10.jpg");
  expect(text()).toContain("1 photo taken");
  expect(document.documentElement.classList.contains(CAPTURE_CLASS)).toBe(true);
});

it("a first photo that arrives after 1.2 s opens the capture screen again, with nothing sent meanwhile (#915)", async () => {
  onTestFinished(withoutCancel());
  undoMs = 5;
  await render();
  await openCapture();
  await pickerAway(PICK_RETURN_MS + 300);
  expect(onHome()).toBe(true);
  await choose("camera", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); await settle();
  expect(text()).toContain("1 photo taken");
  expect(document.documentElement.classList.contains(CAPTURE_CLASS)).toBe(true);
  // Auto-send waits for Done.
  expect(calls.some((c) => c === "POST /api/account/scans/send")).toBe(false);
  await act(async () => button("Done")!.click()); await settle();
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); await settle();
  expect(calls.some((c) => c === "POST /api/account/scans/send")).toBe(true);
});

it("Back while capturing closes the capture screen and stays on Scan pages; Done takes back only its own entry (#915)", async () => {
  await render();
  const back = vi.spyOn(history, "back").mockImplementation(() => {});
  await openCapture();
  expect((history.state as Record<string, unknown> | null)?.[CAPTURE_ENTRY]).toBe(true);
  // The browser's Back: the entry before the capture screen's is current again.
  await act(async () => { history.replaceState(null, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: null })); }); await settle();
  expect(onHome()).toBe(true);
  expect(back).not.toHaveBeenCalled();
  await openCapture();
  await act(async () => button("Done")!.click()); await settle();
  expect(back).toHaveBeenCalledOnce();
  // An entry that is no longer ours is never taken back.
  await openCapture();
  history.replaceState(null, "");
  await act(async () => button("Close the camera")!.click()); await settle();
  expect(back).toHaveBeenCalledOnce();
});

it("moves focus to the capture screen's close button, and back to Scan pages when it closes (#915)", async () => {
  await render();
  vi.spyOn(history, "back").mockImplementation(() => {});
  await openCapture(); await settle();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Close the camera");
  await act(async () => button("Done")!.click()); await settle();
  expect(document.activeElement?.textContent).toContain("Scan pages");
});

it("keeps one live line across the first photo, and says each photo is added (#915)", async () => {
  await render();
  await openCapture();
  const live = host.querySelector(".scan-tray .sr-only[aria-live]")!;
  expect(live.getAttribute("aria-live")).toBe("polite");
  await choose("camera", "two-p12.jpg");
  expect(live.isConnected).toBe(true);
  expect(live.textContent).toBe("Photo 1 added");
  await choose("camera", "p11.jpg");
  expect(host.querySelector(".scan-tray .sr-only[aria-live]")).toBe(live);
  expect(live.textContent).toBe("Photo 2 added");
});

it("says on its thumbnail at once when a photo cannot be sent, and offers Choose another photo for a chosen photo (#915)", async () => {
  await render();
  await openCapture();
  const library = host.querySelector<HTMLInputElement>("input[multiple]")!;
  const opened = vi.mocked(library.click);
  context.prepare = async () => { throw new Error("size"); };
  await choose("library", "p10.jpg");
  const shot = host.querySelector(".scan-shots li")!;
  expect(shot.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("Photo 1, too large");
  expect(shot.textContent).toContain("Too large");
  expect(host.querySelector(".sr-only[aria-live]")?.textContent).toBe(`Photo 1: ${refusalCopy("size").title}`);
  opened.mockClear();
  await act(async () => button("Choose another photo")!.click());
  expect(opened).toHaveBeenCalledOnce();
  context.prepare = null;
  await choose("library", "p10.jpg");
  expect([...host.querySelectorAll(".scan-shots [role=img]")].map((e) => e.getAttribute("aria-label"))).toEqual(["Photo 1, added"]);
});

// Scan edge sweep (2026-11-14): #1 sibling pages, #3 leaving during Undo, #4 duplicates, #5 lost uploads, #6 camera retakes.

it("sends a page the code filed with a sibling together with this child's pages, after its own check (#1)", async () => {
  undoMs = 30;
  const server = global.fetch;
  const sends: string[][] = [], sibling = new Set<string>();
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (id && sibling.has(id) && path.endsWith("/preview")) { calls.push(`${init?.method ?? "GET"} ${path}`); return Response.json({ preview: { status: "ready" }, photoCheck: null }); }
    if (path === "/api/account/scans/send") { const ids = JSON.parse(String(init!.body)).ids; sends.push(ids); calls.push("POST /api/account/scans/send"); return Response.json({ sent: ids, marking: 0 }); }
    const response = await server(path, init);
    if (init?.method === "PUT" && filedTo) sibling.add(id!);
    return response;
  });
  await render();
  filedTo = { child_id: "sibling", child: "Aisha" };
  await choose("library", "p12.jpg");
  filedTo = null;
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); }); await settle();
  const [aisha] = [...sibling];
  expect(calls).toContain(`POST /api/account/scans/${aisha}/preview`);
  expect(sends.flat()).toEqual(expect.arrayContaining([aisha, [...photos.values()].find((p) => p.pageId === "p10")!.id]));
});

it("keeps the Undo's hold on the server, lets it go on Undo, and asks for due pages on the first load (#3)", async () => {
  undoMs = 5_000;
  await render();
  expect(calls.filter((c) => c.startsWith("GET /api/account/scans?child=child"))[0]).toBe("GET /api/account/scans?child=child&due=1");
  expect(calls.filter((c) => c.includes("due=1"))).toHaveLength(1);
  await choose("library", "p10.jpg");
  const id = [...photos.keys()][0];
  expect(holds).toEqual([{ ids: [id], seconds: 5 }]);
  // Leaving during the Undo: the phone's hold goes, the server's stays and sends the page when its wait ends.
  await act(async () => button("Undo")!.click()); await settle();
  expect(holds[1]).toEqual({ ids: [id], undo: true });
  expect(text()).toContain("Not sent. The page waits here.");
});

it("gives each page its own Undo wait: a newer page does not hold back an older one (#3)", async () => {
  undoMs = 400;
  await render();
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await settle();
  await choose("library", "p11.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); await settle();
  // p10 waited its own 400 ms; p11 is still in its wait.
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).toContain("1 page sends for marking in a moment");
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); }); await settle();
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId).sort()).toEqual(["p10", "p11"]);
});

it("asks before the page closes while a photo is still queued on the phone, and not after (#3)", async () => {
  let open!: () => void;
  putGate = new Promise((r) => { open = r; });
  await render();
  await choose("camera", "p10.jpg");
  const asked = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(asked);
  expect(asked.defaultPrevented).toBe(true);
  putGate = null; open(); await settle();
  const later = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(later);
  expect(later.defaultPrevented).toBe(false);
});

it("shows a duplicate as information that clears itself, outside the pages that need another photo (#4)", async () => {
  duplicateMs = 80;
  await render();
  await choose("library", "p10.jpg");
  photos.get([...photos.keys()][0])!.sentAt = "2026-11-05T12:00:00Z";
  await choose("library", "again-p10.jpg");
  expect(text()).toContain("Page 10 is already scanned.");
  expect(text()).not.toMatch(/need(s)? another photo/);
  expect(button("Use this new photo instead")).toBeUndefined();
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); }); await settle();
  expect(text()).not.toContain("already scanned");
});

it("offers Use this new photo instead for a ready photo not sent, and the new photo replaces it (#4)", async () => {
  await render();
  await choose("library", "p10.jpg");
  const first = [...photos.keys()][0];
  await choose("library", "better-p10.jpg");
  expect(text()).toContain("Page 10 is already scanned.");
  await act(async () => button("Use this new photo instead")!.click()); await settle();
  expect(calls.some((c) => c.startsWith("PUT ") && c.endsWith(`?replace=${first}`))).toBe(true);
  expect(photos.has(first)).toBe(false);
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).not.toContain("already scanned");
});

it("sends an upload again when the server says it never arrived, never saying it cannot open the photo (#5)", async () => {
  const server = global.fetch;
  let lost = true;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (init?.method === "PUT" && lost) { lost = false; calls.push(`PUT ${path}`); throw new TypeError("the connection dropped"); }
    if ((init?.method ?? "GET") === "GET" && id && !photos.has(id) && !path.endsWith("/image") && !path.endsWith("/preview")) return Response.json({ photo: { id, state: "reserved" } });
    return server(path, init);
  });
  await render();
  await choose("library", "p10.jpg");
  // A lost answer is asked about after 2 s; a photo still only reserved is sent again a second later.
  await act(async () => { await new Promise((r) => setTimeout(r, 3500)); }); await settle();
  expect(calls.filter((c) => c.startsWith("PUT "))).toHaveLength(2);
  expect(text()).not.toContain(refusalCopy("image").title);
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
});

it("after one timeout, sends the photo again encoded smaller (#5)", async () => {
  const server = global.fetch;
  const controllers: AbortController[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => { const c = new AbortController(); controllers.push(c); return c.signal; });
  let timedOut = false;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (init?.method === "PUT" && !timedOut) { timedOut = true; calls.push(`PUT ${path}`); controllers.find((c) => c.signal === init.signal)!.abort(); throw new DOMException("timed out", "TimeoutError"); }
    if ((init?.method ?? "GET") === "GET" && id && !photos.has(id) && !path.endsWith("/image") && !path.endsWith("/preview")) return Response.json({ photo: { id, state: "reserved" } });
    return server(path, init);
  });
  await render();
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 3500)); }); await settle();
  expect(context.encodings).toEqual([2800, 2000]);
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
});

// The 10-minute limit no longer refuses: the photo waits for room like `busy` (scan-upload-queue.ts, roomWait).
it("keeps the photo with Try again when a limit refused it, as the refusal is not about the photo (#5)", async () => {
  const server = global.fetch;
  let limited = true;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/api/account/scans" && init?.method === "POST" && limited) { calls.push("POST /api/account/scans"); return Response.json({ error: "quota" }, { status: 429 }); }
    return server(path, init);
  });
  await render();
  await choose("library", "p10.jpg");
  expect(text()).toContain(refusalCopy("quota").short);
  limited = false;
  await act(async () => button("Try again")!.click()); await settle();
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
});

it("retakes a camera shot with the camera, never the phone's photos (#6)", async () => {
  await render();
  await openCapture();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!, library = host.querySelector<HTMLInputElement>("input[multiple]")!;
  context.prepare = async () => { throw new Error("size"); };
  await choose("camera", "p10.jpg");
  vi.mocked(camera.click).mockClear(); vi.mocked(library.click).mockClear();
  expect(button("Choose another photo")).toBeUndefined();
  await act(async () => button("Retake")!.click());
  expect(camera.click).toHaveBeenCalledOnce();
  expect(library.click).not.toHaveBeenCalled();
});

it("says a photo the phone could not encode is not sent, with Try again, never too large (#9)", async () => {
  context.prepare = async () => { throw new Error("unavailable"); };
  await render();
  await choose("library", "p10.jpg");
  expect(text()).not.toContain(refusalCopy("size").short);
  expect(text()).toContain(refusalCopy("unavailable").short);
  context.prepare = null;
  await act(async () => button("Try again")!.click()); await settle();
  expect([...photos.values()].map((p) => p.pageId)).toEqual(["p10"]);
});

// Review of #981.
it("tries Undo on the server again when it fails, so the page is never sent on its own (review of #981)", async () => {
  undoMs = 5_000;
  await render();
  await choose("library", "p10.jpg");
  const id = [...photos.keys()][0];
  holdFailures = 1;
  await act(async () => button("Undo")!.click());
  await act(async () => { await new Promise((r) => setTimeout(r, 1100)); }); await settle();
  expect(holds.filter((h) => h.undo)).toEqual([{ ids: [id], undo: true }]);
  expect(text()).toContain("Not sent. The page waits here.");
});

it("says a page was already sent when Undo comes too late for it on the server (review of #981)", async () => {
  undoMs = 5_000;
  await render();
  await choose("library", "p10.jpg");
  // The recovery run sent it in the meantime.
  photos.get([...photos.keys()][0])!.sentAt = "2026-11-14T10:00:00Z";
  await act(async () => button("Undo")!.click()); await settle();
  expect(text()).toContain("Page 10 was already sent for marking.");
  expect(text()).not.toContain("Not sent.");
});

it("renews the server's capture hold while the capture screen stays open (review of #981)", async () => {
  undoMs = 5_000; captureRenewMs = 40;
  await render();
  await choose("library", "p10.jpg");
  const id = [...photos.keys()][0];
  await openCapture();
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); }); await settle();
  expect(holds.filter((h) => h.seconds === 600 && h.ids.includes(id)).length).toBeGreaterThanOrEqual(2);
});

it("lets go of the old photo's server hold when the parent uses the new photo instead (review of #981)", async () => {
  await render();
  await choose("library", "p10.jpg");
  const first = [...photos.keys()][0];
  await choose("library", "better-p10.jpg");
  await act(async () => button("Use this new photo instead")!.click()); await settle();
  expect(holds).toContainEqual({ ids: [first], release: true });
});

it("lets go of the server hold of a page the phone drops because its check could not be read (review of #981)", async () => {
  undoMs = 5;
  const server = global.fetch;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path.endsWith("/preview") && (init?.method ?? "GET") === "GET") return Response.json({ error: "unavailable" }, { status: 503 });
    return server(path, init);
  });
  await render();
  await choose("library", "p10.jpg");
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); }); await settle();
  const id = [...photos.keys()][0];
  expect(holds).toContainEqual({ ids: [id], release: true });
  expect(calls).not.toContain("POST /api/account/scans/send");
});
