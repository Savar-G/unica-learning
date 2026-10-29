// Shared by the reserve form (client) and /api/signup (server).
import { SOURCE_KEYS } from "@/lib/visit-source";

export const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A trimmed string of at most n characters; anything else becomes "". */
export const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The keys a signup's source may hold: the visit's tags and click IDs (visit-source.ts), the referrer and the ad visit ID. */
const SOURCE_FIELDS = new Set<string>([...SOURCE_KEYS, "referrer", "visit_id"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Referrer, UTM tags, click IDs and ad visit ID from the browser: known keys only, each capped in size. */
export const cleanSource = (source: Record<string, string> | undefined) =>
  Object.fromEntries(
    Object.entries(source && typeof source === "object" ? source : {}).flatMap(([k, v]) => {
      if (!SOURCE_FIELDS.has(k)) return [];
      const value = clip(v, 300);
      if (!value || (k === "visit_id" && !UUID.test(value))) return [];
      return [[k, k === "visit_id" ? value.toLowerCase() : value]];
    }),
  );

// reserved = on an open curriculum, sent to Stripe to add a card; waitlist = books for their curriculum are not ready.
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
  plan: "one";
  subject: string;
  /** School grade, 1-7: the old booking form (no longer offered) and its signups table. The assessment takes K-9 (account.ts, D-156). */
  grade: number;
  curriculum: CurriculumId;
  /** CTA that opened the form, referrer and UTM tags, so we know which channel brought each parent. */
  source: Record<string, string>;
  /** Honeypot: hidden from people, filled in by bots. */
  website?: string;
}

/** What /api/signup answers. `cardUrl` is Stripe's page to add a card, only for reserved signups when Stripe works. */
export interface SignupResult {
  ok: boolean;
  status?: SignupStatus;
  /** The row's ref. /thank-you sends it with the "how did you hear about us?" answer. */
  ref?: string;
  cardUrl?: string;
  error?: string;
}
