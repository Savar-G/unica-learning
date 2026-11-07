"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const MESSAGES: Record<string, string> = {
  saved: "Mark saved. The family sees it now.",
  pending: "Mark saved. The child's progress will update shortly.",
  conflict: "This answer changed since you opened the page. Reload and look again.",
  not_waiting: "This answer already has a mark. Reload to see it.",
  refused: "This answer can no longer be marked here.",
  no_photo: "This answer has no saved photo, so it cannot be marked here. Ask the family to send a new photo of this page.",
  failed: "The mark was not saved. Reload and try again.",
};

/** #715: our team sets the mark of an answer the AI was unsure of. Nothing is chosen until the admin presses one. */
export function AdminTeamMark({ item, version, number }: { item: string; version: number; number: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save(result: "right" | "wrong" | "blank") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/scans/marks", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, version, result }) });
      const answer: { status?: string; recoveryPending?: boolean; error?: string } = await response.json().catch(() => ({}));
      const key = answer.status === "saved" ? answer.recoveryPending ? "pending" : "saved" : answer.status ?? answer.error ?? "failed";
      setMessage(MESSAGES[key] ?? MESSAGES.failed);
      if (answer.status === "saved") router.refresh();
    } catch { setMessage(MESSAGES.failed); }
    finally { setBusy(false); }
  }
  return <div className="adm-row" role="group" aria-label={`Set the mark for question ${number}`}>
    {(["right", "wrong", "blank"] as const).map((r) => <button key={r} type="button" disabled={busy} onClick={() => void save(r)}>{r === "right" ? "Right" : r === "wrong" ? "Wrong" : "Blank"}</button>)}
    {message && <span role="status">{message}</span>}
  </div>;
}
