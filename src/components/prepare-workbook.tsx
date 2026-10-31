"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminWorkbookRunPath } from "@/lib/admin-view";

/**
 * #312: "Prepare next workbook" on a child. One confirm, then the run starts in the background and the run's page opens
 * with its progress. When a run is active already, that run's page opens.
 */
export function PrepareWorkbook({ childId, child }: { childId: string; child: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (busy || !window.confirm(`Prepare ${child}'s next workbook? The AI writes every page, so it takes a while and costs AI use.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/children/${childId}/workbook-runs`, { method: "POST" });
      if (res.status === 404) { setError("This child is unavailable or your admin access has ended."); return; }
      const result = await res.json() as { ok: boolean; runId?: string; error?: string };
      if (result.runId) { router.push(adminWorkbookRunPath(result.runId)); return; }
      setError(result.error === "unavailable" ? "The database is unavailable. Try again later." : `It did not start: ${result.error ?? "unknown error"}.`);
    } catch { setError("The response was lost. Reload the page to see whether a run started."); }
    finally { setBusy(false); }
  }
  return <div className="adm-row">
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : "Prepare next workbook"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </div>;
}
