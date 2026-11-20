// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyBatch, boardView, createScene, type Batch } from "@/lib/board";
import type { PlayStep } from "@/lib/board-svg";
import { MayaBoard } from "@/components/maya-board";
import { useBoardSelection, type SelectionControl } from "@/components/maya-board-selection";
import type { SelectionOffer } from "@/lib/maya/board-selection";

const offer: SelectionOffer = { lessonId: "call:regrouping", turnId: "call:regrouping:m2", boardRevision: 2, question: "52 - 28 = ?" };
const batches: Batch[] = [
  { transactionId: "call-b1", commands: [{ op: "columns", id: "question", operation: "subtract", operands: [{ id: "top", value: "52" }, { id: "bottom", value: "28" }], place: { region: "main" } }] },
  { transactionId: "call-b2", commands: [
    { op: "model", id: "exchange-before", model: { kind: "base_ten", hundreds: 0, tens: 5, ones: 2 }, place: { region: "main" } },
    { op: "write", id: "exchange-before-notation", text: "52 = 50 + 2", place: { below: "exchange-before" } },
  ] },
];
const steps: PlayStep[] = [];
{
  let scene = createScene();
  for (const batch of batches) {
    const r = applyBatch(scene, batch);
    if (!r.ok) throw Error(r.refusal.reason);
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(scene) });
  }
}

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function Board({ control }: { control: SelectionControl }) {
  const pick = useBoardSelection(control);
  return createElement(Fragment, null,
    createElement("div", { className: "desk-canvas", "data-pointing": pick.pointing || undefined },
      createElement(MayaBoard, { steps, viewBox: "0 0 1000 800", label: "Maya's board", instant: true, overlay: pick.overlay })),
    pick.panel);
}
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === name || b.getAttribute("aria-label") === name);
const render = (control: SelectionControl) => act(async () => root.render(createElement(Board, { control })));

it("lets the child point by tapping the board or by choosing a native button, and outlines the answered object", async () => {
  const submit = vi.fn(async () => true);
  await render({ offer, batches, submit });
  expect(host.querySelectorAll(".board-pick-target")).toHaveLength(0);
  const toggle = button("Point to a part")!;
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  await act(async () => toggle.click());
  expect(button("Stop pointing")!.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector(".desk-canvas")!.hasAttribute("data-pointing")).toBe(true);
  // Every object Maya drew has a hit area on the board and a button with a spoken name.
  const areas = [...host.querySelectorAll<SVGRectElement>(".board-pick-target")];
  expect(areas.map((a) => a.dataset.object)).toEqual(["question", "exchange-before", "exchange-before-notation"]);
  expect(areas.every((a) => Number(a.getAttribute("width")) > 0 && Number(a.getAttribute("height")) > 0)).toBe(true);
  expect(["Ask about Column work", "Ask about Blocks", "Ask about 52 = 50 + 2"].every((name) => button(name)?.type === "button")).toBe(true);

  await act(async () => areas[1].dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
  expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...offer, objectId: "exchange-before", batchId: "call-b2", selectionId: expect.any(String) }));
  expect(button("Point to a part")!.getAttribute("aria-pressed")).toBe("false");

  // The view names the answered object: it keeps an outline, also after a re-render (paper mode, a layout change).
  await render({ offer: { ...offer, turnId: "call:regrouping:m3" }, batches, submit, selected: { objectId: "exchange-before", batchId: "call-b2", boardRevision: 2 } });
  expect([...host.querySelectorAll<SVGRectElement>(".board-pick-selected")].map((a) => a.dataset.object)).toEqual(["exchange-before"]);
  expect(host.textContent).toContain("You pointed to: Blocks");

  await act(async () => button("Point to a part")!.click());
  await act(async () => button("Ask about 52 = 50 + 2")!.click());
  expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ turnId: "call:regrouping:m3", objectId: "exchange-before-notation" }));
  const ids = (submit.mock.calls as unknown as [{ selectionId: string }][]).map(([t]) => t.selectionId);
  expect(new Set(ids).size).toBe(2);
});

it("leaves pointing mode with Escape, says when a tap fails, and offers nothing without an offer", async () => {
  const submit = vi.fn(async () => false);
  await render({ offer, batches, submit });
  await act(async () => button("Point to a part")!.click());
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(button("Point to a part")!.getAttribute("aria-pressed")).toBe("false");
  await act(async () => button("Point to a part")!.click());
  await act(async () => button("Ask about Blocks")!.click());
  expect(host.textContent).toContain("Maya could not take that. Try again.");
  await render({ batches, submit });
  expect(button("Point to a part")).toBeUndefined();
  expect(host.querySelector(".board-pick-panel")).toBeNull();
});
