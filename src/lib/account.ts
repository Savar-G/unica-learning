// Parent accounts for the online assessment (#62, D-082). Shared by the account forms (client) and /api/account (server).
import { CURRICULA, EMAIL, POSTAL, clip, cleanSource, type CurriculumId } from "@/lib/signup";

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

export interface AccountSignupPayload {
  name: string;
  email: string;
  postal: string;
  password: string;
  child: ChildInput;
  /** Referrer and UTM tags, so we know which channel brought each parent. */
  source: Record<string, string>;
  /** Honeypot: hidden from people, filled in by bots. */
  website?: string;
}

/** A parent who signed in with Google finishes their account with these (/api/account/finish). */
export interface FinishPayload {
  name: string;
  postal: string;
  child: ChildInput;
  source: Record<string, string>;
}

export type AccountError = "bad_json" | "invalid" | "account_exists" | "weak_password" | "too_many" | "signed_out" | "busy" | "store_failed" | "send_failed" | "off";

/** What /api/account/* answers. `linkSent`: signup on a phone emailed the sign-in link (#63). */
export interface AccountResult {
  ok: boolean;
  error?: AccountError;
  linkSent?: boolean;
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

/** The parent fields of a signup, cleaned, or null when one is not valid. */
export function cleanParent(raw: Partial<AccountSignupPayload>) {
  const details = cleanDetails(raw);
  const email = clip(raw.email, 200).toLowerCase();
  const password = typeof raw.password === "string" ? raw.password : "";
  const valid = details && EMAIL.test(email) && password.length >= PASSWORD_MIN && password.length <= 72;
  return valid ? { ...details, email, password } : null;
}
