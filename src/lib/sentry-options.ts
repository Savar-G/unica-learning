// The Sentry options every runtime shares (docs/sentry.md): the browser (src/instrumentation-client.ts), the Node
// server and the edge (src/instrumentation.ts). No Sentry code (a type only): the options are plain data and the hooks are the pure
// scrubbers of src/lib/sentry-scrub.ts, so a test reads them without starting Sentry.
import type { BrowserOptions } from "@sentry/nextjs";
import { scrubEvent, scrubLog, scrubMetric, scrubSpan } from "@/lib/sentry-scrub";

/**
 * The DSN of the Sentry project `unica-web` (org `unica-learning`, US region). A DSN only lets a client send events to
 * the project; it is public by design and ships in the browser bundle. NEXT_PUBLIC_SENTRY_DSN overrides it, and an empty
 * value turns Sentry off.
 */
export const SENTRY_DSN = "https://10064fe995f8eb573cd252a4327265d0@o4512437890842624.ingest.us.sentry.io/4512438134308864";

type Env = Readonly<Record<string, string | undefined>>;

/** The DSN in use, or "" when Sentry is off. */
export function sentryDsn(env: Env): string {
  const set = env.NEXT_PUBLIC_SENTRY_DSN;
  return set === undefined ? SENTRY_DSN : set.trim();
}

/**
 * The environment name: Vercel's (production or preview), else "development". Sentry sends only from a Vercel
 * deployment, or with SENTRY_ENABLED=on (on the Mac worker, or to test locally), so a local dev server sends nothing.
 */
export function sentryEnvironment(env: Env): string {
  return env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV || "development";
}
export function sentryEnabled(env: Env): boolean {
  if (!sentryDsn(env)) return false;
  return env.SENTRY_ENABLED === "on" || env.NEXT_PUBLIC_SENTRY_ENABLED === "on" || sentryEnvironment(env) !== "development";
}

/**
 * What the SDK may collect by itself. SDK v11 collects request bodies, cookies, headers, query strings, AI prompts and
 * answers and database data unless told not to, so every category is set here. Nothing here names a person.
 */
export const DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "accept", "content-length"] }, response: { allow: ["content-type", "content-length"] } },
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  stackFrameVariables: false,
};

/** Spans never sent: the health and analytics routes, and Next.js's own static files. */
export const SPANS_TO_IGNORE: (string | RegExp)[] = [/\/_next\/static\//, /\/ingest\//, /\/api\/hit\b/, /\/monitoring\b/, /\/sentry-tunnel\b/];

/** The options all runtimes share. `tracesSampleRate` differs: every server request, a tenth of browser page loads. */
export function sharedOptions(env: Env, runtime: "server" | "edge" | "browser") {
  return {
    dsn: sentryDsn(env),
    enabled: sentryEnabled(env),
    environment: sentryEnvironment(env),
    dataCollection: DATA_COLLECTION,
    tracesSampleRate: runtime === "browser" ? 0.1 : 1,
    ignoreSpans: SPANS_TO_IGNORE,
    // Errors, logs, spans and metrics are cleaned before they leave (src/lib/sentry-scrub.ts).
    beforeSend: scrubEvent,
    beforeSendLog: scrubLog,
    beforeSendSpan: scrubSpan,
    beforeSendMetric: scrubMetric,
    initialScope: { tags: { runtime } },
  };
}

/**
 * The address a job outside the site calls to check in: `?status=ok|error|in_progress`. Built from the DSN, which is
 * public. Null when Sentry is off.
 */
export function sentryCheckInUrl(slug: string, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const dsn = sentryDsn(env);
  if (!dsn) return null;
  const parsed = new URL(dsn);
  const project = parsed.pathname.replace(/^\//, "");
  return `${parsed.protocol}//${parsed.host}/api/${project}/cron/${encodeURIComponent(slug)}/${parsed.username}/`;
}
