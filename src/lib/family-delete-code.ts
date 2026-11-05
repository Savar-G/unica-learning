import { randomInt } from "node:crypto";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailDocument, emailFooterText, emailSignatureText } from "@/lib/email-brand";
import type { EmailMessage, SendResult } from "@/lib/email-delivery";
import { DELETE_CODE_LENGTH, type FamilyDeleteStore, type ProveCode } from "@/lib/family-delete";
import { hashPin, matches } from "@/lib/parent-pin";

// The one-time code that confirms a family delete (D-255, #603). It replaces the password of D-247: a signed-in session can
// set a new password, and a Google parent has none. The code proves that this person can read the account's email.
//
// It is ours and not Supabase's email code. Supabase's code is a sign-in: its email is the "Magic link" template that signup
// shows, so it could not say what it is for; it lives for mailer_otp_exp (1 hour here, shared with signup); and a sign-in code
// would also confirm a delete. Here the server makes the code, the database holds only a salted scrypt hash, and the hash
// covers this action, this parent and this address, so a code works for nothing else. A code goes only to the address the Auth
// server gives for the session, and a change of that address needs a code from the old address too (docs/assessment-deletion.md).
//
// The tries are the delete's own count (5, then 15 minutes locked, src/lib/family-delete.ts). Asking for a code never resets
// them. Every code ends before a lock does, so a lock always needs a new code, and asking is refused during a lock.
//
// The email goes through sendEmail with no ledger, so no copy of the code is kept (email_copies); the limit below is its guard.
//
// The module has no Next.js or database import. Seams: the store (src/lib/family-delete-server.ts, and
// src/lib/family-delete-memory.ts for tests) and `send`.

/** 3 sends in any hour and 6 in any day, so a guesser has few live codes and the parent gets an email for each. */
export const DELETE_CODE_POLICY = { ttlMs: 10 * 60_000, perWindow: 3, windowMs: 60 * 60_000, perDay: 6, dayMs: 24 * 60 * 60_000 } as const;
export interface DeleteCodePolicy { ttlMs: number; perWindow: number; windowMs: number; perDay: number; dayMs: number }

export type DeleteCodeBegin = { kind: "ok" } | { kind: "too_many" | "locked"; until: number };

export interface DeleteCodeStore {
  /**
   * In one step under the parent's row lock: refused during a lock and past the limits, else counts the send and puts this
   * hash in place of any code before it.
   */
  begin(parent: string, hash: string, now: number, policy: DeleteCodePolicy): Promise<DeleteCodeBegin>;
  /** The hash of the live code, by the database's clock; null when none is live. */
  read(parent: string): Promise<string | null>;
  /** Ends the code when it is still this hash and still live by the database's clock, read after the row lock. True for one caller only. */
  spend(parent: string, hash: string): Promise<boolean>;
}

export type DeleteCodeResult =
  /** `unsure`: the provider gave no clear answer, so the email may or may not have gone. */
  | { ok: true; sentTo: string; unsure: boolean }
  | { ok: false; error: "no_confirmed_email" | "protected" | "busy" | "not_found" | "unavailable" | "email_failed" }
  | { ok: false; error: "too_many" | "locked"; retryAt: number };

export interface DeleteCodeSeams {
  codes: DeleteCodeStore;
  store: Pick<FamilyDeleteStore, "check">;
  send(message: EmailMessage): Promise<SendResult>;
  configProblem(): string | null;
  now?: () => number;
  newCode?: () => string;
  policy?: DeleteCodePolicy;
}

const randomCode = () => String(randomInt(0, 10 ** DELETE_CODE_LENGTH)).padStart(DELETE_CODE_LENGTH, "0");

/** What the hash covers. A stored hash is worth nothing for another parent, another address or another action. */
const bound = (parent: string, email: string, code: string) => ["family_delete", parent.toLowerCase(), email.trim().toLowerCase(), code].join("\n");

/**
 * Makes a new code and emails it. `account` is what the Auth server says about this session, never the request. Stops before
 * any write when no email can go, or when the delete would refuse anyway, so that the parent gets no useless code.
 */
export async function requestDeleteCode(parent: string, account: { email: string | null | undefined; confirmed: boolean }, { codes, store, send, configProblem, now = Date.now, newCode = randomCode, policy = DELETE_CODE_POLICY }: DeleteCodeSeams): Promise<DeleteCodeResult> {
  if (!account.email || !account.confirmed) return { ok: false, error: "no_confirmed_email" };
  const ready = await store.check(parent);
  if (ready === "missing") return { ok: false, error: "not_found" };
  if (ready !== "ready") return { ok: false, error: ready };
  const problem = configProblem();
  if (problem) {
    console.error("[family-delete] code email cannot go", problem);
    return { ok: false, error: "unavailable" };
  }

  const code = newCode();
  const hash = await hashPin(bound(parent, account.email, code));
  const begun = await codes.begin(parent, hash, now(), policy);
  if (begun.kind !== "ok") return { ok: false, error: begun.kind, retryAt: begun.until };

  const sent = await send({ sender: { to: "parent" }, to: account.email, replyTo: SUPPORT_EMAIL, ...deleteCodeEmail(code) });
  if (sent.status === "refused") {
    // No one has this code, so take it back. The send stays counted. If this fails, the code ends by itself.
    await codes.spend(parent, hash).catch(() => false);
    console.error("[family-delete] code email refused");
    return { ok: false, error: "email_failed" };
  }
  return { ok: true, sentTo: account.email, unsure: sent.status === "unknown" };
}

/**
 * The check of a code for this session's parent and address. Spends the code when it is right, once, across requests sent
 * together. It has no clock: the database decides when a code has ended, so time lost in a slow read or hash cannot pass one.
 */
export function codeProof(codes: Pick<DeleteCodeStore, "read" | "spend">, parent: string, email: string): ProveCode {
  return async (code) => {
    const hash = await codes.read(parent);
    if (!hash) return "ended";
    if (!(await matches(bound(parent, email, code), hash))) return "wrong";
    return (await codes.spend(parent, hash)) ? "ok" : "ended";
  };
}

/** The email. It names no child and has no link: the code is typed on the page the parent already has open. */
export function deleteCodeEmail(code: string) {
  const subject = "Your code to delete your Unica Learning family account";
  const footer = { why: "You get this email because someone asked to delete the family account on your account page." };
  const asked = "Someone signed in to your account and asked to delete your family's account. Enter this code on your account page to confirm it:";
  const limits = "The code ends in 10 minutes and works once. A delete stops every workbook plan and removes your family's data. You cannot undo this.";
  const notYou = `If you did not ask for this, do not enter the code and do not give it to anyone. Your family's account stays as it is. Someone else may be signed in to your account, so change your password now and email ${SUPPORT_EMAIL}.`;
  const text = ["Hello,", asked, code, limits, notYou, emailSignatureText(), emailFooterText(footer)].join("\n\n");
  const html = emailDocument({ title: subject, preview: "Enter this code only if you asked to delete your family's account.", footer, body: `<tr><td style="padding:0 24px">
<p style="margin:0 0 20px">Hello,</p>
<p>Someone signed in to your account and asked to delete your family&#39;s account. Enter this code on your account page to confirm it:</p>
<p style="margin:24px 0;font-size:30px;line-height:1.2;font-weight:600;letter-spacing:0.12em">${code}</p>
<p>The code ends in 10 minutes and works once. A delete stops every workbook plan and removes your family&#39;s data. You cannot undo this.</p>
<p><strong>If you did not ask for this,</strong> do not enter the code and do not give it to anyone. Your family&#39;s account stays as it is. Someone else may be signed in to your account, so change your password now and email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
</td></tr>` });
  return { subject, text, html };
}
