// Analytics gate. PostHog is imported, initialized, and called only while the stored consent is "granted".
// Events fired without consent are dropped, never queued, so nothing replays after a later accept.
// The banner and the footer trigger never import this file. They write the choice in consent.ts,
// and this file reacts to the change event (this tab) and the storage event (other tabs).
import { getConsent, subscribeConsent, type ConsentState } from "@/lib/consent";

type Props = Record<string, unknown>;

// The slice of the posthog-js instance this file uses.
export interface Client {
  init(key: string, config: Props): unknown;
  capture(event: string, props?: Props, options?: Props): unknown;
  reset(resetDeviceId?: boolean): void;
  opt_in_capturing(options?: { captureEventName?: false }): void;
  opt_out_capturing(): void;
}

export interface Deps {
  key: string;
  load: () => Promise<Client>;
  getConsent: () => ConsentState;
  subscribe: (onChange: () => void) => () => void;
  clearStorage: () => void;
  // Runs the first state check after the page is idle, so a returning visitor's load stays off the first paint.
  whenIdle: (run: () => void) => void;
  // The current page's path. The admin area (#77) never loads PostHog and drops every event, also the page views
  // PostHog sends by itself after a client-side move into it.
  path?: () => string;
}

function adminPath(path: string): boolean {
  try { path = decodeURIComponent(path); } catch { return true; }
  return /^\/(?:api\/)?admin(\/|$)/.test(path);
}

function adminEvent(event: Scrubbable): boolean {
  const url = event.properties?.$current_url;
  if (typeof url !== "string") return false;
  try { return adminPath(new URL(url).pathname); } catch { return false; }
}

// Only anonymous offer and flow fields reach analytics. Name, email, postal code and child grade never do.
const PROP_KEYS = new Set(["src", "plan", "subject", "curriculum", "price", "status", "code", "card", "channel"]);

export function sanitizeProps(props: Props = {}): Props {
  const out: Props = {};
  for (const key of Object.keys(props)) {
    if (!PROP_KEYS.has(key)) continue;
    const value = props[key];
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && value.length <= 40 && !value.includes("@")) out[key] = value;
  }
  return out;
}

function stripUrl(value: string): string {
  try {
    const u = new URL(value);
    return u.origin + u.pathname;
  } catch {
    return value.split(/[?#]/)[0];
  }
}

// A referrer path or query can hold search terms or an email-link token, so only the origin stays.
function referrerOrigin(value: string): string {
  if (!/^https?:/i.test(value)) return value.length <= 64 && !/[?#@/]/.test(value) ? value : "";
  try {
    return new URL(value).origin + "/";
  } catch {
    return "";
  }
}

function scrubBag(bag: unknown): void {
  if (!bag || typeof bag !== "object") return;
  const o = bag as Props;
  // PostHog updates previous-page state before before_send, even when that pageview is dropped.
  // A later public pageview must contain neither the admin record path nor time spent on that page.
  if (typeof o.$prev_pageview_pathname === "string" && adminPath(o.$prev_pageview_pathname)) {
    for (const key of Object.keys(o)) if (key.startsWith("$prev_pageview_")) delete o[key];
  }
  for (const key of Object.keys(o)) {
    const value = o[key];
    if (typeof value !== "string") continue;
    if (key.includes("referrer")) o[key] = referrerOrigin(value);
    else if (key.includes("url")) o[key] = stripUrl(value);
  }
}

interface Scrubbable {
  properties?: Props;
  $set?: Props;
  $set_once?: Props;
}

// Backstop for fields that sanitizeProps already blocks.
const PII_KEYS = ["email", "name", "postal", "grade", "$email", "$name"];

// Removes query strings, hashes and referrer paths from PostHog's own URL fields, and any personal field.
export function scrubEvent<T extends Scrubbable>(event: T): T {
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    scrubBag(bag);
    if (bag) for (const key of PII_KEYS) delete bag[key];
  }
  return event;
}

export function createAnalytics(deps: Deps) {
  let client: Client | null = null;
  let loading: Promise<void> | null = null;
  let lastState: ConsentState = "unset";
  let started = false;
  let optedOut = false;
  // Bumps on every consent change. A queued capture runs only in the epoch that queued it.
  let epoch = 0;

  const offPage = () => adminPath(deps.path?.() ?? "");
  const allowed = () => deps.getConsent() === "granted" && !offPage();

  const config: Props = {
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    // Off: autocapture, form values, replay, heatmaps, dead clicks, errors, surveys, feature flags, IP storage.
    autocapture: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    ip: false,
    save_referrer: false,
    respect_dnt: true,
    // Host-only cookie, so revocation can always find and delete it.
    cross_subdomain_cookie: false,
    // Last gate: an event captured after a revoke, or one with a stray field, never leaves the page.
    before_send: (event: Scrubbable | null) => (event && allowed() && !adminEvent(event) ? scrubEvent(event) : null),
  };

  function start() {
    if (client) {
      if (optedOut) {
        optedOut = false;
        client.opt_in_capturing({ captureEventName: false });
      }
      return;
    }
    if (loading) return;
    loading = deps
      .load()
      .then((posthog) => {
        loading = null;
        // Consent changed while the import was in flight: do not initialize.
        if (!allowed() || client) return;
        posthog.init(deps.key, config);
        // A marker left by an earlier opt-out must not mute a visitor who accepted now.
        posthog.opt_in_capturing({ captureEventName: false });
        client = posthog;
      })
      .catch(() => {
        loading = null;
      });
  }

  function revoke() {
    if (client) {
      try {
        // Reset first: it returns PostHog to its default consent, so the opt-out comes after it.
        client.reset(true);
        client.opt_out_capturing();
        optedOut = true;
      } catch {}
    }
    deps.clearStorage();
  }

  function sync() {
    const state = deps.getConsent();
    const prev = lastState;
    if (state !== prev) {
      lastState = state;
      epoch += 1;
    }
    if (state === "granted") {
      if (!offPage()) start();
    } else if (state === "denied" || prev === "granted") revoke();
    // "unset" from the start: nothing is loaded, stored or sent.
  }

  // beacon: the page is going away (#72), so send now with sendBeacon, which the browser finishes after the page closes.
  function track(event: string, props?: Props, options: { beacon?: boolean } = {}) {
    sync();
    if (!allowed()) return;
    const clean = sanitizeProps(props);
    const queuedIn = epoch;
    const send = () => {
      if (!client || epoch !== queuedIn || !allowed()) return;
      if (options.beacon) client.capture(event, clean, { transport: "sendBeacon", send_instantly: true });
      else client.capture(event, clean);
    };
    if (client) send();
    else if (loading) loading.then(send);
  }

  function begin() {
    if (started) return;
    started = true;
    deps.subscribe(sync);
    deps.whenIdle(sync);
  }

  return { begin, sync, track };
}

const COOKIE_OR_KEY = /^(ph_|__ph_)/;
// PostHog's opt-out marker holds 0 or 1 and no identifier. It stays so a reload cannot resume capture.
const OPT_OUT_MARKER = /^__ph_opt_in_out_/;

function expireCookie(name: string) {
  const parts = location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i += 1) domains.push(`; Domain=${parts.slice(i).join(".")}`);
  for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
}

function clearStore(store: Storage) {
  const names: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const name = store.key(i);
    if (name && COOKIE_OR_KEY.test(name) && !OPT_OUT_MARKER.test(name)) names.push(name);
  }
  for (const name of names) store.removeItem(name);
}

// Deletes PostHog's identity cookies and storage entries. Our own consent key does not match.
export function clearPostHogStorage() {
  if (typeof document === "undefined") return;
  try {
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0].trim();
      if (COOKIE_OR_KEY.test(name) && !OPT_OUT_MARKER.test(name)) expireCookie(name);
    }
  } catch {}
  try {
    clearStore(window.localStorage);
  } catch {}
  try {
    clearStore(window.sessionStorage);
  } catch {}
}

function whenIdle(run: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

// One instance per page, kept on globalThis in case the bundler loads this file twice.
const holder = globalThis as typeof globalThis & { __unicaAnalytics?: ReturnType<typeof createAnalytics> | null };

export function getAnalytics() {
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  holder.__unicaAnalytics ??= createAnalytics({
    key,
    load: () => import("posthog-js").then((m) => m.default as unknown as Client),
    getConsent,
    subscribe: subscribeConsent,
    clearStorage: clearPostHogStorage,
    whenIdle,
    path: () => window.location.pathname,
  });
  return holder.__unicaAnalytics;
}
