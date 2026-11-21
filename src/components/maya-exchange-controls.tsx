"use client";

import { useState } from "react";
import { useLessonPaper } from "@/components/lesson-paper";
import type { ExchangeTarget } from "@/lib/maya/checked-exchange";
import { FRACTION_OBJECT, partName } from "@/lib/maya/checked-fraction";

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
  // #1156: the fraction split names the parts it makes ("Split into eighths").
  const split = target.objectId === FRACTION_OBJECT && target.parts !== undefined ? partName(target.parts) : null;
  const exchange = async () => {
    setBusy(true);
    setError(false);
    try { setError(!await submit(target)); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="desk-exchange" role="group" aria-label={split ? "Split the parts" : "Trade a ten"}>
      {!paper && <button type="button" className="desk-exchange-go" disabled={disabled || busy} onClick={() => void exchange()}>{split ? `Split into ${split}` : "Exchange one ten"}</button>}
      {!shared && <button type="button" disabled={busy} onClick={() => setPaper(!paper)}>{paper ? "Use board" : "Use paper"}</button>}
      {paper && <p role="status">{split ? `Split the parts into ${split} on your paper. Then tell Maya how many you have.` : "Show the trade on your paper. Then tell Maya what changed."}</p>}
      {!paper && error && <p role="status">The board could not take that move. Try again.</p>}
    </div>
  );
}
