"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanCancelRecovery({ parentId, operations }: {
  parentId: string; operations: { id: string; child_name: string; created_at: string }[] | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function check(operation: string) {
    if (busy) return;
    setBusy(operation); setMessage("");
    try {
      const response = await fetch(`/api/admin/parents/${parentId}/plan-cancels/${operation}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body = await response.json().catch(() => null) as { message?: string; ok?: boolean } | null;
      setMessage(body?.message ?? "The check could not finish. Refresh this page before you try again.");
      if (response.ok && body?.ok) router.refresh();
    } catch { setMessage("The check could not finish. Refresh this page before you try again."); }
    finally { setBusy(null); }
  }
  if (operations?.length === 0 && !message) return null;
  return <section aria-label="Open cancellations">
    <h2>Open cancellations</h2>
    {operations === null ? <p role="alert">Open cancellations could not be read. Refresh this page before you take action.</p> : operations.map(operation => <div className="adm-row" key={operation.id}>
      <span>{operation.child_name}: Cancel is still open.</span>
      <button type="button" className="btn adm-btn" disabled={busy !== null} onClick={() => check(operation.id)}>
        {busy === operation.id ? "Checking Stripe..." : "Check Stripe and close this cancel"}
      </button>
    </div>)}
    {message && <p role="status">{message}</p>}
  </section>;
}
