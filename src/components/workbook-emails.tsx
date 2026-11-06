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
  ready_sending: "The workbook ready email is still sending. Try the delivery email again in a moment.",
  failed: "The email could not start. Nothing was sent. Reload the page before trying again.",
};

export function WorkbookEmails({ cardId, parentName, parentEmail, childName, records, observedAt, workbookNumber, allowReady = true }: {
  cardId: string; parentName: string; parentEmail: string; childName: string; records: WorkbookEmailRecord[]; observedAt: number;
  workbookNumber?: number; allowReady?: boolean;
}) {
  const router = useRouter();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [chosenNumber, setNumber] = useState(1);
  const number = workbookNumber ?? chosenNumber;
  const [method, setMethod] = useState<"mail" | "hand" | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [preview, setPreview] = useState<WorkbookNoticeKind | null>(null);
  const [held, setHeld] = useState<string[]>([]);
  const delivery = workbookDelivery({ method, carrier, trackingNumber, trackingUrl });
  const welcome = records.find((r) => r.kind === "welcome");
  const dispatch = records.find((r) => r.kind === "dispatch" && r.workbook_number === number);
  const ready = records.find((r) => r.kind === "ready" && r.workbook_number === number);
  const retryable = (row?: WorkbookEmailRecord) => !row || row.status === "pending" || row.status === "failed";
  const key = (kind: WorkbookNoticeKind) => `${kind}:${kind === "welcome" ? 0 : number}`;
  const canWelcome = !held.includes(key("welcome")) && retryable(welcome) && !records.some((r) => r.kind === "dispatch" || r.kind === "ready");
  const canDispatch = !held.includes(key("dispatch")) && retryable(dispatch);
  const canReady = allowReady && !dispatch && !held.includes(key("dispatch")) && !held.includes(key("ready")) && retryable(ready);
  const canSend = (kind: WorkbookNoticeKind) => kind === "welcome" ? canWelcome : kind === "ready" ? canReady : canDispatch;
  const validNumber = Number.isInteger(number) && number >= 1 && number <= 10000;
  const email = preview ? workbookEmail({ parentName, childName, kind: preview, workbookNumber: number, delivery }) : null;

  function changed() { setPreview(null); setNotice(""); }
  async function send(kind: WorkbookNoticeKind) {
    if (sending.current || uncertain || !canSend(kind)) return;
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
      if (result.status !== "refused") setHeld((old) => [...old, key(kind)]);
      setPreview(null);
      router.refresh();
    } catch {
      setNotice("The response was lost. Reload the page to check the email status before trying again.");
      setUncertain(true);
      setPreview(null);
    } finally { sending.current = false; setBusy(false); }
  }

  return <details className="adm-workbook-emails" open={workbookNumber !== undefined ? true : undefined}>
    <summary>Workbook emails</summary>
    <p>Send to {parentEmail} for {childName}.</p>
    {workbookNumber === undefined && <>
      <p className="adm-note">The welcome email sends after the card is confirmed. For an earlier signup, you can send it here.</p>
      <button className="btn adm-btn" type="button" disabled={!canWelcome || busy || uncertain} onClick={() => { setPreview("welcome"); setNotice(""); }}>Preview welcome email</button>
      <label>Workbook number<input type="number" min={1} max={10000} required value={number} onChange={(e) => { setNumber(Number(e.target.value)); changed(); }} /></label>
    </>}
    <p>Workbook {number}</p>
    <p className="adm-note">Each button opens an email preview. Send Workbook ready when the printed workbook is ready. Send a delivery email only after it leaves you. These emails do not change the workbook status or billing.</p>
    <div className="adm-row">
      <button className="btn adm-btn" type="button" disabled={!validNumber || !canReady || busy || uncertain} onClick={() => { setMethod(null); setPreview("ready"); setNotice(""); }}>Workbook ready</button>
      <button className="btn adm-btn" type="button" disabled={!validNumber || !canDispatch || busy || uncertain} onClick={() => { setMethod("hand"); setPreview("dispatch"); setNotice(""); }}>Hand delivery</button>
      <button className="btn adm-btn" type="button" disabled={!validNumber || !canDispatch || busy || uncertain} onClick={() => { setMethod("mail"); changed(); }}>Courier</button>
    </div>
    {ready && <p role="status">Workbook ready: {LABEL[shownWorkbookEmailStatus(ready, observedAt)]}</p>}
    {dispatch && <p role="status">Delivery: {LABEL[shownWorkbookEmailStatus(dispatch, observedAt)]}</p>}
    {method === "mail" && <form onSubmit={(event) => { event.preventDefault(); if (delivery && validNumber && canDispatch) setPreview("dispatch"); }}>
        <label>Carrier<input required maxLength={80} value={carrier} onChange={(e) => { setCarrier(e.target.value); changed(); }} placeholder="Carrier name" /></label>
        <label>Tracking number<input required maxLength={100} value={trackingNumber} onChange={(e) => { setTrackingNumber(e.target.value); changed(); }} /></label>
        <label>Tracking link, optional<input type="url" maxLength={500} pattern="https://.*" value={trackingUrl} onChange={(e) => { setTrackingUrl(e.target.value); changed(); }} placeholder="https://" /></label>
      <button className="btn adm-btn" type="submit" disabled={!canDispatch || busy || uncertain || !delivery}>Preview courier email</button>
    </form>}
    {email && preview && <section aria-label="Email preview" className="adm-workbook-preview">
      <p>To: {parentEmail}</p><p>Subject: {email.subject}</p><pre>{email.text}</pre>
      <button className="btn adm-btn" type="button" disabled={busy || uncertain || !canSend(preview)} onClick={() => void send(preview)}>
        {busy ? "Sending..." : preview === "welcome" ? "Send welcome email" : preview === "ready" ? "Send workbook ready email" : "Send delivery email"}
      </button>
    </section>}
    {notice && <p role="status">{notice}</p>}
    {uncertain && <button className="btn adm-btn" type="button" onClick={() => window.location.reload()}>Reload to check status</button>}
    {records.map((r) => <details key={r.id} className="adm-workbook-history">
      <summary>{r.kind === "welcome" ? "Welcome" : r.kind === "plan_start" ? "Free month confirmation" : `Workbook ${r.workbook_number} ${r.kind === "ready" ? "ready" : "delivery"}`}: {LABEL[shownWorkbookEmailStatus(r, observedAt)]}</summary>
      {r.subject && <p>{r.subject}</p>}{r.text_body && <pre>{r.text_body}</pre>}
    </details>)}
  </details>;
}
