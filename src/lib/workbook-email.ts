import { familyPlanWords as w } from "@/lib/family-plan-words";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import { cad } from "@/lib/site";

/** The emails an admin previews and sends from the card's panel. */
export type WorkbookNoticeKind = "welcome" | "ready" | "dispatch";
/** Every kind in the send ledger: plan_start goes out when the free month starts, not from the panel. */
export type WorkbookEmailKind = WorkbookNoticeKind | "plan_start";
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
/** Only code-owned account routes become links. Visible approved words remain unchanged. */
const paragraphHtml = (s: string) => esc(s).replace(/https:\/\/unicalearning\.com\/account(?:\/(?:schedule|scan|feedback|plan))?(?=[.,\s]|$)/g,
  (url) => `<a href="${url}" style="color:#0c0c0e">${url}</a>`).replaceAll("\n", "<br>");

export function workbookEmail(p: { parentName: string; childName: string; kind: WorkbookNoticeKind; workbookNumber: number; delivery: WorkbookDelivery | null }) {
  const welcome = p.kind === "welcome";
  const ready = p.kind === "ready";
  const delivery = workbookDelivery(p.delivery);
  if (!welcome && (!Number.isInteger(p.workbookNumber) || p.workbookNumber < 1 || p.workbookNumber > 10000 || (!ready && !delivery))) throw Error("Invalid workbook notice");
  const subject = welcome ? "Your first workbook with Unica Learning" : `${p.childName}'s workbook is ${ready ? "ready" : "on its way"}`;
  const paragraphs = welcome ? [
    `Hi ${p.parentName},`,
    `Thank you for choosing Unica Learning for ${p.childName}. We are preparing your first workbook.`,
    "Please allow 5 to 7 days for us to prepare your first workbook.",
    "We will email you again when it is on its way. If we send it by mail, that email will include tracking details. For local hand delivery, we will contact you to arrange it.",
    `Nothing was charged when you added your card. ${w.freeMonth} ${w.insideWindow} ${w.afterWindow}`,
    "You have nothing to do right now.",
    `If anything does not work, or if you have feedback, email ${SUPPORT_EMAIL} or use https://unicalearning.com/account/feedback.`,
  ] : ready ? [
    `Hi ${p.parentName},`,
    "Your workbook is ready and will be shipped soon. You have nothing to do right now. We will email you again when it is on its way.",
    `If anything does not work, or if you have feedback, email ${SUPPORT_EMAIL} or use https://unicalearning.com/account/feedback.`,
  ] : [
    `Hi ${p.parentName},`,
    `${p.childName}'s workbook ${p.workbookNumber} is on its way${delivery?.method === "hand" ? " by hand delivery" : ""}.`,
    ...(delivery?.method === "mail" ? [`Carrier: ${delivery.carrier}\nTracking number: ${delivery.trackingNumber}`,
      ...(delivery.trackingUrl ? [`Track your workbook: ${delivery.trackingUrl}`] : [])] : []),
    "What to do next: keep the workbook together when it arrives. We will email you the instructions when your free month starts.",
    `If anything does not work, or if you have feedback, email ${SUPPORT_EMAIL} or use https://unicalearning.com/account/feedback.`,
  ];
  const footer = { why: "You received this email about your Unica Learning program." };
  // The founders sign the welcome (D-225); the team signs the dispatch notices.
  const signer = welcome ? "founders" as const : "team" as const;
  const text = [...paragraphs, emailSignatureText(undefined, signer), emailFooterText({ ...footer, signer })].join("\n\n");
  const body = `<tr><td style="padding:0 24px">${paragraphs.map((s) => `<p style="margin:0 0 16px">${paragraphHtml(s)}</p>`).join("")}${p.kind === "dispatch" && delivery?.method === "mail" && delivery.trackingUrl
    ? `<p><a href="${esc(delivery.trackingUrl)}" style="color:#0c0c0e">Track your workbook</a></p>` : ""}</td></tr>`;
  return { subject, text, html: emailDocument({ title: subject, preview: welcome || ready ? "We will email you when your workbook is on its way." : "Your workbook delivery details.", body, footer: { ...footer, signer } }) };
}

/**
 * The confirmation when a family's free month starts (card network rules: price, billing terms and how to cancel, sent
 * at enrolment). `firstCharge` is already formatted in the family's time zone. `marking`: automatic marking is open for this
 * child when the email is made (src/lib/scan-marking-access.ts). Without it, step 3 promises no marks and no "Explain this
 * problem", and says the marks come later, as the scan page does. `explain`: "Explain this problem" can give an explanation
 * (explanationAvailable); without it, step 3 keeps the marks and drops its Explain sentence.
 */
export function planStartEmail(p: { parentName: string; childName: string; grade: number; price: number; firstCharge: string; marking: boolean; explain: boolean; sharedWindow?: boolean; free?: boolean; reminder?: boolean }) {
  const subject = p.sharedWindow ? w.emailSubject(p.childName) : `Welcome to Unica Learning: how ${p.childName}'s free month works`;
  const steps = [
    `1. Follow the schedule. See which pages ${p.childName} does each day: https://unicalearning.com/account/schedule. The same schedule is on page 2 of the workbook.`,
    `2. Scan the finished pages. After ${p.childName} finishes the pages, scan them: https://unicalearning.com/account/scan. Each page has its own QR code.`,
    p.marking === true
      ? `3. Read the marks. You will see which questions are right and wrong.${p.explain === true ? ` On a wrong answer, press "Explain this problem" for a simple explanation that you can use with ${p.childName}.` : ""}`
      : `3. Marks come later. Scan the pages now. Later, we will use the photos to mark ${p.childName}'s work.`,
    ...(Number.isInteger(p.grade) && p.grade >= 3 && p.grade <= 9 ? [
      `4. Set up Maya. If ${p.childName} gets stuck, ${p.childName} can chat with Maya, our AI Teaching Assistant. Sign in at https://unicalearning.com/account, set a PIN, agree to the Maya notice, then open ${p.childName}'s desk.`,
    ] : []),
  ];
  const paragraphs = [
    `Hi ${p.parentName},`,
    ...(p.sharedWindow ? [`Thanks for joining Unica Learning. ${w.planStarted(p.childName)}`, ...(p.free ? ["Nothing has been charged."] : [])] : [`Thanks for joining Unica Learning. ${p.childName}'s first workbook has arrived, so your free first month has started. Nothing has been charged.`]),
    "As a parent, here are your responsibilities:",
    steps.join("\n"),
    `If anything is broken, if anything does not work, or if you have feedback, email ${SUPPORT_EMAIL} or use https://unicalearning.com/account/feedback.`,
    `Your plan: On ${p.firstCharge}, we charge CAD ${cad(p.price)} to your saved card. We then charge CAD ${cad(p.price)} each month until you cancel. Delivery is included.${p.reminder !== false ? " We will email you a reminder 7 days before the first charge." : ""}`,
    `To cancel, sign in and open https://unicalearning.com/account/plan, then press "Cancel plan".${p.free !== false ? ` If you cancel before ${p.firstCharge}, you pay nothing.` : ""}`,
  ];
  const footer = { why: "You received this email about your Unica Learning program." };
  const text = [...paragraphs, emailSignatureText(), emailFooterText(footer)].join("\n\n");
  const body = `<tr><td style="padding:0 24px">${paragraphs.map((s) => `<p style="margin:0 0 16px">${paragraphHtml(s)}</p>`).join("")}</td></tr>`;
  return { subject, text, html: emailDocument({ title: subject, preview: p.free === false ? w.emailPreview : `Your first charge is on ${p.firstCharge}. Cancel before then and you pay nothing.`, body, footer }) };
}
