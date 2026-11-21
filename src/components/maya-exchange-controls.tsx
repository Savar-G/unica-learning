"use client";

import { useState } from "react";
import { useLessonPaper } from "@/components/lesson-paper";
import { ADD_EXCHANGE_OBJECT } from "@/lib/maya/checked-addition";
import type { ExchangeTarget } from "@/lib/maya/checked-exchange";

export interface ExchangeControl {
  target: ExchangeTarget;
  disabled?: boolean;
  submit(target: ExchangeTarget): Promise<boolean>;
}

/** A native button gives the same move to touch, keyboard and assistive technology. */
export function ExchangeControls({ target, disabled, submit }: ExchangeControl) {
  const { paper, setPaper, shared } = useLessonPaper();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // An addition lesson trades ten ones for a ten (#1153); a subtraction lesson trades a ten for ten ones.
  const adding = target.objectId === ADD_EXCHANGE_OBJECT;
  const exchange = async () => {
    setBusy(true);
    setError(false);
    try { setError(!await submit(target)); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="desk-exchange" role="group" aria-label={adding ? "Trade ten ones" : "Trade a ten"}>
      {!paper && <button type="button" className="desk-exchange-go" disabled={disabled || busy} onClick={() => void exchange()}>{adding ? "Exchange ten ones" : "Exchange one ten"}</button>}
      {!shared && <button type="button" disabled={busy} onClick={() => setPaper(!paper)}>{paper ? "Use board" : "Use paper"}</button>}
      {paper && <p role="status">Show the trade on your paper. Then tell Maya what changed.</p>}
      {!paper && error && <p role="status">The board could not take that move. Try again.</p>}
    </div>
  );
}
