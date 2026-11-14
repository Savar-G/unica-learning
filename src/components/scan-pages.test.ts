// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ auth: null as null | ((_event: string, session: { user: { id: string } } | null) => void), prepare: null as null | (() => Promise<Blob>) }));
vi.mock("@/lib/supabase-browser", () => ({
  browserClient: () => ({ auth: { onAuthStateChange: (callback: typeof context.auth) => {
    context.auth = callback;
    return { data: { subscription: { unsubscribe() {} } } };
  } } }),
}));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props); } }));
// The prepared photo carries the file's name, so the fake server knows which page it shows.
vi.mock("@/lib/scan-photo-browser", () => ({ prepareScanPhoto: async (file: File) => context.prepare ? context.prepare() : new Blob([file.name]) }));
import { ScanPages } from "./scan-pages";

// A fake server: Day 4 has pages p10 to p13. A photo named "p11.jpg" shows page p11; "junk.jpg" has no page code;
// "two-p12.jpg" shows two sheets, which the check refuses.
type Photo = { id: string; pageId: string; workbookId: string; book: number; pageNumber: number; state: "pending" | "saved"; check: string; reason: string | null; sentAt: string | null; createdAt: string };
const PAGES = [10, 11, 12, 13].map((n, i) => ({ id: `p${n}`, workbookId: "book", book: 1, pageNumber: n, day: "Day 4", pageOfDay: i + 1, pagesInDay: 4 }));
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

const buttons = () => [...document.querySelectorAll("button")];
const button = (text: string) => buttons().find((b) => b.textContent === text || b.getAttribute("aria-label") === text);
const settle = async () => { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async () => { await act(async () => root.render(createElement(ScanPages, { childrenList: kids, parent: "parent", noticeAcknowledged: acknowledged }))); await settle(); };
const choose = async (input: "camera" | "library", ...names: string[]) => {
  const el = host.querySelector<HTMLInputElement>(input === "camera" ? "input[capture]" : "input[multiple]")!;
  Object.defineProperty(el, "files", { configurable: true, value: names.map((n) => new File(["x"], n, { type: "image/jpeg" })) });
  await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
};
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  marking = null;
  context.auth = null; context.prepare = null; checks = true; acknowledged = true; photos = new Map(); uploading = 0; mostAtOnce = 0; full = false; calls.length = 0;
  admitted = []; loseAdmissions = 0; saveFailures = 0; expired = new Set();
  losePuts = 0; loseStatus = false; listDown = false; kids = [{ id: "child", first_name: "Leah" }]; released = [];
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"; calls.push(`${method} ${path}`);
    const id = /\/api\/account\/scans\/([^/?]+)/.exec(path)?.[1];
    if (path === "/api/account/scans/notice") { acknowledged = true; return Response.json({ acknowledged: true }); }
    if (path.startsWith("/api/account/scans?child=")) {
      if (listDown) return Response.json({ error: "unavailable" }, { status: 503 });
      if (path.endsWith("=other")) return Response.json({ checks, pages: PAGES, photos: [] });
      return Response.json({ checks, pages: PAGES, photos: [...photos.values()].map(({ two, ...p }) => { void two; return p; }) });
    }
    if (path === "/api/account/scans" && method === "POST") {
      const asked: string = JSON.parse(String(init!.body)).id;
      admitted.push(asked);
      if (full) return Response.json({ error: "busy" }, { status: 429 });
      if (loseAdmissions > 0) { loseAdmissions--; throw new TypeError("the answer was lost"); }
      return Response.json({ state: photos.get(asked)?.state ?? "reserved", id: asked });
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
      await new Promise((r) => setTimeout(r, 1));
      uploading--;
      const name = await (init!.body as Blob).text();
      const page = PAGES.find((p) => name.includes(p.id));
      if (!page) return Response.json({ error: "qr" }, { status: 422 });
      if ([...photos.values()].some((p) => p.pageId === page.id)) return Response.json({ error: "duplicate" }, { status: 422 });
      photos.set(id, { id, pageId: page.id, workbookId: "book", book: 1, pageNumber: page.pageNumber, state: "pending", check: checks ? "checking" : "none", reason: null, sentAt: null, createdAt: `2026-11-05T10:00:0${photos.size}Z`, two: name.startsWith("two") });
      if (losePuts > 0) { losePuts--; throw new TypeError("the answer was lost"); }
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
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
  expect(text()).toContain("2 photos saved.");
  await act(async () => releaseOld()); await settle();
  expect(photos.size).toBe(2);
  expect(text()).toContain("2 photos saved.");
  expect(text()).not.toContain("1 photo saved.");
});

it("starts with the tips, Take photos and Choose from your photos, and shows the photo notice once before the first photo", async () => {
  acknowledged = false;
  await render();
  expect(text()).toContain("Lay the book flat. Take one page, or two pages side by side with both fully in the photo.");
  expect(button("Choose from your photos")).toBeDefined();
  const camera = host.querySelector<HTMLInputElement>("input[capture]")!;
  const opened = vi.spyOn(camera, "click").mockImplementation(() => {});
  await act(async () => button("Take photos")!.click());
  expect(opened).not.toHaveBeenCalled();
  expect(text()).toContain("Before you take a photo");
  await act(async () => button("Got it")!.click()); await settle();
  expect(opened).toHaveBeenCalledOnce();
  expect(acknowledged).toBe(true);
});

it("opens the phone's photos for several at once from the start screen", async () => {
  await render();
  const library = host.querySelector<HTMLInputElement>("input[multiple]")!;
  expect(library.accept).toContain("image/jpeg");
  const opened = vi.spyOn(library, "click").mockImplementation(() => {});
  await act(async () => button("Choose from your photos")!.click());
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
  expect(text()).toContain("No photo yet: page 11");
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
  await act(async () => button("Page 10: Ready")!.click()); await settle();
  expect(document.activeElement?.textContent).toBe("Close");
});

it("closes an open photo with the corner Close button", async () => {
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  await act(async () => button("Page 10: Ready")!.click()); await settle();
  const x = document.querySelector<HTMLButtonElement>(".scan-sheet-x");
  expect(x?.getAttribute("aria-label")).toBe("Close");
  expect(document.querySelector(".scan-sheet")).not.toBeNull();
  await act(async () => x!.click()); await settle();
  expect(document.querySelector(".scan-sheet")).toBeNull();
});

it("keeps a refused photo first with its reason while the other pages go on, and Send counts only ready pages", async () => {
  await render();
  await choose("library", "junk.jpg", "p10.jpg", "two-p11.jpg");
  expect(text()).toContain("2 pages need another photo");
  expect(text()).toContain("Code not read");
  expect(text()).toContain("More than one page");
  expect(text()).toContain("Unknown page");
  expect(button("Send this page for marking")).toBeDefined();
  await act(async () => button("Send this page for marking")!.click()); await settle();
  const sent = calls.find((c) => c === "POST /api/account/scans/send");
  expect(sent).toBeDefined();
  expect([...photos.values()].filter((p) => p.sentAt).map((p) => p.pageId)).toEqual(["p10"]);
  expect(text()).toContain("1 page sent for marking. Marking is not ready yet. The pages wait here.");
  expect(text()).toContain("Sent for marking");
  // The refused pages stay in the stack.
  expect(text()).toContain("2 pages need another photo");
});

it.each([
  [3, "3 pages sent for marking. Marks show here when they are ready."],
  [2, "3 pages sent for marking. Marks show here when they are ready."],
  [0, "3 pages sent for marking. Marking is not ready yet. The pages wait here."],
])("the Send result says whether marking started (%s of 3 started)", async (started, words) => {
  marking = started;
  await render();
  await choose("library", "p10.jpg", "p11.jpg", "p12.jpg");
  await act(async () => button("Send 3 pages for marking")!.click()); await settle();
  expect(text()).toContain(words);
});

it.each([
  [1, "1 page sent for marking. Marks show here when they are ready."],
  [0, "1 page sent for marking. Marking is not ready yet. The pages wait here."],
])("the Send result for one page (%s started)", async (started, words) => {
  marking = started;
  await render();
  await choose("library", "p10.jpg");
  await act(async () => button("Send this page for marking")!.click()); await settle();
  expect(text()).toContain(words);
});

it.each([0, 1, 2, 3])("no Send result says \"started\" or \"later\" (%s of 3 started)", async (started) => {
  marking = started;
  await render();
  await choose("library", "p10.jpg", "p11.jpg", "p12.jpg");
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

const seed = (id: string, pageId: string, fields: Partial<Photo> = {}) => {
  const page = PAGES.find((p) => p.id === pageId)!;
  photos.set(id, { id, pageId, workbookId: "book", book: 1, pageNumber: page.pageNumber, state: "saved", check: "ready", reason: null, sentAt: null, createdAt: `2026-11-05T09:00:0${photos.size}Z`, two: false, ...fields });
};
const saves = (id: string) => calls.filter((c) => c === `POST /api/account/scans/${id}`).length;

it("reuses the reservation when Try again follows a lost admission answer, so no second upload slot is taken", async () => {
  loseAdmissions = 2;
  await render();
  await choose("library", "p10.jpg", "p11.jpg");
  expect(admitted).toHaveLength(2);
  for (let tile = 0; tile < 2; tile++) {
    await act(async () => button("Unknown page: Not sent")!.click());
    await act(async () => button("Try again")!.click());
    await settle();
  }
  // One id for each photo, however many times it was asked.
  expect(admitted).toHaveLength(4);
  expect(new Set(admitted).size).toBe(2);
  expect([...photos.keys()].sort()).toEqual([...new Set(admitted)].sort());
  expect(text()).toContain("2 photos. 2 pages are ready to send.");
});

it("takes a new reservation when the kept one has ended, so the photo is not stuck on Try again", async () => {
  loseAdmissions = 1;
  await render();
  await choose("library", "p10.jpg");
  const lost = admitted[0];
  expired.add(lost);
  await act(async () => button("Unknown page: Not sent")!.click());
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
  await act(async () => button("Unknown page: Not sent")!.click());
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
  expect(button("Send this page for marking")).toBeDefined();
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
  // The one ready page still shows large.
  expect(text()).toContain("We can read this page.");
  expect(button("Send this page for marking")).toBeDefined();
  const tile = button("Page 10 · Day 4: Sent for marking");
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
  expect(text()).toContain("1 photo. 1 page is ready to send.");
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

it("keeps help available as photos are added and rejected without repeating the first-visit offer", async () => {
  localStorage.clear();
  await render();
  await act(async () => { button("Not now")!.click(); });
  await choose("library", "p10.jpg");
  expect(text()).not.toContain("New to scanning?"); expect(button("How scanning works")).toBeTruthy();
  await choose("library", "two-p11.jpg");
  expect(text()).toContain("needs another photo");
  await act(async () => { button("How scanning works")!.click(); });
  expect(host.querySelector(".scan-help-dialog")?.hasAttribute("open")).toBe(true);
  expect(text()).toContain("replace it");
});

it("keeps photos the server has no room for in their place, says so, and sends them when there is room", async () => {
  shortWaits();
  await render();
  await choose("library", "p10.jpg");
  full = true;
  await choose("library", "p11.jpg", "p12.jpg", "p13.jpg");
  expect(text()).toContain("Waiting for room");
  expect(text()).toContain("Send these pages for marking first, then add more.");
  expect(text()).not.toContain("Not sent");
  expect(photos.size).toBe(1);
  full = false;
  await act(async () => button("Send this page for marking")!.click()); await settle();
  await settle();
  expect(text()).not.toContain("Waiting for room");
  expect([...photos.values()].map((p) => p.pageId).sort()).toEqual(["p10", "p11", "p12", "p13"]);
});

it("without checks, a photo waiting for room says it goes on its own", async () => {
  shortWaits(); checks = false; full = true;
  await render();
  await choose("library", "p10.jpg");
  expect(text()).toContain("Waiting for room");
  expect(text()).toContain("There is no room for more photos yet. The waiting photo keeps its place and goes when there is room.");
  expect(text()).not.toContain("Not sent");
  full = false; await settle(); await settle();
  expect(photos.size).toBe(1);
});
