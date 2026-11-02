"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * D-200: "Run on the server with the API" on a run that waits for the Mac. One confirm (it costs API money), then the
 * server makes the run and the page shows its progress.
 */
export function RunOnServer({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (busy || !window.confirm("Run this workbook on the server with the paid API? It costs API money. The Mac will not take it after that.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/workbook-runs/${runId}/server`, { method: "POST" });
      if (res.status === 404) { setError("This run is unavailable or your admin access has ended."); return; }
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { router.refresh(); return; }
      setError(result.error === "busy" ? "Someone is working on this run now, or it ended. Reload the page." : result.error === "unavailable" ? "The database is unavailable. Try again later." : `It did not start: ${result.error ?? "unknown error"}.`);
    } catch { setError("The response was lost. Reload the page to see whether it started."); }
    finally { setBusy(false); }
  }
  return <div className="adm-row">
    <button type="button" className="btn adm-btn" onClick={run} disabled={busy}>{busy ? "Starting..." : "Run on the server with the API"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </div>;
}
