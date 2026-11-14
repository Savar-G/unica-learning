"use client";
import { useState } from "react";
import type { ReferralReply } from "@/lib/referrals";
export function AdminReferrals() {
  const [parent, setParent] = useState(""), [code, setCode] = useState(""), [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ReferralReply["preview"]>(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const invalidate = () => { setPreview(undefined); setMessage(""); };
  async function send(action: "preview" | "correct") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, parent, code, reason, preview: preview?.token }) });
      const result: ReferralReply = await response.json();
      if (result.ok && action === "preview" && result.preview) setPreview(result.preview);
      else if (result.ok) { setMessage("Correction recorded. Paid invoices stay unchanged."); setPreview(undefined); }
      else { setMessage(result.error === "email_pending" ? "The reward email is being sent, or its delivery result is unknown. Confirm the email result before you move this reward." : "The correction was not confirmed. Read a new preview before you try again."); setPreview(undefined); }
    } catch { setMessage("The result is unknown. Read a new preview before you try again."); setPreview(undefined); }
    finally { setBusy(false); }
  }
  return <section className="acct-form">
    <div className="fld"><label htmlFor="ref-parent">Family ID</label><input id="ref-parent" value={parent} onChange={e => { setParent(e.target.value); invalidate(); }} /></div>
    <div className="fld"><label htmlFor="ref-code">Correct referral code</label><input id="ref-code" value={code} maxLength={64} onChange={e => { setCode(e.target.value); invalidate(); }} /></div>
    <div className="fld"><label htmlFor="ref-reason">Reason</label><textarea id="ref-reason" value={reason} maxLength={1000} onChange={e => { setReason(e.target.value); invalidate(); }} /></div>
    <button type="button" className="btn" disabled={busy || !parent || !code || !reason.trim()} onClick={() => void send("preview")}>Preview correction</button>
    {preview && <div className="acct-alert"><p>Previous referring account: {preview.before ?? "None"}. Correct referring account: {preview.after}.</p>
      <p>{preview.used} used child benefits. {preview.unused} unused child benefits. {preview.paid ? "A payment is recorded." : "No payment is recorded."}</p>
      <p>A reward that has started keeps its fixed children and benefits. An unstarted earned reward moves to the correct family. This correction gives no second new-customer benefit. Paid invoices stay unchanged.</p>
      <button type="button" className="btn" disabled={busy} onClick={() => void send("correct")}>Record this correction</button></div>}
    <p role="status">{message}</p>
  </section>;
}
