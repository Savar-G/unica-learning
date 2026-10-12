// Parent accounts for the online assessment (#62, D-082). Shared by the account forms (client) and /api/account (server).
import { CURRICULA, POSTAL, clip, cleanSource, type CurriculumId } from "@/lib/signup";

export const PASSWORD_MIN = 8;
/** Stops a script from adding children without end. No family needs more. */
export const MAX_CHILDREN = 8;
export const GRADES = [1, 2, 3, 4, 5, 6, 7] as const;

export interface ChildInput {
  firstName: string;
  /** School grade, 1-7. */
  grade: number;
  /** The curriculum the child is measured against; "other" scores against BC (D-083). */
  province: CurriculumId;
}

/**
 * What /api/account/finish takes. The parent proved their email first: with the email code (password signup, #82) or
 * with Google. The id and the email come from that session, never from this body.
 */
export interface FinishPayload {
  name: string;
  postal: string;
  child: ChildInput;
  /** Referrer and UTM tags, so we know which channel brought each parent. */
  source: Record<string, string>;
  /**
   * The parent's own password: from the signup form, or from /account/finish for a parent without Google. The route first
   * replaces any earlier password with one that nobody knows, then sets this one (#82). Google parents send none.
   */
  password?: string;
}

export type AccountError =
  | "bad_json" | "invalid" | "weak_password" | "too_many" | "signed_out" | "busy" | "store_failed" | "send_failed"
  /** The session's email is not confirmed: no family rows for an address nobody proved (#82). */
  | "unconfirmed"
  /** The family is being deleted (#78), so the same sign-in cannot make it again. */
  | "unavailable"
  /** A password sign-in alone cannot make a family: the email must be proved first (email code, emailed link or Google, #82). */
  | "unproved";

/**
 * What /api/account/* answers. `linkSent`: finishing on a phone emailed the sign-in link (#63). `existing`: the parent
 * already had an account, so nothing changed: no new child, and the password stays the same (#82).
 */
export interface AccountResult {
  ok: boolean;
  error?: AccountError;
  linkSent?: boolean;
  existing?: boolean;
}

export const fail = (error: AccountError, status: number) => Response.json({ ok: false, error } satisfies AccountResult, { status });

export interface Child {
  id: string;
  first_name: string;
  grade: number;
  province: CurriculumId;
}

/** A valid child from untrusted input, or null. */
export function cleanChild(raw: unknown): ChildInput | null {
  const c = (raw ?? {}) as Partial<Record<keyof ChildInput, unknown>>;
  const firstName = clip(c.firstName, 60);
  const grade = Number(c.grade);
  const province = typeof c.province === "string" && Object.hasOwn(CURRICULA, c.province) ? (c.province as CurriculumId) : null;
  if (!firstName || !(GRADES as readonly number[]).includes(grade) || !province) return null;
  return { firstName, grade, province };
}

/** Name, postal code and source, cleaned, or null when one is not valid. Google gives the email, so this is all a Google parent sends. */
export function cleanDetails(raw: Partial<FinishPayload>) {
  const details = { name: clip(raw.name, 120), postal: clip(raw.postal, 7).toUpperCase(), source: cleanSource(raw.source) };
  return details.name.length >= 2 && POSTAL.test(details.postal) ? details : null;
}

/** Supabase Auth hashes at most 72 bytes of a password. */
export const PASSWORD_MAX = 72;

/** True for a password the signup form accepts: at least PASSWORD_MIN and at most PASSWORD_MAX characters. */
export const validPassword = (raw: unknown): raw is string =>
  typeof raw === "string" && raw.length >= PASSWORD_MIN && raw.length <= PASSWORD_MAX;
