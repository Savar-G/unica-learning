// Session Replay's switch (docs/sentry.md). A replay records only:
// - after the visitor accepts optional cookies (the same choice as PostHog, src/lib/consent.ts), and
// - on a page where replayAllowed is true: never the child's screens, the scan pages or the admin area.
// It keeps only the last minute in the browser and sends it only when an error happens (the error sample rate); it
// masks all text and inputs and blocks images, video and canvas. Leaving consent or moving to a blocked page stops it at
// once and sends nothing that was held. Pure TypeScript: the replay, the consent and the page are passed in.
import { replayAllowed } from "@/lib/sentry-scrub";

/** The slice of Sentry's replay integration this file uses. */
export interface ReplayHandle {
  startBuffering(): void;
  stop(options?: { flush?: boolean }): Promise<void>;
  getRecordingMode(): "session" | "buffer" | undefined;
}

export interface ReplayDeps {
  /** True while the visitor's stored choice is "granted". */
  consented: () => boolean;
  /** Calls `onChange` after the stored choice changes; returns the unsubscribe. */
  subscribe: (onChange: () => void) => () => void;
  /** The current page's path. */
  path: () => string;
  /** Loads and adds the replay integration once; it starts buffering by itself on an allowed page. */
  load: () => Promise<ReplayHandle>;
}

/** The replay switch: `check()` after each change of page, with the next page's address. */
export function replaySwitch(deps: ReplayDeps) {
  let replay: ReplayHandle | null = null;
  let loading: Promise<ReplayHandle> | null = null;
  let next: string | null = null;

  const allowedNow = () => deps.consented() && replayAllowed(next ?? deps.path());

  async function check(nextPath?: string): Promise<void> {
    if (nextPath !== undefined) next = nextPath;
    if (!allowedNow()) {
      if (replay && replay.getRecordingMode() !== undefined) await replay.stop({ flush: false });
      return;
    }
    if (!replay) {
      loading ??= deps.load();
      try { replay = await loading; } catch { loading = null; return; }
      // The page or the choice can change while the integration loads.
      if (!allowedNow()) { await replay.stop({ flush: false }); return; }
    }
    if (replay.getRecordingMode() === undefined) replay.startBuffering();
  }

  return {
    check,
    /** Starts watching the stored choice. */
    start(): () => void {
      void check();
      return deps.subscribe(() => { void check(); });
    },
    /** For the error sampler: whether the replay may be sent with an error on this page now. */
    mayAttach: () => allowedNow(),
  };
}
