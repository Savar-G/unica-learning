import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";

export type WorkbookEmailKind = "welcome" | "dispatch";
export type WorkbookEmailStatus = "pending" | "sending" | "sent" | "failed" | "unknown" | "skipped";
export type WorkbookDelivery = { method: "hand" } | { method: "mail"; carrier: string; trackingNumber: string; trackingUrl: string };

export interface WorkbookEmailRecord {
  id: string;
  kind: WorkbookEmailKind;
  workbook_number: number;
  status: WorkbookEmailStatus;
  claimed_at: string | null;
  sent_at: string | null;
  delivery: WorkbookDelivery | Record<string, never>;
  subject: string | null;
  text_body: string | null;
}

const clean = (v: unknown, max: number) => typeof v === "string" && v.trim().length <= max && !/[\x00-\x1f\x7f]/.test(v) ? v.trim() : null;

/** A mail dispatch needs tracking. Hand delivery never carries stale mail details. */
export function workbookDelivery(value: unknown): WorkbookDelivery | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (d.method === "hand") return { method: "hand" };
  if (d.method !== "mail") return null;
  const carrier = clean(d.carrier, 80), trackingNumber = clean(d.trackingNumber, 100);
  const trackingUrl = clean(d.trackingUrl ?? "", 500);
  if (!carrier || !trackingNumber || trackingUrl === null) return null;
  if (trackingUrl) {
    try {
      const url = new URL(trackingUrl);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch { return null; }
  }
  return { method: "mail", carrier, trackingNumber, trackingUrl };
}

/** An abandoned send can have reached the provider. It never becomes retryable. */
export function shownWorkbookEmailStatus(r: Pick<WorkbookEmailRecord, "status" | "claimed_at">, now: number): WorkbookEmailStatus {
  return r.status === "sending" && r.claimed_at && now - Date.parse(r.claimed_at) >= 10 * 60_000 ? "unknown" : r.status;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

export function workbookEmail(p: { parentName: string; childName: string; kind: WorkbookEmailKind; workbookNumber: number; delivery: WorkbookDelivery | null }) {
  const welcome = p.kind === "welcome";
  const delivery = workbookDelivery(p.delivery);
  if (!welcome && (!delivery || !Number.isInteger(p.workbookNumber) || p.workbookNumber < 1 || p.workbookNumber > 10000)) throw Error("Invalid workbook dispatch");
  const subject = welcome ? "Your first workbook with Unica Learning" : `${p.childName}'s workbook is on its way`;
  const paragraphs = welcome ? [
    `Hi ${p.parentName},`,
    `Thank you for choosing Unica Learning for ${p.childName}. We are preparing your first workbook.`,
    "We will email you again when it is on its way. If we send it by mail, that email will include tracking details. For local hand delivery, we will contact you to arrange it.",
    "Nothing was charged when you added your card. Your free first month starts when your first workbook ships.",
  ] : [
    `Hi ${p.parentName},`,
    `${p.childName}'s workbook ${p.workbookNumber} is on its way${delivery?.method === "hand" ? " by hand delivery" : ""}.`,
    ...(delivery?.method === "mail" ? [`Carrier: ${delivery.carrier}`, `Tracking number: ${delivery.trackingNumber}`,
      ...(delivery.trackingUrl ? [`Track your workbook: ${delivery.trackingUrl}`] : [])] : []),
  ];
  const footer = { why: "You received this email about your Unica Learning program." };
  const text = [...paragraphs, emailSignatureText(), emailFooterText(footer)].join("\n\n");
  const body = `<tr><td style="padding:0 24px">${paragraphs.map((s) => `<p style="margin:0 0 16px">${esc(s)}</p>`).join("")}${!welcome && delivery?.method === "mail" && delivery.trackingUrl
    ? `<p><a href="${esc(delivery.trackingUrl)}" style="color:#0c0c0e">Track your workbook</a></p>` : ""}</td></tr>`;
  return { subject, text, html: emailDocument({ title: subject, preview: welcome ? "We will email you when your workbook is on its way." : "Your workbook delivery details.", body, footer }) };
}
