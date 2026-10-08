// Shared by the reserve form (client) and /api/signup (server).
export const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// reserved = on an open curriculum, sent to pay the deposit; waitlist = books for their curriculum are not ready.
export type SignupStatus = "reserved" | "waitlist";

// Provincial curricula we will build books for. "other" = another province, or the parent is not sure.
export const CURRICULA = {
  BC: "British Columbia",
  AB: "Alberta",
  SK: "Saskatchewan",
  MB: "Manitoba",
  ON: "Ontario",
  other: "Another province, or not sure",
} as const;

export type CurriculumId = keyof typeof CURRICULA;

/** Curricula we make books for today. Every other curriculum joins the waitlist (D-053). */
export const OPEN_CURRICULA: readonly CurriculumId[] = ["BC"];
export const statusFor = (c: CurriculumId): SignupStatus => (OPEN_CURRICULA.includes(c) ? "reserved" : "waitlist");

/** Best guess from the first letter of a postal code, which encodes the province. */
export function curriculumFromPostal(postal: string): CurriculumId | null {
  const c = postal.trim().charAt(0).toUpperCase();
  if (!c) return null;
  if (c === "V") return "BC";
  if (c === "T") return "AB";
  if (c === "S") return "SK";
  if (c === "R") return "MB";
  if ("KLMNP".includes(c)) return "ON";
  return "other";
}

// The server sets the status from the curriculum, so the client does not send one.
export interface SignupPayload {
  name: string;
  email: string;
  postal: string;
  plan: "one" | "both";
  subject: string;
  /** School grade, 1-7 (BC ages 6-12). */
  grade: number;
  curriculum: CurriculumId;
  /** CTA that opened the form, referrer and UTM tags, so we know which channel brought each parent. */
  source: Record<string, string>;
  /** Honeypot: hidden from people, filled in by bots. */
  website?: string;
}

/** What /api/signup answers. `pay` is the Stripe deposit URL, only for reserved signups when the link is set. */
export interface SignupResult {
  ok: boolean;
  status?: SignupStatus;
  pay?: string;
  error?: string;
}
