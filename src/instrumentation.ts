// Sentry on the server and the edge (docs/sentry.md): errors, traces of every request, the warn and error console
// lines as logs, and metrics. Every one is cleaned before it leaves (src/lib/sentry-scrub.ts), and the SDK collects no
// bodies, cookies, query strings, AI prompts or answers, or database data (DATA_COLLECTION in src/lib/sentry-options.ts).
import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "@/lib/sentry-options";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ after }, { configureAiUsageLifetime }] = await Promise.all([import("next/server"), import("@/lib/ai-usage")]);
    configureAiUsageLifetime((write) => after(() => write));
  }
  const runtime = process.env.NEXT_RUNTIME === "edge" ? "edge" : "server";
  if (runtime === "server") {
    const [{ setProductObserver }, { productObserver }] = await Promise.all([import("@/lib/product-monitoring"), import("@/lib/product-monitoring-server")]);
    setProductObserver(productObserver());
  }
  const options = sharedOptions(process.env, runtime);
  if (!options.enabled) return;
  Sentry.init({
    ...options,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // console.warn and console.error become logs. info and log lines stay in Vercel only: they are many, and a few
    // print counts that the team digest already sends.
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  });
  // AI requests get their spans and metrics (src/lib/ai-observe-sentry.ts).
  const [{ setAiObserver }, { sentryAiObserver }] = await Promise.all([import("@/lib/ai-observe"), import("@/lib/ai-observe-sentry")]);
  setAiObserver(sentryAiObserver);
}

// Errors of Server Components, route handlers, server actions and the proxy.
export const onRequestError = Sentry.captureRequestError;
