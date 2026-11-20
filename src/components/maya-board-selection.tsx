"use client";

// The child points to a board object to ask Maya about it (#1152). Two equal ways: tap the object on the board in
// pointing mode, or choose it from the list of native buttons (keyboard, switch access and screen readers). The
// object of the last answered tap keeps an outline while the board is the one the child pointed at.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Batch, Rect } from "@/lib/board";
import type { PlayStep } from "@/lib/board-svg";
import { selectableObjects, type SelectedObject, type SelectionOffer, type SelectionTarget } from "@/lib/maya/board-selection";
import "./maya-board-selection.css";

export interface SelectionControl {
  offer?: SelectionOffer;
  /** Maya's batches on this board, in order: the objects come from the commands that drew them. */
  batches: readonly Batch[];
  /** What the board applied: only objects it drew are offered (a batch the board refused draws nothing). */
  steps: readonly PlayStep[];
  selected?: SelectedObject;
  disabled?: boolean;
  /** "changed": the call moved on since this view (the tap was not applied). */
  submit(target: SelectionTarget): Promise<boolean | "changed">;
}

/** The objects with at least one stroke still on the board after these steps. */
export function drawnObjects(steps: readonly PlayStep[]): Set<string> {
  const owner = new Map<string, string>();
  for (const step of steps) {
    for (const path of step.drawn) owner.set(path.id, path.objectId);
    for (const id of step.erased ?? []) owner.delete(id);
  }
  return new Set(owner.values());
}

/** A box around each object Maya's board paints now, in SVG units (MayaBoard's `overlay`). */
export type ObjectBoxes = ReadonlyMap<string, Rect>;

const newTapId = () => globalThis.crypto?.randomUUID?.() ?? `tap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const PAD = 14;

export function useBoardSelection(control: SelectionControl | undefined): {
  pointing: boolean;
  overlay?: (boxes: ObjectBoxes) => ReactNode;
  panel: ReactNode;
} {
  const [pointing, setPointing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"error" | "changed" | null>(null);
  const objects = useMemo(() => {
    const drawn = drawnObjects(control?.steps ?? []);
    return selectableObjects(control?.batches ?? []).filter((o) => drawn.has(o.objectId));
  }, [control?.batches, control?.steps]);
  const offer = control?.offer;
  const active = !!control && !!offer && objects.length > 0;
  const selected = control?.selected && objects.find((o) => o.objectId === control.selected!.objectId && o.batchId === control.selected!.batchId);
  const pointingNow = pointing && active;

  useEffect(() => {
    if (!pointingNow) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setPointing(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [pointingNow]);

  if (!control || (!active && !selected)) return { pointing: false, panel: null };
  const blocked = busy || control.disabled === true;
  const pick = async (objectId: string, batchId: string) => {
    if (!offer || blocked) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await control.submit({ ...offer, objectId, batchId, selectionId: newTapId() });
      // A changed board keeps pointing mode on, so the child can point again at once.
      setProblem(result === "changed" ? "changed" : result ? null : "error");
      if (result === true) setPointing(false);
    } catch { setProblem("error"); }
    finally { setBusy(false); }
  };

  const overlay = (boxes: ObjectBoxes) => (
    <g className="board-pick" aria-hidden="true" data-pointing={pointingNow || undefined}>
      {objects.map((o) => {
        const box = boxes.get(o.objectId);
        if (!box) return null;
        const isSelected = selected?.objectId === o.objectId;
        if (!pointingNow && !isSelected) return null;
        return <rect
          key={o.objectId}
          // In pointing mode every object takes a tap, the outlined one too.
          className={pointingNow ? `board-pick-target${isSelected ? " board-pick-selected" : ""}` : "board-pick-selected"}
          data-object={o.objectId}
          x={box.x - PAD} y={box.y - PAD} width={box.w + 2 * PAD} height={box.h + 2 * PAD} rx={12}
          onPointerUp={pointingNow ? (e) => { e.stopPropagation(); void pick(o.objectId, o.batchId); } : undefined}
        />;
      })}
    </g>
  );

  const panel = (
    <div className="board-pick-panel" role="group" aria-label="Ask about part of the board">
      {active && <button type="button" aria-pressed={pointingNow} disabled={blocked} onClick={() => setPointing(!pointingNow)}>
        {pointingNow ? "Stop pointing" : "Point to a part"}
      </button>}
      {pointingNow && <>
        <p id="board-pick-help">Tap the part you want to ask about, or choose it here.</p>
        <ul aria-describedby="board-pick-help">
          {objects.map((o) => <li key={o.objectId}>
            <button type="button" disabled={blocked} aria-label={`Ask about ${o.label}`} onClick={() => void pick(o.objectId, o.batchId)}>{o.label}</button>
          </li>)}
        </ul>
      </>}
      {selected && !pointingNow && <p role="status">You pointed to: {selected.label}</p>}
      {problem === "changed" && <p role="status">The board changed. Point to the part again.</p>}
      {problem === "error" && <p role="status">{"That didn't work. Tap it again."}</p>}
    </div>
  );
  return { pointing: pointingNow, ...(active || selected ? { overlay } : {}), panel };
}
