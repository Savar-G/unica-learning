import { BUSINESS_NAME, MAILING_ADDRESS, SUPPORT_EMAIL, WEBSITE } from "@/lib/contact";

// Approved email design A. These fragments are table rows, with inline styles and system fonts.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#0c0c0e";
const SECONDARY = "#44444c";
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

export interface EmailFooter {
  why: string;
  note?: string;
  unsubscribe?: { url: string; label: string };
  /** Hosted Auth mail has no app-owned Reply-To header. Give the support address instead. */
  support?: "email";
}

export function emailSignatureText(support?: "email"): string {
  return `Thank you,\nThe ${BUSINESS_NAME} team\n${support === "email" ? `Questions? Email ${SUPPORT_EMAIL}.` : "Questions? Reply to this email."}`;
}

export function emailFooterText(f: EmailFooter): string {
  return [
    `${BUSINESS_NAME}, ${MAILING_ADDRESS}`,
    WEBSITE,
    f.why,
    ...(f.note ? [f.note] : []),
    ...(f.unsubscribe ? [`${f.unsubscribe.label}: ${f.unsubscribe.url}`] : []),
  ].join("\n");
}

export function emailHeaderHtml(inset = 24): string {
  // The wordmark is text, so it remains visible when a mail app blocks images.
  return `<tr><td style="padding:12px ${inset}px 32px;font-size:21px;line-height:1.1;font-weight:600;letter-spacing:-0.03em;color:${INK}">${esc(BUSINESS_NAME)}<span aria-hidden="true" style="display:inline-block;width:7px;height:7px;margin-left:3px;background:#ff6a3d"></span></td></tr>`;
}

export function emailEndHtml(f: EmailFooter, inset = 24): string {
  const support = f.support === "email"
    ? `Questions? <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${SECONDARY}">Email us</a>.`
    : "Questions? Reply to this email.";
  const p = (s: string) => `<p style="margin:0 0 16px">${s}</p>`;
  return `<tr><td style="padding:24px ${inset}px 32px;font-size:16px;line-height:1.6;color:${INK}">
Thank you,<br><strong style="font-weight:600">The ${esc(BUSINESS_NAME)} team</strong><br>
<span style="font-size:14px;color:${SECONDARY}">${support}</span>
</td></tr>
<tr><td style="padding:0 ${inset}px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e4e4e7;padding:24px 0 0;font-size:13px;line-height:1.65;color:${SECONDARY}">
${p(`<strong style="font-size:14px;font-weight:600;color:${INK}">${esc(BUSINESS_NAME)}</strong><br>${esc(MAILING_ADDRESS).replace(", Surrey", "<br>Surrey")}<br><a href="https://${WEBSITE}" style="color:${SECONDARY}">${WEBSITE}</a>`)}
${p(esc(f.why))}
${f.note ? p(esc(f.note)) : ""}
${f.unsubscribe ? p(`<a href="${esc(f.unsubscribe.url)}" style="color:${SECONDARY}">${esc(f.unsubscribe.label)}</a>`) : ""}
</td></tr></table>
</td></tr>`;
}

/** Body contains trusted template rows. Escape user values before they enter it. */
export function emailDocument({ title, preview, body, footer }: { title: string; preview: string; body: string; footer: EmailFooter }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="background:#ffffff;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK}">
${emailHeaderHtml()}
${body}
${emailEndHtml(footer)}
</table></div></body></html>`;
}
