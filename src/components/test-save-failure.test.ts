// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TakeTest } from "@/components/test";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }) }));
vi.mock("@/lib/track", () => ({ track: () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const question = (n: number) => ({ id: `q-${n}`, format: "number", prompt: `Question text ${n}`, templateId: "t", skill: "s" });
/** The place of the family's test: question 15 is the newest, and questions 13 and 14 can be changed. */
const step = {
  status: "question",
  question: question(15),
  number: 15,
  total: 20,
  breakAfter: 20,
  answered: [13, 14].map((n) => ({ number: n, question: question(n), response: "7" })),
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let root: Root;
let host: HTMLElement;
let puts: { release: (r: Response) => void; aborted: () => boolean }[];
let posts: number;

/** The server: the start and the step answer at once, an answer is stored, and each change waits until the test answers it. */
function server() {
  puts = [];
  posts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return new Promise<Response>((resolve, reject) => {
        const signal = init.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        puts.push({ release: resolve, aborted: () => signal?.aborted === true });
      });
    }
    if (url.endsWith("/answers")) {
      posts += 1;
      return json({ ok: true, step: { ...step, question: question(16), number: 16, answered: [] } });
    }
    if (url.endsWith("/context")) return json({ ok: true });
    if (init?.method === "POST") return json({ ok: true, id: "test-1", resumed: true });
    return json({ ok: true, step });
  }));
}

const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
const next = () => button(".test-go");
const click = (selector: string) => act(async () => button(selector).click());
const pad = (key: string) => act(async () => [...host.querySelectorAll<HTMLButtonElement>(".test-pad button")].find((b) => b.textContent === key)!.click());
const pressNext = () => act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const onScreen = () => host.querySelector(".test-prompt")?.textContent;
const alertShown = () => host.querySelector('[role="alert"]')?.textContent ?? null;
const answerShown = () => host.querySelector(".test-display")?.textContent;

/** From the newest question to question 14, and Next: its change goes out in the background, and question 15 shows. */
async function changeQuestion14() {
  await click(".test-back");
  expect(onScreen()).toBe("Question text 14");
  await pad("9");
  await pressNext();
  expect(onScreen()).toBe("Question text 15");
  expect(puts).toHaveLength(1);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  server();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(TakeTest, { childId: "child-1", name: "Asha", breakAfter: 20, ready: true, done: false, mode: "resume" })));
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => /Continue the test/.test(b.textContent ?? ""))!.click());
  expect(onScreen()).toBe("Question text 15");
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe("a save that hangs", () => {
  it("does not hold Next for longer than the time limit", async () => {
    await changeQuestion14();
    await pad("5");
    await pressNext();
    // The newest answer waits for the change before it, as the saves go in order.
    expect(next().disabled).toBe(true);
    expect(posts).toBe(0);

    await act(async () => vi.advanceTimersByTime(44_000));
    expect(next().disabled).toBe(true);

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(puts[0].aborted()).toBe(true);
    // The question whose save failed opens with the error, and the child can press Next again.
    expect(onScreen()).toBe("Question text 14");
    expect(alertShown()).toMatch(/Something went wrong/);
    expect(next().disabled).toBe(false);

    // The server is back: the change saves, and the answer the child gave to question 15 is still there.
    await pressNext();
    await act(async () => puts[1].release(json({ ok: true, step })));
    expect(onScreen()).toBe("Question text 15");
    expect(answerShown()).toBe("5");
    await pressNext();
    expect(posts).toBe(1);
    expect(onScreen()).toBe("Question text 16");
  });
});

describe("a failed save of the question on the screen", () => {
  it("starts no new save until the child presses Next", async () => {
    await changeQuestion14();
    await click(".test-back");
    expect(onScreen()).toBe("Question text 14");

    await act(async () => puts[0].release(json({ ok: false, error: "store_failed" }, 503)));

    expect(puts).toHaveLength(1);
    expect(onScreen()).toBe("Question text 14");
    expect(answerShown()).toBe("79");
    expect(alertShown()).toMatch(/Something went wrong/);
    expect(next().disabled).toBe(false);

    await pressNext();
    expect(puts).toHaveLength(2);
    await act(async () => puts[1].release(json({ ok: true, step })));
    expect(onScreen()).toBe("Question text 15");
    expect(alertShown()).toBeNull();
  });

  it("starts no saves by itself when two questions fail, and the child saves both", async () => {
    await changeQuestion14();
    await click(".test-back");
    await click(".test-back");
    expect(onScreen()).toBe("Question text 13");
    expect(puts).toHaveLength(1);

    // Each save that fails: questions 14, 14 and 13 (the visits the child made, and no more).
    const failNext = async (i: number) => act(async () => puts[i].release(json({ ok: false, error: "store_failed" }, 503)));
    await failNext(0);
    await failNext(1);
    await failNext(2);
    expect(puts).toHaveLength(3);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(puts).toHaveLength(3);
    expect(onScreen()).toBe("Question text 13");
    expect(alertShown()).toMatch(/Something went wrong/);

    // The server is back. Next saves question 13, then question 14 opens, and its Next saves it too.
    await pressNext();
    expect(puts).toHaveLength(4);
    await act(async () => puts[3].release(json({ ok: true, step })));
    expect(onScreen()).toBe("Question text 14");
    expect(answerShown()).toBe("79");
    expect(alertShown()).toMatch(/Something went wrong/);
    expect(puts).toHaveLength(4);

    await pressNext();
    expect(puts).toHaveLength(5);
    await act(async () => puts[4].release(json({ ok: true, step })));
    expect(puts).toHaveLength(5);
    expect(alertShown()).toBeNull();
  });

  it("keeps a change the child made while the save was on its way", async () => {
    await changeQuestion14();
    await click(".test-back");
    await pad("3");

    await act(async () => puts[0].release(json({ ok: false, error: "store_failed" }, 503)));

    expect(puts).toHaveLength(1);
    expect(answerShown()).toBe("793");
  });
});


it("tells the grown-up how to restart a test with insufficient evidence (#769)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, step: { status: "complete", total: 20, sufficientEvidence: false } })));
  await pad("7");
  await pressNext();
  expect(host.textContent).toContain("Please ask your grown-up to start a new test.");
  expect(host.querySelector('a[href="/account"]')?.textContent).toBe("Back to your account");
});
