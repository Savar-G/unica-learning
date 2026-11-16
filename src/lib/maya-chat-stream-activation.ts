// Server configuration only. The final protocol readers became public at 2026-11-16T18:31:27Z.
// The fixed deadline includes their full 12-hour old-server window. A record version is not a fence.
export const MAYA_CHAT_STREAM_NOT_BEFORE = Date.parse("2026-11-17T06:31:27Z");

/** Both trusted server inputs must permit new sentence writes. Readers remain available when this returns false. */
export function mayaChatStreamEnabled(value: string | undefined, now: number): boolean {
  return value === "on" && Number.isFinite(now) && now >= MAYA_CHAT_STREAM_NOT_BEFORE;
}
