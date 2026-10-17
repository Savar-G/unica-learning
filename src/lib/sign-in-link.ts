// The phone-to-laptop sign-in link (#63, D-082). A parent on a phone gets an email with a link that signs them in on
// the laptop or tablet and opens one child's start screen. The link works once and only for 24 hours.
// Server only (node:crypto). The database keeps only the token's hash, so a database leak cannot sign anyone in.
import { createHash, randomBytes } from "node:crypto";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";

export const LINK_TTL_MS = 24 * 60 * 60 * 1000;
/** Links one parent can ask for in an hour. Stops a script from filling a parent's inbox. */
export const MAX_LINKS_PER_HOUR = 5;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

/** The stored hash of a token from a URL, or null when the text cannot be a token. */
export function hashToken(token: unknown): string | null {
  return typeof token === "string" && TOKEN.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

/** How long an old link can ask for a new one. After that, an old email cannot ask for mail any more. */
export const RESEND_WINDOW_MS = 7 * LINK_TTL_MS;

export const canResend = (createdAt: string, now = Date.now()) => now - Date.parse(createdAt) < RESEND_WINDOW_MS;

export type LinkState = "valid" | "used" | "expired" | "unknown";

export function linkState(row: { expires_at: string; used_at: string | null } | null, now = Date.now()): LinkState {
  if (!row) return "unknown";
  if (row.used_at) return "used";
  return Date.parse(row.expires_at) > now ? "valid" : "expired";
}

const HERE = "https://here.invalid";

/**
 * A path on this site to send a signed-in visitor to, or /account. Stops a link from sending people to another site.
 * The URL parser decides, not a prefix check: it drops tabs and newlines, so "/\t/evil.example" means "//evil.example".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return "/account";
  const url = new URL(next, HERE);
  return url.origin === HERE ? `${url.pathname}${url.search}${url.hash}` : "/account";
}

/** The child's start screen. */
export const startPath = (childId: string) => `/account/start/${childId}`;

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]);

export function linkEmail({ parentName, childName, url }: { parentName: string; childName: string; url: string }) {
  const first = parentName.trim().split(/\s+/)[0] || parentName;
  const subject = `Open this on a laptop or tablet so ${childName} can start`;
  const footer = { why: "You get this email because you asked for a sign-in link." };
  const lines = [
    `Hi ${first},`,
    `Open this link on the laptop or tablet that ${childName} will use for the math assessment. It signs you in and opens ${childName}'s start screen.`,
    url,
    "The link works once and only for 24 hours. If it does not work, the page lets you send a new link.",
    "If you did not ask for this email, you can ignore it.",
    emailSignatureText(),
    emailFooterText(footer),
  ];
  const html = emailDocument({ title: subject, preview: `Open this email on the laptop or tablet that ${childName} will use.`, footer, body: `<tr><td style="padding:0 24px">
<p style="margin:0 0 20px">Hi ${esc(first)},</p>
<p>Open this link on the laptop or tablet that ${esc(childName)} will use for the math assessment. It signs you in and opens ${esc(childName)}'s start screen.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#2b2622;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">Sign in and start</a></p>
<p style="font-size:14px;color:#555">The link works once and only for 24 hours. If it does not work, the page lets you send a new link.<br>If you did not ask for this email, you can ignore it.</p>
</td></tr>` });
  return { subject, text: lines.join("\n\n"), html };
}
