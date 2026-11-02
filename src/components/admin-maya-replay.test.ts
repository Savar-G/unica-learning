// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MayaBoard } from "./maya-board";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
import { MayaCall } from "./admin-maya";
import { boardPlayback, recordView } from "@/lib/maya-call";
import { createHistory, mayaWrites, takePen, givePen, drawStroke, historyFromRecording, replayFrame, type Change, type BoardHistory } from "@/lib/board-history";
import { pathData } from "@/lib/board-svg";
import { callReplay } from "@/lib/maya-call-review";
import { reviewFixture } from "@/lib/maya-call-review-fixture";

let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); vi.unstubAllGlobals(); });
async function mount(voice: boolean, reduced = false, boardHistory?: BoardHistory) {
  const fixture = await reviewFixture();
  const view = voice ? fixture.voice : fixture.text;
  if (boardHistory) view.boardHistory = boardHistory;
  view.technicalNotes = ["private-provider-error"];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  const frames = new Map<number, FrameRequestCallback>(); let id = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(MayaCall, { initial: view, board: boardPlayback(view.batches), childName: "Iris" })));
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
    expect(button, label).toBeDefined(); await act(async () => button!.click());
  };
  const advance = async (ms: number) => {
    const pending = [...frames.values()]; frames.clear();
    await act(async () => pending.forEach((f) => f(performance.now() + ms)));
  };
  return { fixture, view, click, advance };
}
it.each([false, true])("plays, pauses, seeks and finishes a saved call, voice=%s", async (voice) => {
  const f = await mount(voice);
  expect(host.querySelector("details")?.open).toBe(false);
  expect(host.querySelector("details")?.textContent).toContain("private-provider-error");
  expect(host.textContent?.replace(host.querySelector("details")!.textContent!, "")).not.toContain("private-provider-error");
  if (voice) {
    expect(host.querySelector("details")?.textContent).toContain("speech-test-version");
    expect(host.querySelector("details")?.textContent).toContain("voice-test-version");
    expect(host.textContent).toContain("0:38");
  }
  await f.click("Replay the call");
  await f.advance(5000);
  const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(Number(slider.value)).toBeGreaterThanOrEqual(5000);
  expect(host.querySelector('[aria-current="step"]')).not.toBeNull();
  await f.click("Pause");
  const paused = slider.value;
  await f.advance(9000);
  expect(slider.value).toBe(paused);
  const jump = host.querySelector<HTMLButtonElement>('button[aria-label^="Show board at 0:10"]')!;
  expect(jump).not.toBeNull();
  await act(async () => jump.click());
  expect(Number(slider.value)).toBe(10000);
  expect(jump.closest("li")?.getAttribute("aria-current")).toBe("step");
  const expected = replayFrame(callReplay(f.view), 10000);
  const paths = [...host.querySelectorAll("svg.maya-board > path")].map((p) => p.getAttribute("d"));
  expect(paths).toEqual(expected.maya.map((s) => pathData(s.path.pts)));
  await f.click("Show finished");
  expect(host.querySelector('[aria-current="step"]')).toBeNull();
  expect(Number(slider.value)).toBe(callReplay(f.view).durationMs);
});
it("keeps a still board with reduced motion and permits selecting a turn", async () => {
  await mount(false, true);
  expect([...host.querySelectorAll("button")].find((b) => b.textContent === "Replay the call")?.disabled).toBe(true);
  const jump = host.querySelector<HTMLButtonElement>('button[aria-label^="Show board at 0:10"]')!;
  await act(async () => jump.click());
  expect(host.querySelector('[aria-current="step"]')).not.toBeNull();
});
it("rebuilds an older saved call from its trace with the original board times", async () => {
  const f = await reviewFixture();
  const old = recordView({ ...f.record, boardHistory: null })!;
  expect(old.boardHistory).toEqual(f.text.boardHistory);
  const saved = callReplay(old);
  const last = old.boardHistory.events.filter((e) => e.kind === "maya").at(-1)!;
  expect(last.t).toBeGreaterThan(0);
  expect(replayFrame(saved, last.t - 1).maya).not.toEqual(replayFrame(saved, Infinity).maya);
});

it("shows saved child ink at a selected turn and removes it after the recorded clear", async () => {
  const history = historyFromRecording({ v: 1, width: 800, height: 600, events: [
    { kind: "stroke", erase: false, w: 4, pts: [[0.2, 0.3, 5000], [0.4, 0.5, 9000]] },
    { kind: "clear", t: 12000 },
  ] });
  await mount(false, false, history);
  expect(host.querySelector("svg.maya-board g[aria-label] path")).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Show board at 0:10"]')!.click());
  expect(host.querySelector("svg.maya-board g[aria-label] path")?.getAttribute("d")).toContain("M");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Show board at 0:15"]')!.click());
  expect(host.querySelector("svg.maya-board g[aria-label] path")).toBeNull();
});

it("scrolls within the transcript when the board puts the transcript far down the page", async () => {
  await mount(false);
  const list = host.querySelector<HTMLOListElement>("ol.mc-talk")!;
  Object.defineProperty(list, "offsetTop", { configurable: true, value: 1000 });
  [...list.children].forEach((line, i) => Object.defineProperty(line, "offsetTop", { configurable: true, value: i * 100 }));
  const scroll = vi.spyOn(list, "scrollTo");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Show board at 0:10"]')!.click());
  const selected = host.querySelector<HTMLElement>('[aria-current="step"]')!;
  expect(scroll).toHaveBeenLastCalledWith({ top: selected.offsetTop - 12, behavior: "instant" });
  expect(selected.offsetTop).toBeLessThan(list.offsetTop);
});

it("R442-2: renders the saved geometry when child ink moves Maya's writing", () => {
  const accepted = (change: Change) => { if (!change.ok) throw new Error(change.reason); return change.history; };
  let history = accepted(takePen(createHistory(), 0));
  history = accepted(drawStroke(history, { erase: false, w: 3.2, boardWidth: 800, page: 1, pts: [[0.06, 0.06, 10], [0.11, 0.08, 20]] }));
  history = accepted(givePen(history, 30));
  const batch = { transactionId: "sum", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] };
  history = accepted(mayaWrites(history, batch, 40));
  const saved = callReplay({ boardHistory: history, transcript: [], outcome: null });
  const frame = replayFrame(saved, Infinity);
  const board = boardPlayback([batch]);
  expect(frame.maya[0].path.id).toBe(board.steps[0].drawn[0].id);
  expect(pathData(frame.maya[0].path.pts)).not.toBe(pathData(board.steps[0].drawn[0].pts));
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(MayaBoard, { steps: board.steps, viewBox: saved.viewBox, label: "Saved board", frame }));
  expect([...host.querySelectorAll("svg > path")].map((p) => p.getAttribute("d"))).toEqual(frame.maya.map((s) => pathData(s.path.pts)));
});
