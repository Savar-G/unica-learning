// Parent accounts for the online assessment (#62, D-082). Shared by the account forms (client) and /api/account (server).
import { isGrade } from "@/lib/assessment/grades";
import { CURRICULA, POSTAL, clip, cleanSource, type CurriculumId } from "@/lib/signup";

export const PASSWORD_MIN = 8;
/** Stops a script from adding children without end. No family needs more. */
export const MAX_CHILDREN = 8;
/** The grades the picker offers: Kindergarten (0) to Grade 9 (D-156). Labels: gradeLabel, never "Grade 0". */
export { GRADES } from "@/lib/assessment/grades";

/**
 * D-156: what the test is for this grade, where it differs, in plain words; null for grades 1-8. Kindergarten: the voice
 * reads the questions. Grade 9: the test stops at grade 8 (D-153), and grade 9 work starts with the level tests.
 */
export function gradeTestNote(grade: number, name: string): string | null {
  if (grade === 9) return `The test checks math up to Grade 8. In the program, Grade 9 topics open as ${name} passes level tests on the Grade 8 skills they build on.`;
  if (grade === 0) return "The test reads each question aloud.";
  return null;
}

/** D-156: what the grade picker says under it. "K" alone is not a label, so it always says what K is, then gradeTestNote. */
export const gradeHint = (grade: number): string => ["K is Kindergarten.", gradeTestNote(grade, "your child")].filter(Boolean).join(" ");

export interface ChildInput {
  firstName: string;
  /** School grade, 0-9: 0 is Kindergarten (D-156). Children added before D-156 hold 1-7. */
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
  /** Left out by the short phone signup (D-134); when given, it must be a Canadian postal code. */
  postal?: string;
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
  /** Auth requires an old password that signup cannot supply. */
  | "password_change_blocked"
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
  // 0 is Kindergarten, so a missing or empty grade must not become 0 the way Number(null) and Number("") do.
  const grade = typeof c.grade === "number" ? c.grade : typeof c.grade === "string" && c.grade.trim() !== "" ? Number(c.grade) : NaN;
  const province = typeof c.province === "string" && Object.hasOwn(CURRICULA, c.province) ? (c.province as CurriculumId) : null;
  if (!firstName || !isGrade(grade) || !province) return null;
  return { firstName, grade, province };
}

/**
 * Name, postal code and source, cleaned, or null when one is not valid. Google gives the email, so this is all a Google
 * parent sends. No postal code (the short phone signup, D-134) is null; a postal code that is given must be Canadian.
 */
export function cleanDetails(raw: Partial<FinishPayload>) {
  const postal = clip(raw.postal, 7).toUpperCase();
  const details = { name: clip(raw.name, 120), postal: postal || null, source: cleanSource(raw.source) };
  return details.name.length >= 2 && (!postal || POSTAL.test(postal)) ? details : null;
}

/** Supabase Auth hashes at most 72 bytes of a password. */
export const PASSWORD_MAX = 72;

/** True for a password the signup form accepts: at least PASSWORD_MIN and at most PASSWORD_MAX characters. */
export const validPassword = (raw: unknown): raw is string =>
  typeof raw === "string" && raw.length >= PASSWORD_MIN && raw.length <= PASSWORD_MAX;

/**
 * Why a password sign-in failed, in the words the sign-in form can explain. Supabase gives the same answer for an
 * unknown email and a wrong password, so "no_match" covers both.
 */
export type SignInFailure = "no_match" | "too_many" | "unavailable";

export function signInFailure(error: { status?: number; code?: string }): SignInFailure {
  if (error.status === 429 || error.code === "over_request_rate_limit") return "too_many";
  if (error.code === "invalid_credentials" || error.status === 400) return "no_match";
  return "unavailable";
}
