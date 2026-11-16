// Server configuration only. At the verified cutover, production includes the final readers,
// Vercel skewProtectionMaxAge is 0, and no Maya call is live. Savar approved activation without the old wait.
// A record version alone is not a fence. Keep compatible readers on every rollback target.
export const MAYA_CHAT_STREAM_NOT_BEFORE = Date.parse("2026-11-16T20:33:36Z");

/** Both trusted server inputs must permit new sentence writes. Readers remain available when this returns false. */
export function mayaChatStreamEnabled(value: string | undefined, now: number): boolean {
  return value === "on" && Number.isFinite(now) && now >= MAYA_CHAT_STREAM_NOT_BEFORE;
}
