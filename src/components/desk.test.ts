// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never) }));

const { Desk } = await import("@/components/desk");
const { EXCHANGE_OBJECT } = await import("@/lib/maya/checked-exchange");
const { LEASE_SETTLE_MS } = await import("@/lib/board-tab");

const CHILD = "45100000-0000-4000-8000-000000000041";
const BOOK = { id: "45100000-0000-4000-8000-000000000031", number: 1, sent: null };
type ReadyProps = Extract<ComponentProps<typeof Desk>, { books: unknown }>;
const props = (extra: Partial<ReadyProps> = {}): ReadyProps => ({
  name: "Sam", childId: CHILD, chatUsage: { used: 0, left: 60, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" },
  books: [BOOK], book: BOOK, page: { number: 4, dayLabel: "Day 2", pages: [3, 4, 5] }, image: null, areas: [],
  questions: [{ number: 3, text: "52 − 28", crop: null, board: null }], picked: 3, openPicker: false, fromQr: false, ...extra,
});

let root: Root, host: HTMLDivElement;
const render = (p: ReadyProps = props()) => act(async () => root.render(createElement(Desk, p)));
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("the board-led lesson (#1151)", () => {
  it("keeps the question, board and reply controls ahead of a collapsed transcript and collapsed navigation", async () => {
    await render();
    const question = host.querySelector('[aria-label="Current question"]')!;
    expect(question.textContent).toContain("52 − 28");
    expect(question.textContent).toContain("Workbook 1");
    const board = host.querySelector(".desk-board")!;
    const reply = host.querySelector('input[aria-label="Page and question number"]')!;
    const transcript = [...host.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Transcript")!;
    const nav = [...host.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Workbook navigation")!;
    expect(transcript.open).toBe(false);
    expect(nav.open).toBe(false);
    expect(before(question, board) && before(board, reply) && before(reply, transcript) && before(transcript, nav)).toBe(true);
    // Maya's latest words show outside the transcript; the whole conversation stays inside it.
    const says = host.querySelector('[aria-label="Maya says"]')!;
    expect(says.textContent).toContain("Which question are you on?");
    expect(transcript.textContent).toContain("Which question are you on?");
    expect(nav.textContent).toContain("Workbooks");
  });

  it("shows Leave desk in the top bar, before the lesson", async () => {
    await render();
    const leave = button("Leave desk")!;
    expect(leave.closest("header")?.classList.contains("desk-top")).toBe(true);
    expect(before(leave, host.querySelector('[aria-label="Current question"]')!)).toBe(true);
  });

  it("switches to paper and back without losing the question or the board underneath", async () => {
    await render();
    const board = host.querySelector(".desk-board")!;
    await act(async () => button("Use paper")!.click());
    expect(button("Show board")!.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".desk-root")!.getAttribute("data-paper")).toBe("true");
    expect(host.textContent).toContain("Write this step in your workbook.");
    expect(host.querySelector('[aria-label="Current question"]')!.textContent).toContain("52 − 28");
    // The same board stays mounted, so its ink and a completed step are there when the child comes back.
    expect(host.querySelector(".desk-board")).toBe(board);
    await act(async () => button("Show board")!.click());
    expect(host.querySelector(".desk-root")!.hasAttribute("data-paper")).toBe(false);
    expect(host.querySelector(".desk-board")).toBe(board);
    expect(button("Use paper")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps paper on when a chat starts, and gives the checked move the single paper choice of the question", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const id = "45100000-0000-4000-8000-000000000021";
    const target = { lessonId: "lesson", turnId: "prompt", boardRevision: 2, objectId: EXCHANGE_OBJECT, batchId: "show-tens" };
    const show = { transactionId: target.batchId, commands: [{ op: "model", id: target.objectId, model: { kind: "base_ten", hundreds: 0, tens: 5, ones: 2 }, place: { region: "main" } }] };
    const chat = { id, revision: 2, pending: false, ended: false, transcript: [{ speaker: "maya", text: "How can you get more ones?" }], batches: [show], hint: 0, safetyMessage: null, exchange: target };
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) =>
      url === "/api/desk/chat" && JSON.parse(String(options?.body)).type === "start"
        ? Response.json({ usage: { used: 1, left: 59, resetsAt: Date.now() + 86_400_000, backAt: "tomorrow" }, chat })
        : Response.json({ ok: true, acked: 0 })));
    try {
      await render();
      await act(async () => button("Use paper")!.click());
      await act(async () => button("Chat with Maya")!.click());
      await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS); });
      expect(host.querySelector('[aria-label="Maya says"]')!.textContent).toContain("How can you get more ones?");
      // The chat's board took over from the question's board; paper stays on and the checked move waits for the board.
      expect(button("Show board")!.getAttribute("aria-pressed")).toBe("true");
      expect(button("Exchange one ten")).toBeUndefined();
      expect(host.textContent).toContain("Show the trade on your paper.");
      // One paper control on the desk: the checked move follows the question's choice and offers no second toggle.
      expect(button("Use board")).toBeUndefined();
      await act(async () => button("Show board")!.click());
      expect([...host.querySelectorAll("button")].filter((b) => /^Use (paper|board)$/.test(b.textContent!.trim()))).toHaveLength(1);
      expect(button("Exchange one ten")).toBeDefined();
    } finally { vi.useRealTimers(); }
  });
});
