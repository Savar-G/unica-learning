// Session Replay's switch (docs/sentry.md). A replay records only:
// - after the visitor accepts optional cookies (the same choice as PostHog, src/lib/consent.ts), and
// - while every page of this document so far was one where replayAllowed is true: never the child's screens, the scan
//   pages, the admin area, or an address with a query (a token, a session, an id). Once such a page shows, the replay
//   stays off until the next full page load: a client-side move away from it starts while its content is still on
//   screen, and the first snapshot would hold it.
// It keeps only the last minute in the browser. When an error happens it sends that minute, for half of the errors,
// then starts a new empty buffer: it never turns into a recording of the whole visit (Sentry's own error path does
// that, so `beforeErrorSampling` always declines and this file sends instead). It masks all text and inputs and blocks
// images, video and canvas. Leaving consent stops it at once and sends nothing that was held.
// Pure TypeScript: the replay, the consent, the page and the chance are passed in.
import { replayAllowed } from "@/lib/sentry-scrub";

/** The slice of Sentry's replay integration this file uses. */
export interface ReplayHandle {
  startBuffering(): void;
  stop(options?: { flush?: boolean }): Promise<void>;
  flush(options?: { continueRecording?: boolean }): Promise<void>;
  getRecordingMode(): "session" | "buffer" | undefined;
}

export interface ReplayDeps {
  /** True while the visitor's stored choice is "granted". */
  consented: () => boolean;
  /** Calls `onChange` after the stored choice changes; returns the unsubscribe. */
  subscribe: (onChange: () => void) => () => void;
  /** The current page's full address. */
  href: () => string;
  /** Loads and adds the replay integration once; it starts buffering by itself. */
  load: () => Promise<ReplayHandle>;
  /** A number in [0, 1) for the error sample; Math.random in the browser. */
  random?: () => number;
}

/** Errors whose last minute is sent. */
export const REPLAY_ERROR_SAMPLE = 0.5;

/** The replay switch: `check(href)` before each change of page, with the next page's address. */
export function replaySwitch(deps: ReplayDeps) {
  let replay: ReplayHandle | null = null;
  let loading: Promise<ReplayHandle> | null = null;
  let next: string | null = null;
  // A blocked page showed in this document: off until the next full load.
  let blocked = false;
  let sending = false;

  const pageAllowed = () => {
    if (!replayAllowed(next ?? deps.href())) blocked = true;
    return !blocked;
  };
  const allowedNow = () => pageAllowed() && deps.consented();
  const halt = async () => { if (replay && replay.getRecordingMode() !== undefined) await replay.stop({ flush: false }); };

  async function check(nextHref?: string): Promise<void> {
    if (nextHref !== undefined) next = nextHref;
    if (!allowedNow()) return halt();
    if (!replay) {
      loading ??= deps.load();
      try { replay = await loading; } catch { loading = null; return; }
      // The page or the choice can change while the integration loads.
      if (!allowedNow()) return halt();
    }
    if (!sending && replay.getRecordingMode() === undefined) replay.startBuffering();
  }

  /** Sends the buffered minute once, then empties the buffer and starts a new one. */
  async function sendOnce(): Promise<void> {
    if (!replay || sending) return;
    sending = true;
    try {
      await replay.flush({ continueRecording: false });
      await replay.stop({ flush: false });
    } finally {
      sending = false;
    }
    await check();
  }

  return {
    check,
    /** Starts watching the stored choice. */
    start(): () => void {
      void check();
      return deps.subscribe(() => { void check(); });
    },
    /**
     * Sentry's `beforeErrorSampling`: always false, so Sentry never turns the buffer into a whole-visit recording. For a
     * sampled error on an allowed page, this file sends the buffer itself, once.
     */
    onError(): boolean {
      if (allowedNow() && (deps.random ?? Math.random)() < REPLAY_ERROR_SAMPLE) setTimeout(() => { void sendOnce(); }, 0);
      return false;
    },
  };
}
