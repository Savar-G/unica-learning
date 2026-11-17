"use client";

import { useState } from "react";
import type { ExchangeTarget } from "@/lib/maya/checked-exchange";

export interface ExchangeControl {
  target: ExchangeTarget;
  disabled?: boolean;
  submit(target: ExchangeTarget): Promise<boolean>;
}

/** A native button gives the same move to touch, keyboard and assistive technology. */
export function ExchangeControls({ target, disabled, submit }: ExchangeControl) {
  const [paper, setPaper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const exchange = async () => {
    setBusy(true);
    setError(false);
    try { setError(!await submit(target)); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="desk-exchange" role="group" aria-label="Trade a ten">
      {!paper && <button type="button" disabled={disabled || busy} onClick={() => void exchange()}>Exchange one ten</button>}
      <button type="button" disabled={busy} onClick={() => setPaper(!paper)}>{paper ? "Use board" : "Use paper"}</button>
      {paper && <p role="status">Show the trade on your paper. Then tell Maya what changed.</p>}
      {!paper && error && <p role="status">The board could not take that move. Try again.</p>}
    </div>
  );
}
