"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shownWorkbookEmailStatus, workbookDelivery, workbookEmail, type WorkbookEmailRecord, type WorkbookNoticeKind, type WorkbookEmailStatus } from "@/lib/workbook-email";
import "./workbook-emails.css";

const LABEL: Record<WorkbookEmailStatus, string> = {
  pending: "Waiting to send", sending: "Sending", sent: "Email sent", failed: "Not sent. You can retry.",
  unknown: "Delivery is uncertain. Check the email provider before any further send.", skipped: "Not needed after dispatch",
};
const ERROR: Record<string, string> = {
  invalid: "Check the delivery details.", unavailable: "Email is unavailable. Nothing was sent.",
  card_not_saved: "This child has no confirmed saved card.", welcome_sending: "The welcome email is still sending. Try the dispatch email again in a moment.",
  failed: "The email could not start. Nothing was sent. Reload the page before trying again.",
};

export function WorkbookEmails({ cardId, parentName, parentEmail, childName, records, observedAt }: {
  cardId: string; parentName: string; parentEmail: string; childName: string; records: WorkbookEmailRecord[]; observedAt: number;
}) {
  const router = useRouter();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [number, setNumber] = useState(1);
  const [method, setMethod] = useState("mail");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [preview, setPreview] = useState<WorkbookNoticeKind | null>(null);
  const delivery = workbookDelivery({ method, carrier, trackingNumber, trackingUrl });
  const welcome = records.find((r) => r.kind === "welcome");
  const dispatch = records.find((r) => r.kind === "dispatch" && r.workbook_number === number);
  const retryable = (row?: WorkbookEmailRecord) => !row || row.status === "pending" || row.status === "failed";
  const canWelcome = retryable(welcome) && !records.some((r) => r.kind === "dispatch");
  const canDispatch = retryable(dispatch);
  const email = preview ? workbookEmail({ parentName, childName, kind: preview, workbookNumber: number, delivery }) : null;

  function changed() { setPreview(null); setNotice(""); }
  async function send(kind: WorkbookNoticeKind) {
    if (sending.current || uncertain) return;
    sending.current = true;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/cards/${cardId}/workbook-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, workbookNumber: kind === "welcome" ? 0 : number, delivery: kind === "dispatch" ? delivery : null }),
      });
      if (response.status === 404) { setNotice("Your admin access ended or this card is unavailable."); setPreview(null); return; }
      const result = await response.json();
      if (!response.ok) { setNotice(ERROR[result.error] ?? ERROR.failed); return; }
      if (result.status === "sent") setNotice("Email sent.");
      else if (result.status === "refused") setNotice("The email provider refused it. Nothing was sent. You can retry.");
      else if (result.status === "unknown") { setNotice(LABEL.unknown); setUncertain(true); }
      else setNotice("This email is already recorded or sending. Check its status below.");
      setPreview(null);
      router.refresh();
    } catch {
      setNotice("The response was lost. Reload the page to check the email status before trying again.");
      setUncertain(true);
      setPreview(null);
    } finally { sending.current = false; setBusy(false); }
  }

  return <details className="adm-workbook-emails">
    <summary>Workbook emails</summary>
    <p>Send to {parentEmail} for {childName}.</p>
    <p className="adm-note">The welcome email sends after the card is confirmed. For an earlier signup, you can send it here.</p>
    <button className="btn adm-btn" type="button" disabled={!canWelcome || busy || uncertain} onClick={() => { setPreview("welcome"); setNotice(""); }}>Preview welcome email</button>
    <form onSubmit={(event) => { event.preventDefault(); if (delivery && Number.isInteger(number) && number >= 1 && number <= 10000) setPreview("dispatch"); }}>
      <p className="adm-note">Send a delivery email only after the workbook leaves you. This button sends the email. After the first workbook arrives at the family&apos;s home, use &quot;Workbook delivered: start free month&quot; separately.</p>
      <label>Workbook number<input type="number" min={1} max={10000} required value={number} onChange={(e) => { setNumber(Number(e.target.value)); changed(); }} /></label>
      <label>Delivery method<select value={method} onChange={(e) => { setMethod(e.target.value); changed(); }}>
        <option value="mail">Mail with tracking</option><option value="hand">Hand delivery</option>
      </select></label>
      {method === "mail" && <>
        <label>Carrier<input required maxLength={80} value={carrier} onChange={(e) => { setCarrier(e.target.value); changed(); }} placeholder="Carrier name" /></label>
        <label>Tracking number<input required maxLength={100} value={trackingNumber} onChange={(e) => { setTrackingNumber(e.target.value); changed(); }} /></label>
        <label>Tracking link, optional<input type="url" maxLength={500} pattern="https://.*" value={trackingUrl} onChange={(e) => { setTrackingUrl(e.target.value); changed(); }} placeholder="https://" /></label>
      </>}
      {dispatch && <p role="status">Workbook {number}: {LABEL[shownWorkbookEmailStatus(dispatch, observedAt)]}</p>}
      <button className="btn adm-btn" type="submit" disabled={!canDispatch || busy || uncertain || !delivery}>Preview delivery email</button>
    </form>
    {email && preview && <section aria-label="Email preview" className="adm-workbook-preview">
      <p>To: {parentEmail}</p><p>Subject: {email.subject}</p><pre>{email.text}</pre>
      <button className="btn adm-btn" type="button" disabled={busy || uncertain || (preview === "welcome" ? !canWelcome : !canDispatch)} onClick={() => void send(preview)}>
        {busy ? "Sending..." : preview === "welcome" ? "Send welcome email" : "Send delivery email"}
      </button>
    </section>}
    {notice && <p role="status">{notice}</p>}
    {uncertain && <button className="btn adm-btn" type="button" onClick={() => window.location.reload()}>Reload to check status</button>}
    {records.map((r) => <details key={r.id} className="adm-workbook-history">
      <summary>{r.kind === "welcome" ? "Welcome" : r.kind === "plan_start" ? "Free month confirmation" : `Workbook ${r.workbook_number}`}: {LABEL[shownWorkbookEmailStatus(r, observedAt)]}</summary>
      {r.subject && <p>{r.subject}</p>}{r.text_body && <pre>{r.text_body}</pre>}
    </details>)}
  </details>;
}
