// What Sentry may receive (docs/sentry.md). Pure TypeScript: no Sentry import, so the rules are tested alone.
// Sentry gets errors, logs, spans and metrics from the site. None of them may hold a child's work, a name, an email
// address, a QR or sign-in token, or a query string. The SDK options (src/lib/sentry-options.ts) turn off what Sentry
// would collect by itself (request bodies, cookies, headers, query strings, AI prompts and answers, database queries);
// this file is the second line: it cleans every address and every free text before it leaves.
import { mayCarryQrToken, redactPathTokens } from "@/lib/url-tokens";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Long opaque values: sign-in and unsubscribe tokens, API keys, Stripe secrets, JWTs. UUIDs stay: they are our own ids.
const TOKEN = /\b(?:sk|pk|rk|whsec|sntry[a-z]*|eyJ)[A-Za-z0-9_.-]{12,}|\b[A-Za-z0-9_-]{40,}\b/g;
const BEARER = /\bBearer\s+\S+/gi;

/** Free text with emails, bearer values and long tokens replaced. */
export function scrubText(value: string): string {
  return value.replace(BEARER, "Bearer [hidden]").replace(EMAIL, "[email]").replace(TOKEN, "[token]");
}

/**
 * An address with no query and no hash, and with the QR token, the scan page and the admin record replaced as the
 * analytics rules do (src/lib/url-tokens.ts). A bare path works too.
 */
export function scrubUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return scrubText(value);
    return parsed.origin + redactPathTokens(parsed.pathname);
  } catch {
    const path = value.replace(/[?#].*$/, "");
    return path.startsWith("/") ? redactPathTokens(path) : scrubText(path);
  }
}

/** Any text that may hold addresses: each address in it loses its query, and the rest is scrubbed. */
function scrubAddresses(value: string): string {
  const withUrls = value.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => scrubUrl(url));
  const withPaths = withUrls.replace(/(^|[\s"'(])(\/[^\s"'<>)]*)/g, (_, lead: string, path: string) => lead + scrubUrl(path));
  return scrubText(withPaths);
}

const URL_KEY = /url|uri|path|target|route|referer|referrer|location|href/i;

/** One attribute, header or tag value: an address-like key is cleaned as an address, any other text as free text. */
export function scrubValue(key: string, value: unknown): unknown {
  if (typeof value === "string") return URL_KEY.test(key) ? scrubUrl(value) : scrubAddresses(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(key, v));
  return value;
}

/** Every value of a flat record, cleaned in place. Returns the same record. */
export function scrubRecord<T extends Record<string, unknown> | undefined | null>(record: T): T {
  if (!record) return record;
  for (const key of Object.keys(record)) record[key] = scrubValue(key, record[key]);
  return record;
}

// --- Events (errors) -----------------------------------------------------------------------------------------------

interface Frame { vars?: unknown; pre_context?: string[]; context_line?: string; post_context?: string[] }
interface ExceptionValue { value?: string; stacktrace?: { frames?: Frame[] } }
interface Breadcrumb { category?: string; message?: string; data?: Record<string, unknown> }
/** The slice of a Sentry error event this file cleans. */
export interface ScrubbableEvent {
  message?: string;
  transaction?: string;
  request?: { url?: string; query_string?: unknown; data?: unknown; cookies?: unknown; headers?: Record<string, string>; env?: unknown };
  exception?: { values?: ExceptionValue[] };
  breadcrumbs?: Breadcrumb[];
  user?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  logentry?: { message?: string; formatted?: string; params?: unknown[] };
}

// Request headers that stay on an error: enough to tell the browser and the route, nothing that names a person.
const KEEP_HEADERS = new Set(["user-agent", "content-type", "accept", "content-length", "x-vercel-id"]);

/**
 * A CSS selector Sentry built from a clicked element (`button.pill[aria-label="Iris. Change child"]`) without its
 * attribute values: an aria-label, title, alt or name can hold a child's name. Tag, id and classes stay.
 */
export function stripElementLabels(selector: string): string {
  return selector.replace(/\[[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]*))?\]/g, "");
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // A console line can print anything the code had in hand (a child's answer, an email), so it never goes.
  if (crumb.category === "console") return null;
  if (crumb.message && crumb.category?.startsWith("ui.")) crumb.message = stripElementLabels(crumb.message);
  if (crumb.message) crumb.message = scrubAddresses(crumb.message);
  if (crumb.data) {
    for (const key of Object.keys(crumb.data)) {
      // A request or response body never goes (fetch and xhr breadcrumbs only hold sizes by default).
      if (/body|input|arguments/i.test(key)) delete crumb.data[key];
      else crumb.data[key] = scrubValue(key, crumb.data[key]);
    }
  }
  return crumb;
}

/** A Sentry error event with every private value removed. Never drops the event. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) event.message = scrubAddresses(event.message);
  if (event.logentry) {
    if (event.logentry.message) event.logentry.message = scrubAddresses(event.logentry.message);
    if (event.logentry.formatted) event.logentry.formatted = scrubAddresses(event.logentry.formatted);
    delete event.logentry.params;
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  const request = event.request;
  if (request) {
    if (request.url) request.url = scrubUrl(request.url);
    delete request.query_string;
    delete request.data;
    delete request.cookies;
    delete request.env;
    if (request.headers) {
      for (const key of Object.keys(request.headers)) if (!KEEP_HEADERS.has(key.toLowerCase())) delete request.headers[key];
    }
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubAddresses(value.value);
    // Local variables of a stack frame can hold anything the code had in hand.
    for (const frame of value.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((c): c is Breadcrumb => c !== null);
  // Only our own pseudonymous id may stay on the user: never an email, a name or an IP address.
  if (event.user) event.user = typeof event.user.id === "string" ? { id: event.user.id } : {};
  scrubRecord(event.tags);
  scrubRecord(event.extra);
  for (const context of Object.values(event.contexts ?? {})) scrubRecord(context);
  return event;
}

// --- Logs, spans, metrics ------------------------------------------------------------------------------------------

/** The slice of a Sentry log this file cleans. */
export interface ScrubbableLog { message: unknown; attributes?: Record<string, unknown> }

/** A log with its message and attributes cleaned. */
export function scrubLog<T extends ScrubbableLog>(log: T): T {
  if (typeof log.message === "string") log.message = scrubAddresses(log.message);
  if (log.attributes) {
    for (const key of Object.keys(log.attributes)) {
      // The console integration keeps each printed argument as its own attribute: the cleaned message has them all.
      if (/^sentry\.message\.parameter\./.test(key)) delete log.attributes[key];
      else log.attributes[key] = scrubValue(key, log.attributes[key]);
    }
  }
  return log;
}

/** The slice of a streamed Sentry span this file cleans. */
export interface ScrubbableSpan { name: string; attributes?: Record<string, unknown> }

// Span attributes that may hold content (an AI prompt or answer, a database statement, a body). The SDK options turn
// them off; this is the backstop.
const CONTENT_ATTRIBUTE = /^gen_ai\.(input|output|prompt|request\.messages|response\.text|system_instructions|tool\.call)|^db\.(query\.text|statement)|body|^http\.request\.header\.|^http\.response\.header\.|cookie|^url\.query$/i;

/** A span with its name and attributes cleaned (spans cannot be dropped here: see SPANS_TO_IGNORE). */
export function scrubSpan<T extends ScrubbableSpan>(span: T): T {
  // An interaction span (a click, a key press) is named after its element's selector, labels included.
  const op = span.attributes?.["sentry.op"];
  const interaction = typeof op === "string" && op.startsWith("ui.");
  span.name = scrubAddresses(interaction ? stripElementLabels(span.name) : span.name);
  if (span.attributes) {
    for (const key of Object.keys(span.attributes)) {
      const value = span.attributes[key];
      if (CONTENT_ATTRIBUTE.test(key)) delete span.attributes[key];
      else if (typeof value === "string" && (interaction || /element|selector|component/i.test(key))) span.attributes[key] = scrubAddresses(stripElementLabels(value));
      else span.attributes[key] = scrubValue(key, value);
    }
  }
  return span;
}

/** The slice of a Sentry metric this file cleans. */
export interface ScrubbableMetric { attributes?: Record<string, unknown> }

export function scrubMetric<T extends ScrubbableMetric>(metric: T): T {
  scrubRecord(metric.attributes);
  return metric;
}

// --- Session Replay ------------------------------------------------------------------------------------------------

// Pages a replay never records: the child's own screens (the desk and its QR pages, the start screen, the test), the scan pages with photos
// of a child's work, the admin area (every family's records), and the parent preview pages under /admin.
const NO_REPLAY = [/^\/+tutor(\/|$)/i, /^\/+admin(\/|$)/i, /^\/+account\/+(scan|test|start)(\/|$)/i];

/**
 * Whether a replay may record on this page. False on child, scan and admin pages, and on any address that may carry a
 * QR token. Reads encoded addresses as the analytics rules do.
 */
export function replayAllowed(pathOrUrl: string): boolean {
  if (mayCarryQrToken(pathOrUrl)) return false;
  let parsed: URL;
  try { parsed = new URL(pathOrUrl, "https://unicalearning.com"); } catch { return false; }
  // A replay keeps the full address of each page it saw (Sentry does not clean it), so a page whose address holds
  // anything after the path (a sign-in or unsubscribe token, a Stripe session, a report or reminder id) is not
  // recorded. Only ad tags (utm_*) may be there.
  if (parsed.hash && parsed.hash !== "#") return false;
  for (const key of parsed.searchParams.keys()) if (!/^utm_[a-z]+$/.test(key)) return false;
  let path: string;
  try { path = decodeURIComponent(parsed.pathname); } catch { return false; }
  return !NO_REPLAY.some((rule) => rule.test(path));
}

/**
 * A replay recording event with each address in its data cleaned (scrubUrl). Only the page-change events (meta, type
 * 4) and the breadcrumb events (custom, type 5) hold addresses: the page snapshots are masked and are not walked.
 */
export function scrubRecordingEvent<T extends { type?: unknown; data?: unknown }>(event: T): T {
  if (event.type !== 4 && event.type !== 5) return event;
  const walk = (value: unknown, depth: number): unknown => {
    if (typeof value === "string") return /^(https?:\/\/|\/)/.test(value) ? scrubUrl(value) : value;
    if (depth > 6 || !value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = key === "message" && typeof record[key] === "string" ? stripElementLabels(record[key] as string) : walk(record[key], depth + 1);
    return record;
  };
  event.data = walk(event.data, 0);
  return event;
}
