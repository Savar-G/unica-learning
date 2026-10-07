// Shared by the reserve form (client) and /api/signup (server).
export const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupStatus = "reserved" | "waitlist";

export interface SignupPayload {
  status: SignupStatus;
  name: string;
  email: string;
  postal: string;
  plan: "one" | "both";
  subject: string;
  /** School grade, 1-7 (BC ages 6-12). */
  grade: number;
  /** CTA that opened the form, referrer and UTM tags, so we know which channel brought each parent. */
  source: Record<string, string>;
  /** Honeypot: hidden from people, filled in by bots. */
  website?: string;
}
