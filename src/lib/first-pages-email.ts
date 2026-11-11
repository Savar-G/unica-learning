// The sample email of the first pages (docs/first-pages.md): one email per test, when its four pages are ready, with
// the four-page PDF attached and "Start your plan today", which opens the report's plan choice and card step. Sent by the
// /api/reminders run only while FIRST_PAGES_EMAIL_ENABLED is "on". Right before the claim the store says whether the
// email may still go: the set is ready and not hidden or kept by a run, the family has no saved card (stored and with
// Stripe; an answer that is not known stops it), the parent has not unsubscribed, and the family is not being deleted.
// The email log (kind first_pages, one per test) is the send ledger: at most one email per test, never two.
// CASL: it offers a plan, so it names the sender, the mailing address and the website, and has an unsubscribe link.
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailEndHtml, emailFooterText, emailHeaderHtml, emailSignatureText } from "@/lib/email-brand";
import { sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { familyPlanWords } from "@/lib/family-plan-words";
import { START_PLAN_TODAY } from "@/lib/first-pages-words";
import { reportReturnPath } from "@/lib/report-view";


export interface DueFirstPagesEmail {
  firstPagesId: string;
  assessmentId: string;
  reportId: string;
  parentId: string;
  childId: string;
  parentName: string;
  parentEmail: string;
  childName: string;
  pdfPath: string;
  /** A refused email of an earlier run, to try again: its log row and its attempts. */
  retry: { logId: string; attempts: number } | null;
}

export interface FirstPagesEmailStore {
  /** Ready sets whose email has not gone and may be tried, oldest first, at most `limit`. */
  due(limit: number): Promise<DueFirstPagesEmail[]>;
  /** Asked right before the claim: why this email may not go now, or null. A read that fails is a reason. */
  blocked(d: DueFirstPagesEmail): Promise<string | null>;
  /** The four-page PDF. */
  pdf(path: string): Promise<Uint8Array>;
  ledger: SendLedger<DueFirstPagesEmail, string>;
}

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);
const INK = "#0c0c0e";
const SECONDARY = "#44444c";
const BUTTON = "#2b2622";

/** The PDF's file name: the child's name in plain letters, then "workbook-1-first-pages.pdf". */
export const firstPagesFilename = (child: string) => {
  const name = child.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
  return `${name ? `${name}-` : ""}workbook-1-first-pages.pdf`;
};

/** Where the action goes: the report's plan choice and card step, signed in. */
export const firstPagesActionUrl = (origin: string, reportId: string) => `${origin}${reportReturnPath(reportId, { src: "account", step: "plan" })}`;

/** The email: subject, text and HTML. The first name of the parent, the child's name; nothing the AI wrote. */
export function firstPagesEmail({ parentName, childName, url, unsubscribeUrl }: { parentName: string; childName: string; url: string; unsubscribeUrl: string }) {
  const first = parentName.trim().split(/\s+/)[0] || "there";
  const subject = `The first pages of ${childName}'s Workbook 1`;
  const lines = [
    `We made the first pages of ${childName}'s Workbook 1 from ${childName}'s test. They are attached as a PDF: the cover, the first lesson and two practice pages.`,
    `These are real pages of the workbook we would mail to ${childName}. You can print them and try them together.`,
  ];
  const freeMonth = familyPlanWords.freeMonth;
  const why = `You get this email because you asked for ${childName}'s free math placement report.`;
  const footer = { why, unsubscribe: { url: unsubscribeUrl, label: "Unsubscribe" }, signer: "founders" as const };
  const text = [
    `Hi ${first},`,
    ...lines,
    `${START_PLAN_TODAY}: ${url}`,
    freeMonth,
    emailSignatureText(undefined, "founders"),
    emailFooterText(footer),
  ].join("\n\n");
  const p = (s: string, color = INK) => `<p style="margin:0 0 16px;color:${color}">${s}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="background:#ffffff;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">The cover, the first lesson and two practice pages, attached.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${INK}">
${emailHeaderHtml()}
<tr><td style="padding:0 24px">
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:400;letter-spacing:-0.02em;color:${INK}">${esc(subject)}</h1>
${p(`Hi ${esc(first)},`)}
${lines.map((l) => p(esc(l))).join("\n")}
<p style="margin:8px 0 12px"><a href="${esc(url)}" style="display:inline-block;background:${BUTTON};color:#ffffff;text-decoration:none;padding:15px 24px;border-radius:6px;font-weight:600;font-size:16px;line-height:1.2">${esc(START_PLAN_TODAY)}</a></p>
${p(esc(freeMonth), SECONDARY)}
</td></tr>
${emailEndHtml(footer)}
</table></div></body></html>`;
  return { subject, text, html };
}

export interface FirstPagesEmailCounts {
  due: number;
  sent: number;
  blocked: number;
  busy: number;
  refused: number;
  unknown: number;
}

/**
 * Sends the due sample emails, one at a time, each at most once (the email log is the ledger). Off unless `enabled`.
 * `newToken` makes the unsubscribe token and its hash; `inTime` stops starting sends near the run's end. Never throws
 * for one email: its failure is counted and the next goes on.
 */
export async function runFirstPagesEmails(store: FirstPagesEmailStore, o: {
  enabled: boolean; origin: string; transport: MailTransport; newToken: () => { token: string; hash: string }; limit?: number; inTime?: () => boolean;
}): Promise<FirstPagesEmailCounts | { off: true }> {
  if (!o.enabled) return { off: true };
  const due = await store.due(o.limit ?? 10);
  const counts: FirstPagesEmailCounts = { due: due.length, sent: 0, blocked: 0, busy: 0, refused: 0, unknown: 0 };
  for (const d of due) {
    if (o.inTime && !o.inTime()) break;
    try {
      // The PDF first: the checks are the last thing before the claim, so a card saved or an unsubscribe during the
      // download still stops the email.
      const pdf = await store.pdf(d.pdfPath);
      const reason = await store.blocked(d);
      if (reason) {
        counts.blocked++;
        console.info("[first pages email] not sent", d.firstPagesId, reason);
        continue;
      }
      const { token, hash } = o.newToken();
      const email = firstPagesEmail({ parentName: d.parentName, childName: d.childName, url: firstPagesActionUrl(o.origin, d.reportId), unsubscribeUrl: `${o.origin}/unsubscribe?t=${token}` });
      const message: EmailMessage = {
        sender: { to: "parent", from: "founders" }, to: d.parentEmail, replyTo: SUPPORT_EMAIL, ...email,
        headers: { "List-Unsubscribe": `<${o.origin}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        attachments: [{ filename: firstPagesFilename(d.childName), contentType: "application/pdf", content: pdf }],
      };
      const outcome = await sendEmailOnce(store.ledger, d, message, { transport: o.transport, claimFields: { unsubscribe_hash: hash } });
      counts[outcome.status === "busy" ? "busy" : outcome.status]++;
      if (outcome.status !== "sent" && outcome.status !== "busy") console.error("[first pages email]", outcome.status, d.firstPagesId, outcome.error);
    } catch (e) {
      counts.refused++;
      console.error("[first pages email] failed", d.firstPagesId, e instanceof Error ? e.message : String(e));
    }
  }
  return counts;
}
