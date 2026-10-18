// The contact form (/contact, D-130): a parent's name, email and message, emailed to the support address with the
// parent as the reply address. Nothing is stored. Pure: the page checks the fields with it, and /api/contact checks
// them again and builds the email.
import { EMAIL, clip } from "@/lib/signup";

export const NAME_MAX = 120;
export const EMAIL_MAX = 200;
export const MESSAGE_MAX = 5000;
/** A form sent sooner than this after it opened was filled in by a bot. */
export const MIN_FILL_MS = 2000;

/** What the page posts. `website` is the hidden field only bots fill; `elapsed` is the time since the form opened. */
export interface ContactPayload {
  name: string;
  email: string;
  message: string;
  website?: string;
  elapsed?: number;
}

export type ContactField = "name" | "email" | "message";

export type ContactResult =
  | { ok: true }
  | { ok: false; error: "invalid"; fields: ContactField[] }
  /** "failed": the email did not go. "unknown": it may have gone. */
  | { ok: false; error: "bad_json" | "failed" | "unknown" };

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

/** The fields that are empty or wrong, in form order. */
export function contactFieldErrors({ name, email, message }: ContactMessage): ContactField[] {
  const fields: ContactField[] = [];
  if (!name.trim()) fields.push("name");
  if (!EMAIL.test(email.trim())) fields.push("email");
  if (!message.trim()) fields.push("message");
  return fields;
}

export type ContactCheck = { kind: "bot" } | { kind: "invalid"; fields: ContactField[] } | { kind: "ok"; message: ContactMessage };

/** Checks a posted form. A bot gets "bot", so the route can say the message went and send nothing. */
export function checkContact(body: unknown): ContactCheck {
  const b = (typeof body === "object" && body !== null ? body : {}) as Partial<Record<keyof ContactPayload, unknown>>;
  if (b.website) return { kind: "bot" };
  if (typeof b.elapsed !== "number" || !(b.elapsed >= MIN_FILL_MS)) return { kind: "bot" };
  const message = {
    // One line: the name goes in the subject.
    name: clip(b.name, NAME_MAX).replace(/\s+/g, " "),
    email: clip(b.email, EMAIL_MAX),
    message: clip(b.message, MESSAGE_MAX),
  };
  const fields = contactFieldErrors(message);
  return fields.length ? { kind: "invalid", fields } : { kind: "ok", message };
}

/** The email to the support address. Replying to it answers the parent. */
export function contactEmail({ name, email, message }: ContactMessage, to: string) {
  return {
    to,
    replyTo: email,
    subject: `Contact form: ${name}`,
    text: [`From: ${name} <${email}>`, "", message, "", "Reply to this email to answer them."].join("\n"),
  };
}
