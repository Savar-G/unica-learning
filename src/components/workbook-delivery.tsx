"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryReceipt } from "@/lib/workbook-delivery";
import { formatInZone, type FamilyZone } from "@/lib/family-time";

const ERRORS: Record<string, string> = {
  invalid_delivery_time: "Use a delivery time after shipment and before now.",
  invalid_time: "Enter a valid date and time in the family's time zone.",
  delivery_conflict: "Delivery is already saved with a different time. Reload to see the saved record.",
  family_frozen: "This family is being deleted. Delivery cannot be saved.",
  zone_changed: "The family's time zone changed. Reload before you confirm delivery.",
  not_shipped: "Mark this workbook shipped before you confirm delivery.",
};
export function WorkbookDelivery({ workbookId, childId, number, timeZone, receipt, actor }: {
  workbookId: string; childId: string; number: number; timeZone: FamilyZone; receipt: DeliveryReceipt | null; actor?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localTime, setLocalTime] = useState("");
  const [error, setError] = useState("");
  const when = (at: string) => formatInZone(at, timeZone, { dateStyle: "medium", timeStyle: "short" });
  const zoneName = typeof timeZone === "string" ? timeZone : timeZone.zone;
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy || !localTime) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/workbooks/${workbookId}/delivery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, number, localTime, timeZone }),
      });
      if (response.status === 404) { setError("This workbook is unavailable or your admin access has ended."); return; }
      const result = await response.json();
      if (response.ok && result.status === "confirmed") { router.refresh(); return; }
      setError(ERRORS[result.reason] ?? "Delivery was not saved. Reload and try again.");
    } catch { setError("The response was lost. Reload to check the saved record before trying again."); }
    finally { setBusy(false); }
  }
  return <section className="adm-wb-section" aria-labelledby="workbook-delivery">
    <h2 id="workbook-delivery">Workbook delivery</h2>
    {receipt ? <>
      <p className="adm-note"><b>Delivery confirmed.</b> Workbook {number} arrived {when(receipt.deliveredAt).replace(/\.$/, "")}.</p>
      <p className="adm-note">Family time zone: {zoneName}. Recorded {when(receipt.recordedAt)} by {actor ?? receipt.actorId}.</p>
    </> : <>
      <p className="adm-note"><b>Delivery needs confirmation.</b> Enter when workbook {number} arrived at the family&apos;s home.</p>
      <form className="adm-filters adm-wb-delivery" onSubmit={confirm}>
        <label htmlFor="delivered-time">Date and time delivered
          <input id="delivered-time" type="datetime-local" required value={localTime} onChange={(e) => setLocalTime(e.target.value)} disabled={busy} aria-describedby="delivery-zone" />
        </label>
        <button className="btn adm-btn" type="submit" disabled={busy}>{busy ? "Saving..." : "Confirm workbook delivered"}</button>
      </form>
      <p id="delivery-zone" className="adm-note">Family time zone: {zoneName}. The saved delivery time cannot change.</p>
    </>}
    <p className="adm-note">This record does not start or restart billing. Start the first free month separately under Cards and waitlist.</p>
    {error && <p className="adm-note" role="alert">{error}</p>}
  </section>;
}
