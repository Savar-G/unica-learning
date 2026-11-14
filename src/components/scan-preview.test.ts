// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props); } }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }));
vi.mock("@/lib/scan-photo-browser", () => ({ prepareScanPhoto: async () => new Blob(["normalized"]) }));
import { ScanPages } from "./scan-pages";
import { ScanPreview } from "./scan-preview";

// What a parent sees for each preview answer, and that images live only as object URLs that go away with the view.

let root: Root, host: HTMLDivElement, answers: unknown[], calls: string[], failImage: boolean;
const READY = {
  status: "ready", straight: { part: "straight", width: 1275, height: 1650 },
  crops: [{ part: "crop-1", number: 1, width: 300, height: 200 }, { part: "crop-3", number: 3, width: 300, height: 200 }], notSupported: [2, 4, 5],
};
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const show = async () => { await act(async () => root.render(createElement(ScanPreview, { photo: "photo-1", child: "Alex" }))); await flush(); await flush(); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  answers = []; calls = []; failImage = false;
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++n}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (init?.method === "POST") return Response.json({ preview: answers.shift() ?? READY });
    return failImage ? new Response("no", { status: 404 }) : new Response(new Blob(["private"]));
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows the straightened page and numbered crops, says which answers it cannot show, and claims no marks", async () => {
  await show();
  const images = [...host.querySelectorAll("img")];
  expect(images.map((i) => i.getAttribute("alt"))).toEqual(["Straightened page for Alex", "Answer space for question 1", "Answer space for question 3"]);
  expect(images.every((i) => i.getAttribute("src")?.startsWith("blob:"))).toBe(true);
  expect(host.textContent).toContain("Question 1");
  expect(host.textContent).toContain("Question 3");
  expect(host.textContent).toContain("We cannot show the answers to questions 2, 4 and 5 yet.");
  expect(host.textContent).toContain("No marks yet");
  expect(host.textContent).not.toMatch(/right|wrong|score/i);
});

it("revokes every image when the view goes away", async () => {
  // Disproved if a child's handwriting stays reachable by an object URL after the view is gone.
  await show();
  const made = vi.mocked(URL.createObjectURL).mock.results.map((r) => r.value);
  expect(made).toHaveLength(3);
  await act(async () => root.render(createElement("div")));
  expect(vi.mocked(URL.revokeObjectURL).mock.calls.map((c) => c[0]).sort()).toEqual([...made].sort());
  vi.mocked(URL.revokeObjectURL).mockClear();
});

it.each([
  [{ ...READY, notSupported: [13] }, "We cannot show the answer to question 13 yet."],
  [{ status: "refused", reason: "marks-missing" }, "four corner marks"],
  [{ status: "refused", reason: "page-mismatch" }, "does not match the printed page"],
  [{ status: "refused", reason: "ambiguous-page" }, "only one page shows"],
  [{ status: "refused", reason: "qr-mismatch" }, "small code in the bottom-left corner"],
  [{ status: "refused", reason: "another-page" }, "looks like a different page"],
  [{ status: "refused", reason: "faint" }, "too bright, faint or covered to read"],
  [{ status: "refused", reason: "check-timeout" }, "Try again in a minute"],
  [{ status: "unavailable", reason: "no-contract" }, "checking is not available for this workbook"],
  [{ status: "unavailable", reason: "other-revision" }, "earlier printing"],
])("says so plainly: %j", async (answer, text) => {
  answers = [answer];
  await show();
  expect(host.textContent).toContain(text);
  // Only a ready preview asks for images.
  if (answer.status !== "ready") {
    expect(host.querySelectorAll("img")).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith("GET"))).toEqual([]);
  }
});

it("keeps the photo's message when an image route refuses, and can try again", async () => {
  failImage = true;
  await show();
  expect(host.querySelector("[role=alert]")?.textContent).toContain("Your photo is still here");
  failImage = false;
  await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!.click());
  await flush(); await flush();
  expect(host.querySelectorAll("img")).toHaveLength(3);
});

it("after running out of time, offers Try again only when the job's lease has run out", async () => {
  // Disproved if the screen tells a parent to try again with nothing to press, or lets them call while the lease holds.
  answers = [{ status: "refused", reason: "check-timeout", retryInMs: 60 }];
  await show();
  const button = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again");
  expect(host.textContent).toContain("Try again in a minute");
  expect(button()?.disabled).toBe(true);
  await act(async () => button()!.click());
  expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  expect(button()?.disabled).toBe(false);
  await act(async () => button()!.click());
  await flush(); await flush();
  expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(2);
  expect(host.querySelectorAll("img")).toHaveLength(3);
});

it("a refusal that another call cannot change offers no Try again", async () => {
  answers = [{ status: "refused", reason: "faint" }];
  await show();
  expect([...host.querySelectorAll("button")]).toEqual([]);
});

it("Scan pages asks for no preview unless the server says this family has checks", async () => {
  // Disproved if an ordinary family's browser even calls the route.
  let checks = false;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.includes("?child=")) return Response.json({ checks, pages: [], photos: [{ id: "photo-1", pageId: "p1", workbookId: "b", book: 1, pageNumber: 3, state: "saved", check: checks ? "checking" : "none", reason: null, sentAt: null, createdAt: "2026-11-05T10:00:00Z" }] });
    if (path.endsWith("/preview")) return Response.json({ preview: { status: "busy" } });
    return new Response(new Blob(["private"]));
  });
  const open = async (key: string) => {
    await act(async () => root.render(createElement(ScanPages, { key, childrenList: [{ id: "child", first_name: "Alex" }], parent: "parent", noticeAcknowledged: true })));
    await flush(); await flush();
  };
  await open("off");
  expect(calls.filter((c) => c.includes("/preview"))).toEqual([]);
  checks = true;
  await open("on");
  expect(calls.some((c) => c === "POST /api/account/scans/photo-1/preview")).toBe(true);
});

// Review of PR #874, finding 3. Failing input: the POST answers "pending" at 0 s, the GET starts at 1 s, and its answer
// comes at 8 s with "done" and problem "blurry". The screen waits until one fixed deadline (6 s) and shows nothing later.
const photoCheckFetch = (answerAt: number | null, view: unknown) => {
  const gets: number[] = [];
  let held: ((r: Response) => void) | null = null;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ preview: READY, photoCheck: { state: "pending" } });
    if (path.endsWith("/preview")) {
      gets.push(Date.now());
      if (answerAt === null) return Response.json({ preview: READY, photoCheck: view });
      // The answer arrives at `answerAt` ms, whatever the request's signal says (as a slow network can).
      return new Promise<Response>((resolve) => { held = resolve; setTimeout(() => held?.(Response.json({ preview: READY, photoCheck: view })), answerAt - Date.now()); });
    }
    return new Response(new Blob(["private"]));
  });
  return gets;
};
const at = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it("a photo check answer that comes after the 6 s deadline is not shown, and the wait ends at the deadline", async () => {
  // Disproved if the blurry box appears at 8 s, or "Checking the photo..." stays after 6 s.
  vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const gets = photoCheckFetch(8000, { state: "done", problem: "blurry" });
    await act(async () => root.render(createElement(ScanPreview, { photo: "photo-1", child: "Alex", onSendAnyway: () => {} })));
    await at(0);
    expect(host.textContent).toContain("Checking the photo");
    await at(1000);
    expect(gets).toEqual([1000]);
    await at(5000);
    expect(host.textContent).not.toContain("Checking the photo");
    expect(host.querySelector(".scan-check-problem")).toBeNull();
    await at(3000);
    expect(host.textContent).not.toContain("The photo is blurry");
    expect(host.querySelector(".scan-check-problem")).toBeNull();
    expect(gets).toEqual([1000]);
  } finally { vi.useRealTimers(); }
});

it("a photo check answer that comes before the deadline shows the problem with Send anyway", async () => {
  vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    photoCheckFetch(null, { state: "done", problem: "blurry" });
    await act(async () => root.render(createElement(ScanPreview, { photo: "photo-1", child: "Alex", onSendAnyway: () => {} })));
    await at(1000);
    expect(host.querySelector(".scan-check-problem")?.textContent).toContain("The photo is blurry. Hold the phone still and take it again.");
    expect(host.textContent).toContain("Send anyway");
    expect(host.textContent).not.toContain("Checking the photo");
  } finally { vi.useRealTimers(); }
});
