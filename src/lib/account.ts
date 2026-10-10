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

export type AccountError = "bad_json" | "invalid" | "account_exists" | "weak_password" | "too_many" | "signed_out" | "busy" | "store_failed" | "off";

/** What /api/account/* answers. */
export interface AccountResult {
  ok: boolean;
  error?: AccountError;
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

/** The parent fields of a signup, cleaned, or null when one is not valid. */
export function cleanParent(raw: Partial<AccountSignupPayload>) {
  const parent = {
    name: clip(raw.name, 120),
    email: clip(raw.email, 200).toLowerCase(),
    postal: clip(raw.postal, 7).toUpperCase(),
    password: typeof raw.password === "string" ? raw.password : "",
    source: cleanSource(raw.source),
  };
  const valid = parent.name.length >= 2 && EMAIL.test(parent.email) && POSTAL.test(parent.postal)
    && parent.password.length >= PASSWORD_MIN && parent.password.length <= 72;
  return valid ? parent : null;
}
