import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => entities[character]);

/** One parent message works for one or several due children. It contains no child or page data. */
export function workbookScanReminderEmail(input: { origin: string; token: string }) {
  const origin = new URL(input.origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && local)
    || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
    || !/^[A-Za-z0-9_-]{32,128}$/.test(input.token)) throw new Error("scan_reminder_links");
  const scan = new URL("/account/scans", origin).href;
  const unsubscribe = new URL(`/unsubscribe?t=${input.token}`, origin).href;
  const oneClick = new URL(`/api/unsubscribe?t=${input.token}`, origin).href;
  const subject = "Ready to scan your next page?";
  const paragraph = "Send completed workbook pages from Scan pages in your parent account.";
  const signIn = "You may be asked to sign in first.";
  const footer = { why: "You receive this reminder because your family has a delivered Unica Learning workbook.",
    unsubscribe: { url: unsubscribe, label: "Unsubscribe from reminders" } };
  const text = ["Hello,", paragraph, `Scan pages: ${scan}`, signIn,
    emailSignatureText(), emailFooterText(footer)].join("\n\n");
  const html = emailDocument({ title: subject, preview: paragraph, footer, body: `
<tr><td style="padding:0 24px 4px"><p style="margin:0 0 14px">Hello,</p>
<p style="margin:0 0 14px">${escapeHtml(paragraph)}</p></td></tr>
<tr><td style="padding:6px 24px 8px"><a href="${escapeHtml(scan)}" style="display:inline-block;background:#2b2622;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">Scan pages</a></td></tr>
<tr><td style="padding:0 24px 4px"><p style="margin:8px 0 0;font-size:14px;color:#44444c">${escapeHtml(signIn)}</p></td></tr>` });
  return { subject, text, html, headers: { "List-Unsubscribe": `<${oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
