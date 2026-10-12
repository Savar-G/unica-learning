"use client";
// Variant B of round r18: one child at a time, with a two-button switch. Leah shows first.
import { useState, type ReactNode } from "react";
import type { SampleChildId } from "@/lib/sample-children";

export function ChildSwitch({ panels, names }: { panels: Record<SampleChildId, ReactNode>; names: Record<SampleChildId, string> }) {
  const [shown, setOn] = useState<SampleChildId>("a");
  return (
    <div className="pz-switch">
      <div className="pz-tabs" role="tablist" aria-label="Sample children">
        {(["a", "b"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`pz-tab-${id}`}
            aria-controls={`pz-panel-${id}`}
            aria-selected={shown === id}
            className={shown === id ? "on" : ""}
            onClick={() => setOn(id)}
          >
            <span className={`pz-dot pz-dot-${id}`} aria-hidden="true" />
            {names[id]}
          </button>
        ))}
      </div>
      {(["a", "b"] as const).map((id) => (
        <div key={id} role="tabpanel" id={`pz-panel-${id}`} aria-labelledby={`pz-tab-${id}`} hidden={shown !== id}>
          {panels[id]}
        </div>
      ))}
    </div>
  );
}
