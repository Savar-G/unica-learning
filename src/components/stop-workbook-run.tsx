"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The Stop button on a workbook run: it asks first, on the page, then the server ends the run. Pressing it again, or
 * after another admin stopped the run, is harmless: the first stop stays.
 */
export function StopWorkbookRun({ runId, started, pages }: { runId: string; started: boolean; pages: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function stop() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/workbook-runs/${runId}/stop`, { method: "POST" });
      if (res.status === 404) { setError("This run is unavailable or your admin access has ended."); return; }
      if (res.status === 403) { setError("The stop was refused, so the run is still going. Reload the page and try again."); return; }
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { setAsking(false); router.refresh(); return; }
      if (result.error === "done") { setError("This run finished before the stop. Its draft is ready."); router.refresh(); return; }
      if (result.error === "failed" || result.error === "stale") { setError("This run ended before the stop."); router.refresh(); return; }
      setError("The stop did not work. The database is unavailable. Try again.");
    } catch { setError("The response was lost. Reload the page to see whether the run stopped."); }
    finally { setBusy(false); }
  }
  if (!asking) {
    return <span className="adm-wb-stop">
      <button type="button" className="btn adm-btn" onClick={() => setAsking(true)}>Stop this run</button>
      {error && <span role="alert" className="adm-sub">{error}</span>}
    </span>;
  }
  return <span className="adm-wb-stop adm-wb-stop-ask" role="group" aria-label="Stop this run?">
    <b>Stop this run?</b>
    {started
      ? <span>The AI stops writing and any page printing ends, within about a minute. {pages === 0 ? "No pages are finished yet." : pages === 1 ? "The 1 finished page is not used." : `The ${pages} finished pages are not used.`}</span>
      : <span>This run will not start.</span>}
    <span>Prepare next workbook starts a new run.</span>
    <span className="adm-wb-stop-row">
      <button type="button" className="btn adm-btn" onClick={stop} disabled={busy}>{busy ? "Stopping..." : "Yes, stop it"}</button>
      <button type="button" className="btn adm-btn" onClick={() => setAsking(false)} disabled={busy}>Keep it running</button>
    </span>
    {error && <span role="alert" className="adm-sub">{error}</span>}
  </span>;
}
