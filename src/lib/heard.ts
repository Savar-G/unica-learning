// "How did you hear about us?" Asked on /thank-you after the booking is saved, so it adds no step to the form.
// Shared by the question (client) and /api/heard (server). Saved to public.signup_heard, joined to signups by ref.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChannelId = "friend" | "search" | "ai" | "social" | "other";

export interface Channel {
  label: string;
  /** Follow-up question, shown after the parent taps this channel. */
  ask?: string;
  /** One-tap answers to `ask`. Without picks, `ask` takes free text. */
  picks?: readonly string[];
}

export const CHANNELS: Record<ChannelId, Channel> = {
  friend: { label: "Friend or family" },
  search: { label: "Google search" },
  ai: { label: "ChatGPT or another AI", ask: "Which one?", picks: ["ChatGPT", "Gemini", "Claude", "Other"] },
  social: { label: "Social media", ask: "Which one?", picks: ["Facebook", "Instagram", "TikTok", "YouTube", "Other"] },
  other: { label: "Something else", ask: "Where did you hear about us?" },
};

export interface HeardPayload {
  ref: string;
  channel: ChannelId;
  /** A pick for "ai" and "social", free text for "other". */
  detail?: string;
}

// The booking ref, kept in this tab from the form to /thank-you (also across the trip to Stripe).
const KEY = "pw-heard";
const MAX_AGE = 2 * 60 * 60 * 1000;

export function keepHeardRef(ref: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ref, at: Date.now() })); } catch {}
}

export function readHeardRef(): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!v || typeof v.at !== "number" || v.at > Date.now() || Date.now() - v.at > MAX_AGE) return null;
    return typeof v.ref === "string" && UUID.test(v.ref) ? v.ref : null;
  } catch { return null; }
}
