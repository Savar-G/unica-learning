"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryReceipt } from "@/lib/workbook-delivery";
import { familyZoneName, formatInZone, type FamilyZone } from "@/lib/family-time";

const ERRORS: Record<string, string> = {
  invalid_delivery_time: "Use a delivery time after shipment and before now.",
  invalid_time: "Enter a valid date and time in the family's time zone.",
  delivery_conflict: "Delivery is already saved with a different time. Reload to see the saved record.",
  family_frozen: "This family is being deleted. Delivery cannot be saved.",
  zone_changed: "The family's time zone changed. Reload before you confirm delivery.",
  not_shipped: "Mark this workbook shipped before you confirm delivery.",
  correction_reason_required: "Enter a short reason for the correction, up to 300 characters.",
  stale_delivery: "Another admin changed the delivery time. Reload before you correct it.",
  correction_conflict: "This correction was already sent with different details. Reload before you correct it.",
  time_unchanged: "Enter a different delivery time to make a correction.",
};
export function WorkbookDelivery({ workbookId, childId, number, timeZone, receipt, actor }: {
  workbookId: string; childId: string; number: number; timeZone: FamilyZone; receipt: DeliveryReceipt | null; actor?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const when = (at: string) => formatInZone(at, timeZone, { dateStyle: "medium", timeStyle: "short" }).replace(/\.$/, "");
  const correction = receipt?.correction;
  function beginCorrection() {
    setCorrecting(true); setLocalTime(receipt?.localTime ?? ""); setReason(""); setRequestId(crypto.randomUUID()); setError("");
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy || !localTime) return;
    if (correcting && !reason.trim()) { setError(ERRORS.correction_reason_required); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/workbooks/${workbookId}/delivery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, number, localTime, timeZone,
          ...(correcting && receipt ? { action: "correct", reason, requestId, expectedAuditId: correction?.auditId ?? receipt.auditId } : {}) }),
      });
      if (response.status === 404) { setError("This workbook is unavailable or your admin access has ended."); return; }
      const result = await response.json();
      if (response.ok && result.status === "confirmed") { setCorrecting(false); router.refresh(); return; }
      setError(ERRORS[result.reason] ?? "Delivery was not saved. Reload and try again.");
    } catch { setError("The response was lost. Reload to check the saved record before trying again."); }
    finally { setBusy(false); }
  }
  return <section className="adm-wb-section" aria-labelledby="workbook-delivery">
    <h2 id="workbook-delivery">Workbook delivery</h2>
    {receipt ? <>
      <p className="adm-note"><b>Delivery confirmed.</b> Workbook {number} arrived {when(receipt.deliveredAt)}.</p>
      <p className="adm-note">{familyZoneName(timeZone)}. {correction ? "Corrected" : "Recorded"} {when(correction?.recordedAt ?? receipt.recordedAt)} by {actor ?? correction?.actorId ?? receipt.actorId}.</p>
      {correction && <p className="adm-note">Reason: {correction.reason}. The original time and each correction are in the audit log.</p>}
      {!correcting && <button type="button" className="btn adm-btn" onClick={beginCorrection}>Correct delivery time</button>}
    </> : <p className="adm-note"><b>Delivery needs confirmation.</b> Enter when workbook {number} arrived at the family&apos;s home.</p>}
    {(!receipt || correcting) && <>
      {correcting && <p className="adm-note">Enter the correct delivery time and a short reason. The reminder and next-workbook dates will use this time.</p>}
      <form className="adm-filters adm-wb-delivery" onSubmit={confirm}>
        <label htmlFor="delivered-time">Date and time delivered
          <input id="delivered-time" type="datetime-local" required value={localTime} onChange={(e) => setLocalTime(e.target.value)} disabled={busy} aria-describedby="delivery-zone" />
        </label>
        {correcting && <label htmlFor="delivery-reason">Reason for correction
          <input id="delivery-reason" type="text" required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </label>}
        <button className="btn adm-btn" type="submit" disabled={busy}>{busy ? "Saving..." : correcting ? "Save corrected time" : "Confirm workbook delivered"}</button>
        {correcting && <button className="btn adm-btn" type="button" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button>}
      </form>
      <p id="delivery-zone" className="adm-note">Use {familyZoneName(timeZone)}. {correcting ? "The audit log will keep the previous time and your reason." : "You can correct a saved time with a reason."}</p>
    </>}
    <p className="adm-note">To start the first free month, use <Link href="/admin/next-steps">Plans and delivery</Link>. Saving a delivery time does not start or restart billing.</p>
    {error && <p className="adm-note" role="alert">{error}</p>}
  </section>;
}
