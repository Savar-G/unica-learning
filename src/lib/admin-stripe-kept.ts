import "server-only";

// Stripe's answers for the admin pages, kept on this server for a short time (2026-11-10). Home, Families, Activity,
// Emails and each family page asked Stripe for every subscription and for each card setup with no saved time on every
// load, a few hundred ms each time. A page loaded again within KEEP_MS uses the same answers; a failed read and an
// "unknown" card answer are never kept. Starting, pausing or cancelling a plan calls forgetAdminStripeReads, so the
// next admin page on that server asks Stripe again; a change made in Stripe itself, or on another server, shows within
// KEEP_MS.

export const KEEP_MS = 60_000;

let subscriptions: { at: number; read: Promise<unknown> } | null = null;
const cards = new Map<string, { at: number; answer: { state: string } }>();

/** The subscription list, read again only when the kept one is older than KEEP_MS or failed. */
export function keptSubscriptions<T>(read: () => Promise<T>, now = Date.now()): Promise<T> {
  if (subscriptions && now - subscriptions.at < KEEP_MS) return subscriptions.read as Promise<T>;
  const kept = { at: now, read: read() };
  subscriptions = kept;
  kept.read.catch(() => { if (subscriptions === kept) subscriptions = null; });
  return kept.read;
}

/** One card setup's saved-card answer from Stripe, kept unless it is "unknown". */
export async function keptCardAnswer<T extends { state: string }>(cardId: string, read: () => Promise<T>, now = Date.now()): Promise<T> {
  const kept = cards.get(cardId);
  if (kept && now - kept.at < KEEP_MS) return kept.answer as T;
  const answer = await read();
  if (answer.state === "unknown") cards.delete(cardId);
  else cards.set(cardId, { at: now, answer });
  return answer;
}

/** Forget the kept answers on this server: call after a plan starts, pauses, resumes or ends. */
export function forgetAdminStripeReads(): void {
  subscriptions = null;
  cards.clear();
}
