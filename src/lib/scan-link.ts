import "server-only";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailConfigProblem, sendEmailOnce, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import { scanPageUrl } from "@/lib/scan-tab";

// "Email me the link" on the Scan pages tab (#564, D-246): a parent on a desktop gets the page's address by email, to
// open on the phone. The link is the address and nothing else, as in the QR code: no token, so it signs no one in; a
// signed-out phone signs in first. It follows the sign-in link's guards (src/lib/account-server.ts): stop before any
// write when email cannot go, the child must be the parent's own, and a few emails an hour per parent at most. The
// limit is counted under a lock in the store, so requests sent together cannot all pass it.
//
// One seam: the store (Supabase in src/lib/scan-link-store.ts, in memory in src/lib/scan-link-memory.ts).

export const SCAN_LINKS_PER_HOUR = 3;
export const SCAN_LINK_WINDOW_MS = 60 * 60_000;

export interface ScanLinkRecipient {
  parentName: string;
  email: string;
  childName: string;
}

export interface ScanLinkStore {
  /** The parent's name and email, and the child's first name; null when the child is not this parent's. */
  recipient(parent: string, child: string): Promise<ScanLinkRecipient | null>;
  /** Counts one email for the parent and returns its row id; null when the parent reached the hourly limit. */
  claim(parent: string, child: string): Promise<string | null>;
  sent(id: string, emailId: string): Promise<void>;
  refused(id: string, error: string): Promise<void>;
  unknown(id: string, error: string): Promise<void>;
}

/** "unsure": the email may have gone (no answer from the provider). */
export type ScanLinkResult = "sent" | "not_found" | "too_many" | "unsure" | "failed";

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

export function scanLinkEmail({ parentName, childName, url }: { parentName: string; childName: string; url: string }) {
  const first = parentName.trim().split(/\s+/)[0] || parentName;
  const subject = `Take pictures of ${childName}'s workbook pages`;
  const footer = { why: "You get this email because you asked for the link to Scan pages." };
  const open = `Open this link on your phone to take pictures of ${childName}'s finished workbook pages.`;
  const signIn = "If your phone asks, sign in with the same account.";
  const ignore = "If you did not ask for this email, you can ignore it.";
  const text = [`Hi ${first},`, open, url, signIn, ignore, emailSignatureText(), emailFooterText(footer)].join("\n\n");
  const html = emailDocument({ title: subject, preview: `Open this email on your phone.`, footer, body: `<tr><td style="padding:0 24px">
<p style="margin:0 0 20px">Hi ${esc(first)},</p>
<p>Open this link on your phone to take pictures of ${esc(childName)}&#39;s finished workbook pages.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#2b2622;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">Open Scan pages</a></p>
<p style="font-size:14px;color:#555">${signIn}<br>${ignore}</p>
</td></tr>` });
  return { subject, text, html };
}

export async function sendScanLink(
  store: ScanLinkStore,
  { parent, child, origin }: { parent: string; child: string; origin: string },
  { transport, configProblem = emailConfigProblem }: { transport?: MailTransport; configProblem?: () => string | null } = {},
): Promise<ScanLinkResult> {
  // Stop before a row is written: without the configuration the email cannot go.
  if (configProblem()) {
    console.error("[scan-link] RESEND_API_KEY or EMAIL_FROM is not set");
    return "failed";
  }
  const to = await store.recipient(parent, child);
  if (!to) return "not_found";
  const ledger: SendLedger<null, string> = {
    claim: () => store.claim(parent, child),
    sent: (id, emailId) => store.sent(id, emailId),
    refused: (id, error) => store.refused(id, error),
    unknown: (id, error) => store.unknown(id, error),
  };
  const email = scanLinkEmail({ parentName: to.parentName, childName: to.childName, url: scanPageUrl(origin) });
  const outcome = await sendEmailOnce(ledger, null, { sender: { to: "parent" }, to: to.email, replyTo: SUPPORT_EMAIL, ...email }, transport ? { transport } : {});
  if (outcome.status === "busy") return "too_many";
  if (outcome.status === "sent") return "sent";
  console.error("[scan-link] email not sent", outcome.status, outcome.error);
  return outcome.status === "unknown" ? "unsure" : "failed";
}
