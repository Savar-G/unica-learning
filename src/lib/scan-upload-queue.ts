// The browser's upload queue for Scan pages (#915): which photos start next, and how a photo waits when the server has no
// room. Pure TypeScript: no React, network or clock. The page (src/components/scan-pages.tsx) runs the requests.
//
// A batch from the camera roll goes up in the order it was chosen, UPLOAD_SLOTS at a time (the server's
// `scan_limits.concurrent_uploads`, D-271: 2 uploads at once). A photo the server answers `busy` keeps its place and asks
// again; it never fails for waiting. After a short wait it is "held": the screen says it is waiting for room, and the
// asks slow down. Each request has a time limit, so one hung upload frees its slot instead of holding the rest.
// A photo over the 10-minute limit (`frequency`, `scan_limits.per_ten_minutes`) waits the same way, held at once and asked
// again every 30 s until the window has room. The day limit (`daily`) does not wait: it is refused until tomorrow.

/** Uploads in flight at once: the server's `scan_limits.concurrent_uploads`. */
export const UPLOAD_SLOTS = 2;

/** The time limit of one upload (the photo itself), and of every other request. */
export const UPLOAD_TIMEOUT_MS = 90_000;
export const REQUEST_TIMEOUT_MS = 20_000;

/** Busy answers asked again at the short wait before a photo shows as waiting for room (about 30 s). */
const QUICK_TRIES = 20;
const QUICK_MS = 1_500;
/** The waits once held: 5 s, 10 s, then every 15 s, for as long as the photo waits. */
const HELD_MS = [5_000, 10_000, 15_000] as const;

/**
 * What to do after the server's `busy` answer number `tries` (0 for the first) for one photo: how long to wait before
 * asking again, and whether the photo now shows as waiting for room. There is no last try.
 */
export function busyWait(tries: number): { delayMs: number; held: boolean } {
  if (tries < QUICK_TRIES) return { delayMs: QUICK_MS, held: false };
  return { delayMs: HELD_MS[Math.min(tries - QUICK_TRIES, HELD_MS.length - 1)], held: true };
}

/** A photo over the 10-minute limit asks again this often: the window frees one photo at a time. */
const FREQUENCY_MS = 30_000;

/** Whether a refusal keeps the photo in its place to ask again: no room right now (`busy`) or the 10-minute limit. */
export const waitsForRoom = (code: string) => code === "busy" || code === "frequency";

/**
 * The wait after refusal `code` number `tries` (0 for the first) for one photo: `busyWait` for `busy`; for the 10-minute
 * limit, held at once and asked again every 30 s. There is no last try for either.
 */
export function roomWait(code: string, tries: number): { delayMs: number; held: boolean } {
  return code === "frequency" ? { delayMs: FREQUENCY_MS, held: true } : busyWait(tries);
}

/** The photos to start now: waiting ones not yet running, in the order they were added, up to the free slots. */
export function nextUploads(uploads: readonly { key: string; status: string }[], running: ReadonlySet<string>, slots = UPLOAD_SLOTS): string[] {
  const free = slots - [...running].filter((key) => uploads.some((u) => u.key === key)).length;
  if (free <= 0) return [];
  return uploads.filter((u) => u.status === "waiting" && !running.has(u.key)).slice(0, free).map((u) => u.key);
}
