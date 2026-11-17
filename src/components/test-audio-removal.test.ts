// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TakeTest, type StartMode } from "./test";
import { TestHelp } from "./test-help";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }) }));
vi.mock("@/lib/track", () => ({ track: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const speak = vi.fn();
const voices = vi.fn(() => [{ name: "Samantha", lang: "en-US", default: true }]);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("speechSynthesis", { getVoices: voices, speak, cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

const clickText = async (text: RegExp) => act(async () => {
  const button = [...host.querySelectorAll("button")].find(b => text.test(b.textContent ?? ""));
  if (!button) throw new Error(`Missing button ${text}`);
  button.click();
});
const expectSilent = () => {
  expect(host.querySelector('.test-read, [aria-label="Read it to me"], [aria-label="Stop reading"]')).toBeNull();
  expect(voices).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
};

it.each<StartMode>(["new", "resume"])("keeps a %s assessment silent while saving an answer and opening the next question", async mode => {
  const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const question = (n: number) => ({ status: "question", question: { id: `q${n}`, format: "number", prompt: `Question ${n}`, readAloud: `Read question ${n}`, templateId: "test", skill: "s" }, number: n, total: 20, breakAfter: 20, answered: [] });
  const saves: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/answers")) { saves.push(JSON.parse(String(init?.body))); return response({ ok: true, step: question(2) }); }
    if (url.endsWith("/context")) return response({ ok: true });
    if (init?.method === "POST") return response({ ok: true, id: "test-audio", resumed: mode === "resume" });
    return response({ ok: true, step: question(1) });
  }));
  await act(async () => root.render(createElement(TakeTest, { childId: "audio-child", name: "Alex", breakAfter: 20, ready: true, done: false, mode })));
  await clickText(mode === "resume" ? /Continue the test/ : /Start the test/);
  expect(host.querySelector(".test-prompt")?.textContent).toBe("Question 1");
  expectSilent();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".test-pad button")].find(b => b.textContent === "7")!.click());
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(saves).toHaveLength(1);
  expect(host.querySelector(".test-prompt")?.textContent).toBe("Question 2");
  expectSilent();
});

it("keeps the final help question silent and submits its selected answer", async () => {
  const finish = vi.fn(async () => true);
  await act(async () => root.render(createElement(TestHelp, { onAnswer: finish, problem: null })));
  expectSilent();
  await clickText(/^A little$/);
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(finish).toHaveBeenCalledWith("a-little");
});
