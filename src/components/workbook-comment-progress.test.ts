// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunDetail } from "@/lib/admin-store";
import { summarizeAiCalls } from "@/lib/workbook-ai";
import { WorkbookCommentReviewer } from "@/components/workbook-comment-reviewer";
const h = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("server-only", () => ({}));
const at = "2026-11-06T23:00:00Z";
function detail(stalled = false): RunDetail {
  return {
    run: { id: "run", parentId: "parent", childId: "child", number: 1, status: "done", step: null, attempts: 1, maxAttempts: 2,
      donePages: 12, totalPages: 12, createdAt: at, heartbeatAt: at, startedAt: at, finishedAt: at, error: null, errors: [],
      draftId: "draft", draftKey: "draft", resumes: 0, startedBy: { id: "admin", email: "synthetic@example.invalid" }, runner: "mac" },
    child: null, oldFormat: null, images: {}, audit: [], solves: [], aiCalls: summarizeAiCalls([]), approved: null,
    draft: { revision: 1, rendering: null, problems: [], workbook: { id: "draft", childId: "child", number: 1, levels: [16],
      profileBuild: null, model: "synthetic", pages: Array.from({ length: 12 }, (_, n) => ({ number: n + 1, type: "practice", day: 1,
        dayLabel: "Day 1", pageOfDay: n + 1, qrToken: `synthetic-${n}`, fit: { status: "fits" }, attempts: 1, questions: [] })),
      counts: { pages: 12, questions: 0, checked: 0, failed: 0, notChecked: 0, failedPages: 0 } } },
    editBatch: { id: "batch", draftId: "draft", revision: 1, runner: "mac", status: "running", error: null, createdAt: at, lease: "synthetic", stalled },
    comments: Array.from({ length: 14 }, (_, n) => ({ id: `comment-${n}`, draftId: "draft", revision: 1, page: Math.min(n + 1, 12),
      question: null, x: .5, y: .5, note: "Synthetic comment", item: null, actor: { id: "admin", email: "synthetic@example.invalid" },
      createdAt: at, status: "sent", error: null, batchId: "batch", before: null, after: null })),
  };
}
const progress = (extra = {}) => ({ batch: { id: "batch", revision: 1, status: "running", phase: "working",
  total: 12, checked: 4, ready: 1, failed: 3, heartbeatAt: at, ...extra } });
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); h.router.refresh.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const mount = async (source = detail()) => { await act(async () => root.render(createElement(WorkbookCommentReviewer, { detail: source, history: [] }))); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("mounted workbook comment progress", () => {
  it("shows saved page outcomes while polling only the small edit endpoint", async () => {
    const fetch = vi.fn(async () => Response.json(progress())); vi.stubGlobal("fetch", fetch); await mount();
    await advance(1_000);
    expect(container.textContent).toContain("4 of 12 pages checked. 1 ready. 3 need attention.");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/workbooks/runs/run/edit", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(h.router.refresh).not.toHaveBeenCalled(); await advance(5_000);
    expect(fetch).toHaveBeenCalledTimes(2); expect(h.router.refresh).not.toHaveBeenCalled();
  });
  it("replaces a stale initial stopped state with a fresh running result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(progress()))); await mount(detail(true));
    expect(container.textContent).toContain("Try again"); await advance(1_000);
    expect(container.textContent).not.toContain("Try again"); expect(container.textContent).not.toContain("The edit stopped.");
    expect(container.textContent).toContain("Applying comments...");
  });
  it("refreshes the full workbook once after terminal state and stops polling", async () => {
    const fetch = vi.fn(async () => Response.json(progress({ status: "failed", phase: "failed" })));
    vi.stubGlobal("fetch", fetch); await mount(); await advance(1_000);
    expect(container.textContent).toContain("Loading results..."); expect(h.router.refresh).toHaveBeenCalledTimes(1);
    await advance(60_000); expect(fetch).toHaveBeenCalledTimes(1); expect(h.router.refresh).toHaveBeenCalledTimes(1);
  });
  it("shows an unavailable state and waits before another read", async () => {
    const fetch = vi.fn(async () => Response.json({}, { status: 503 })); vi.stubGlobal("fetch", fetch); await mount(); await advance(1_000);
    expect(container.textContent).toContain("Progress is unavailable. Retrying shortly. No saved count is available yet.");
    await advance(29_999); expect(fetch).toHaveBeenCalledTimes(1); expect(h.router.refresh).not.toHaveBeenCalled();
    await advance(1); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("mounted comment routing", () => {
  it("shows the layout path before save and prevents a question override on an unsupported page", async () => {
    const source = detail();source.editBatch = null;source.comments = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ status: "saved", id: "synthetic-comment" }));vi.stubGlobal("fetch", fetch);
    await mount(source);
    await act(async () => container.querySelector<HTMLButtonElement>(".wbr-page-hit")!.click());
    await act(async () => {
      const note = container.querySelector<HTMLTextAreaElement>(".wbr-compose textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Make this easier to read.");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      const route = container.querySelector<HTMLSelectElement>(".wbr-compose select")!;route.value = "question";
      route.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("This comment needs reviewed page-layout changes.");
    expect(container.querySelector<HTMLSelectElement>(".wbr-compose select")!.value).toBe("layout");
    expect(container.querySelector<HTMLOptionElement>('.wbr-compose option[value="question"]')!.disabled).toBe(true);
    expect(container.querySelector(".wbr-exact")).toBeNull();
    await act(async () => container.querySelector(".wbr-compose")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ comment: { route: "layout", note: "Make this easier to read.", item: null } });
  });
  it("keeps layout partial results open and shows their actual remaining work", async () => {
    const source = detail();source.editBatch = null;source.comments = [{ ...source.comments[0], status: "failed", route: "layout",
      error: "Partly applied. The required work area still uses this space.", resultNote: "The row gaps changed. The lower gap remains." }];
    await mount(source);
    expect(container.textContent).toContain("Partly applied - open");
    expect(container.textContent).toContain("The row gaps changed. The lower gap remains.");
    expect(container.textContent).toContain("Review page-layout changes (1)");
    expect(container.textContent).not.toContain("Text changed - review result");
  });
  it("reports unsupported layout requests instead of claiming that send applied them", async () => {
    const source = detail();source.editBatch = null;source.comments = [{ ...source.comments[0], status: "pending", route: "layout" }];
    const fetch = vi.fn(async () => Response.json({ status: "layout-review", reason: "This request still needs reviewed layout changes." }));vi.stubGlobal("fetch", fetch);
    await mount(source);
    expect(container.textContent).toContain("1 page-layout comment is saved and open for the team. It stays open until the pages are re-rendered.");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith("Send all comments"))!.click());
    expect(container.textContent).toContain("This request still needs reviewed layout changes.");
    expect(container.textContent).toContain("Awaiting layout review");
  });
});
