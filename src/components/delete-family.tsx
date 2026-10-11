"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const ERRORS: Record<string, string> = {
  confirmation: "Enter the parent's email address exactly as shown.",
  protected: "An admin account cannot be deleted here.",
  busy: "A card action is in progress. Try again after it finishes.",
  unavailable: "Deletion is unavailable. Try again later.",
  pending: "Deletion is incomplete. The request is saved. Select Delete family to try again.",
};

/** Uses the accepted admin styles. The action stays closed until an admin confirms the exact family. */
export function DeleteFamily({ parentId, email }: { parentId: string; email: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/parents/${parentId}/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }),
      });
      if (res.status === 404) { setError("This family is unavailable or your admin access has ended."); return; }
      const result = await res.json();
      if (res.ok && result.ok) { router.push("/admin/parents?deleted=1"); router.refresh(); return; }
      setError(ERRORS[result.error] ?? "Deletion could not finish. Try again.");
    } catch { setError("The response was lost. Select Delete family to check and try again."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="delete-family-title">
    <h2 id="delete-family-title">Delete family</h2>
    <details className="adm-delete">
      <summary>Delete this family&apos;s account and assessment data</summary>
      <p>This removes the parent account, all children, tests, answers, work reviews, reports, email records, and stored drawings. This cannot be undone.</p>
      <p>This action does not cancel a workbook subscription. Check any payment or cancellation request separately.</p>
      <form onSubmit={submit}>
        <label htmlFor="delete-confirmation">Enter {email} to confirm</label>
        <input id="delete-confirmation" type="email" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required disabled={busy} />
        {error && <p role="alert">{error}</p>}
        <button className="btn adm-btn" type="submit" disabled={busy || confirmation !== email}>{busy ? "Deleting family..." : "Delete family"}</button>
        <span role="status" className="adm-note">{busy ? "Keep this page open while deletion finishes." : ""}</span>
      </form>
    </details>
  </section>;
}
