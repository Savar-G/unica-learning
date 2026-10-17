import { emailDocument } from "@/lib/email-brand";

export const AUTH_EMAIL_KINDS = ["confirmation", "magic_link", "recovery"] as const;
export type AuthEmailKind = typeof AUTH_EMAIL_KINDS[number];

/** Hosted Auth templates. Keep the Go template fields literal until Auth sends the email. */
export function authEmail(kind: AuthEmailKind): { subject: string; html: string } {
  const recovery = kind === "recovery";
  const subject = recovery ? "Reset your Unica Learning password"
    : kind === "confirmation" ? "Your Unica Learning code" : "Your Unica Learning sign-in code";
  const instruction = recovery ? "Use the button below to choose a new password."
    : kind === "confirmation" ? "Here is your code to confirm your email for Unica Learning:"
      : "Here is your code to sign in to Unica Learning:";
  const action = recovery
    ? '<p style="margin:0 0 20px"><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery" style="display:inline-block;background:#2b2622;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:600">Reset password</a></p>'
    : '<p style="margin:0 0 20px;font-size:28px;letter-spacing:4px;font-weight:600">{{ .Token }}</p>';
  const note = recovery ? "If you did not ask to reset your password, you can ignore this email."
    : kind === "confirmation" ? "Enter it on the signup page. If you did not ask for this code, you can ignore this email."
      : "Enter it on the page where you asked for it. If you did not ask for this code, you can ignore this email.";
  return { subject, html: emailDocument({
    title: subject,
    preview: recovery ? "Choose a new password for your Unica Learning account." : "Enter your code on the signup page.",
    body: `<tr><td style="padding:0 24px"><p style="margin:0 0 20px">${instruction}</p>${action}<p style="margin:0;font-size:14px;color:#44444c">${note}</p></td></tr>`,
    footer: { why: recovery ? "You get this email because you asked to reset your password." : "You get this email because someone asked for a code for this address.", support: "email" },
  }) };
}
