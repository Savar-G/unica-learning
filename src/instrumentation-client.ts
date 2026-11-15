// Analytics start only after the visitor accepts them (src/lib/consent.ts).
// This file only watches the stored choice. It does not import PostHog. A returning visitor who accepted
// loads PostHog after the page is idle, so analytics never compete with the first paint.
//
// Sentry (docs/sentry.md): errors and a tenth of page loads' traces go to Sentry on every page, cleaned of tokens,
// queries and personal values (src/lib/sentry-scrub.ts); they set no cookie and hold no identifier. Session Replay
// loads only after the visitor accepts optional cookies, and never on the child's, scan or admin pages
// (src/lib/sentry-replay.ts).
import * as Sentry from "@sentry/nextjs";
import { getAnalytics } from "@/lib/analytics";
import { getConsent, subscribeConsent } from "@/lib/consent";
import { sharedOptions } from "@/lib/sentry-options";
import { replaySwitch, type ReplayHandle } from "@/lib/sentry-replay";

getAnalytics()?.begin();

const env = {
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
};
const options = sharedOptions(env, "browser");

const replay = replaySwitch({
  consented: () => getConsent() === "granted",
  subscribe: subscribeConsent,
  path: () => window.location.pathname,
  load: async () => {
    // A separate chunk: visitors who never accept never download the replay code.
    const { replayIntegration } = await import("@sentry/replay");
    const integration = replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      // No request or response details, headers or bodies (the default, kept explicit).
      networkDetailAllowUrls: [],
      // A last check when an error happens: the page it happened on must still allow a replay.
      beforeErrorSampling: () => replay.mayAttach(),
    });
    Sentry.addIntegration(integration);
    return integration as unknown as ReplayHandle;
  },
});

if (options.enabled) {
  Sentry.init({
    ...options,
    // Only on error, half of the time; never a whole visit.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    // Traces join the server's only on our own site.
    tracePropagationTargets: [/^\//, /^https:\/\/unicalearning\.com\//],
  });
  replay.start();
}

/** Next.js calls this before each client-side move: Sentry names the navigation, and the replay checks the next page. */
export function onRouterTransitionStart(href: string, navigationType: string) {
  if (!options.enabled) return;
  Sentry.captureRouterTransitionStart(href, navigationType);
  void replay.check(new URL(href, window.location.href).pathname);
}
