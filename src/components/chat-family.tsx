"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const REFUSED: Record<string, string> = {
  not_test_family: "Only a test family can be the rehearsal family.",
  not_listed: "Add the family to the chat list first.",
  taken: "Another family is the rehearsal family. Stop that rehearsal first.",
};

/**
 * The family's place on the Maya chat list (#530, D-241). A real family on the list gets chat only with the chat switch
 * on and a running plan, from Grade 3. The rehearsal family is a test family that receives notes and weekly recaps.
 */
export function ChatFamily({ parentId, listed, rehearsal, test, compact = false }: { parentId: string; listed: boolean; rehearsal: boolean; test: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(change: { listed: boolean } | { rehearsal: boolean }) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/parents/${parentId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const body = await res.json().catch(() => null) as { result?: string } | null;
      if (!res.ok) { setError(REFUSED[body?.result ?? ""] ?? "The change did not save. Try again."); return; }
      router.refresh();
    } catch {
      setError("The change did not save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  const state = !listed ? (test ? "Not on the chat list. As a test family it has chat anyway." : "Not on the chat list: no chat.")
    : rehearsal ? "On the chat list. Rehearsal family: it receives parent notes and weekly recaps."
    : test ? "On the chat list. A test family: no parent notes or recaps." : "On the chat list.";
  return (
    <div className="adm-row">
      {!compact && <span className="adm-note">{state}</span>}
      <button type="button" className="btn adm-btn" onClick={() => send({ listed: !listed })} disabled={busy}>
        {busy ? "Saving..." : listed ? "Remove from chat list" : "Add to chat list"}
      </button>
      {listed && test && (
        <button type="button" className="btn adm-btn" onClick={() => send({ rehearsal: !rehearsal })} disabled={busy}>
          {rehearsal ? "Stop the rehearsal" : "Make this the rehearsal family"}
        </button>
      )}
      {error && <span role="alert" className="adm-note">{error}</span>}
    </div>
  );
}
