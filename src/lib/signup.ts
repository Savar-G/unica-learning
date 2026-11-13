// Curricula, field checks and the source cleaner, shared by the account signup, the contact form and the admin.
import { SOURCE_KEYS } from "@/lib/visit-source";

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
