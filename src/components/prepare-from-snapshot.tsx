"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NextBookButtonState } from "@/lib/next-book-button";

/**
 * #476: "Prepare from snapshot" on a child's delivered book 1. It prepares book 2 from what the child marked in book 1
 * and shows one status line. Pressing it again is safe: it picks up where the last press stopped. Until the planner is
 * wired it shows disabled; when the page could not read the book's delivery it shows only a note.
 */
export function PrepareFromSnapshot({ childId, state }: { childId: string; state: Exclude<NextBookButtonState, "hidden"> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  if (state === "unavailable") return <p className="adm-note">Next book status is unavailable.</p>;
  async function prepare() {
    if (busy) return;
    setBusy(true);
    setLine("");
    try {
      const res = await fetch(`/api/admin/children/${childId}/next-book`, { method: "POST" });
      if (res.status === 404) { setLine("This child is unavailable or your admin access has ended."); return; }
      const result = await res.json() as { ok?: boolean; line?: string };
      setLine(typeof result.line === "string" ? result.line : "It could not be prepared. Try again later.");
      if (result.ok) router.refresh();
    } catch { setLine("The response was lost. Press again to see where it stands."); }
    finally { setBusy(false); }
  }
  const ready = state === "ready";
  return <div className="adm-row">
    <button type="button" className="btn adm-btn" onClick={prepare} disabled={busy || !ready}>{busy ? "Preparing..." : "Prepare from snapshot"}</button>
    {!ready && <p className="adm-note">The planner is not ready yet.</p>}
    {line && <p role="status" className="adm-note">{line}</p>}
  </div>;
}
