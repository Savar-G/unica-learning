// Meta Pixel and the Google tag (Google Ads) for the ad test (D-123, docs/ad-tracking.md). Rules:
// - Off unless their IDs are set (NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_GOOGLE_ADS_ID); each conversion label is
//   optional (NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL, _REPORT_LABEL, _CARD_LABEL).
// - Loaded only after the visitor accepts optional cookies (consent.ts), at the same moment as PostHog: after the
//   page is idle for a returning visitor, at once after a click on Accept.
// - Never on a page a child uses (adsBlockedPath). The scripts never load there; when they are loaded from an earlier
//   page of the same visit, they are paused on arrival (Meta consent revoke, Google consent denied) and get no call
//   until the visitor is back on an allowed page. Meta's own history tracking and automatic events are off, so every
//   page view is ours and only goes out on an allowed page.
// - A conversion goes out with the existing track() call (track.ts is the one place call sites use) and carries no
//   personal data: no email, name, child data, grade or ids. Google gets the page address with ids replaced and only
//   the ad tags (utm_*, gclid) kept in its query. Meta Pixel reads the page address itself (docs/ad-tracking.md).
// Pure apart from getAdTags and its browser helpers: createAdTags takes its browser parts, so tests use fakes.
import { getConsent, subscribeConsent, type ConsentState } from "@/lib/consent";
import { firstMonth, PLANS } from "@/lib/site";

export interface AdConfig {
  metaPixelId: string | null;
  googleAdsId: string | null;
  googleLabels: { lead: string | null; report: string | null; card: string | null };
}

const META_ID = /^\d{5,20}$/;
const GOOGLE_ID = /^AW-\d{5,15}$/;
const LABEL = /^[A-Za-z0-9_-]{1,64}$/;
const valid = (v: string | undefined, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : null);

/** The tags' IDs from the environment. A missing or malformed value is off. */
export function adConfig(
  env: Record<string, string | undefined> = {
    // Written out one by one, so Next.js puts the values into the browser bundle.
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL,
    NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL,
    NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL,
  },
): AdConfig {
  return {
    metaPixelId: valid(env.NEXT_PUBLIC_META_PIXEL_ID, META_ID),
    googleAdsId: valid(env.NEXT_PUBLIC_GOOGLE_ADS_ID, GOOGLE_ID),
    googleLabels: {
      lead: valid(env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL, LABEL),
      report: valid(env.NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL, LABEL),
      card: valid(env.NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL, LABEL),
    },
  };
}

// The pages a child uses: the start screen the parent hands over (/account/start/<child>), the test
// (/account/test/<child>) and the extra round (/account/extra/<test>).
const CHILD_PAGES = /^\/account\/(?:start|test|extra)(?:\/|$)/i;
// Pages whose address can hold a sign-in or unsubscribe token, and the admin area: no ad tags there either.
const PRIVATE_PAGES = /^\/(?:admin|api|auth|sign-in|unsubscribe)(?:\/|$)/i;

/** True on a page where the ad tags never load and never send. An address that cannot be read counts as blocked. */
export function adsBlockedPath(path: string): boolean {
  let p: string;
  try { p = decodeURIComponent(path); } catch { return true; }
  p = p.replace(/\/{2,}/g, "/");
  return CHILD_PAGES.test(p) || PRIVATE_PAGES.test(p);
}

/** The value of a saved card, the first month's price (D-091). */
export const CARD_VALUE = firstMonth(PLANS.one.price);

type Call = (...args: unknown[]) => void;
/** The two tags' call functions, after their scripts are added. */
export interface Senders {
  meta?: Call;
  google?: Call;
}

export interface AdDeps {
  config: AdConfig;
  getConsent: () => ConsentState;
  subscribe: (onChange: () => void) => () => void;
  /** The current page's path. */
  path: () => string;
  /** The current page's address with ids replaced and only its ad tags kept in the query, for Google's page_location. */
  location: () => string;
  whenIdle: (run: () => void) => void;
  /** Adds the scripts (once) and returns their call functions. */
  install: (config: AdConfig) => Senders;
  /** Deletes the tags' cookies after the visitor turns optional cookies off. */
  clearCookies: () => void;
}

export function createAdTags(deps: AdDeps) {
  const { config } = deps;
  const on = Boolean(config.metaPixelId || config.googleAdsId);
  let senders: Senders | null = null;
  let paused = false;
  let ready = false;
  let started = false;
  let lastViewed: string | null = null;
  let lastConsent: ConsentState = "unset";

  function pause() {
    if (!senders || paused) return;
    paused = true;
    senders.meta?.("consent", "revoke");
    senders.google?.("consent", "update", { ad_storage: "denied", ad_user_data: "denied" });
  }

  function resume() {
    if (!senders || !paused) return;
    paused = false;
    senders.meta?.("consent", "grant");
    senders.google?.("consent", "update", { ad_storage: "granted", ad_user_data: "granted" });
  }

  /**
   * Brings the tags in line with the consent and the page. True when they may send now. `now`: load without waiting
   * for the page to be idle (a conversion, or the visitor just accepted).
   */
  function sync(now = false): boolean {
    if (!on) return false;
    const consent = deps.getConsent();
    const wasGranted = lastConsent === "granted";
    lastConsent = consent;
    if (consent !== "granted") {
      pause();
      lastViewed = null;
      if (wasGranted) deps.clearCookies();
      return false;
    }
    const here = deps.path();
    if (adsBlockedPath(here)) {
      pause();
      lastViewed = null;
      return false;
    }
    if (!senders) {
      if (!ready && !now) return false;
      senders = deps.install(config);
    }
    resume();
    // Meta's history tracking is off, so this is the only page view: one per allowed page.
    if (lastViewed !== here) {
      lastViewed = here;
      senders.meta?.("track", "PageView");
    }
    return true;
  }

  function begin() {
    if (started) return;
    started = true;
    // A click on Accept loads the tags at once; a returning visitor's load waits until the page is idle.
    deps.subscribe(() => sync(true));
    deps.whenIdle(() => {
      ready = true;
      sync();
    });
  }

  /** After a client-side move to another page. */
  function page() {
    if (started) sync();
  }

  function google(label: string | null, extra: Record<string, unknown> = {}) {
    if (!config.googleAdsId || !label) return;
    senders?.google?.("event", "conversion", { send_to: `${config.googleAdsId}/${label}`, page_location: deps.location(), ...extra });
  }

  /** A funnel event from track(). Only three map to a conversion; the rest send nothing. No props travel. */
  function conversion(event: string) {
    if (event !== "account_created" && event !== "report_open" && event !== "card_saved") return;
    if (!sync(true) || !senders) return;
    if (event === "account_created") {
      senders.meta?.("track", "Lead");
      google(config.googleLabels.lead);
    } else if (event === "report_open") {
      senders.meta?.("trackCustom", "ReportOpen");
      google(config.googleLabels.report);
    } else {
      senders.meta?.("track", "AddPaymentInfo", { value: CARD_VALUE, currency: "CAD" });
      google(config.googleLabels.card, { value: CARD_VALUE, currency: "CAD" });
    }
  }

  return { begin, page, conversion };
}

// Browser parts.

type Queue = Call & { queue?: unknown[]; callMethod?: Call; push?: Call; loaded?: boolean; version?: string; disablePushState?: boolean; allowDuplicatePageViews?: boolean };
type AdWindow = Window & { fbq?: Queue; _fbq?: Queue; dataLayer?: unknown[]; gtag?: Call };

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function installTags(config: AdConfig): Senders {
  const w = window as AdWindow;
  const out: Senders = {};
  if (config.metaPixelId) {
    if (!w.fbq) {
      // Meta's own loader, written out: calls queue until fbevents.js arrives.
      const fbq: Queue = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      };
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = [];
      // Our page views only: Meta must not send one by itself after a client-side move (it could be a child page).
      fbq.disablePushState = true;
      fbq.allowDuplicatePageViews = true;
      w.fbq = fbq;
      w._fbq ??= fbq;
      addScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    const fbq = w.fbq;
    // No automatic events (button clicks, page data): only the events this file sends.
    fbq("set", "autoConfig", false, config.metaPixelId);
    fbq("init", config.metaPixelId);
    out.meta = (...args) => w.fbq?.(...args);
  }
  if (config.googleAdsId) {
    if (!w.gtag) {
      w.dataLayer = w.dataLayer || [];
      // The Google tag reads its commands as `arguments` objects, as in Google's own snippet.
      w.gtag = function () {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
      // Measurement only: no ad personalization, no Google Analytics storage.
      w.gtag("consent", "default", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "denied" });
      w.gtag("js", new Date());
      addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.googleAdsId)}`);
    }
    // No page_view hits: Google gets the visit (and the gclid in the address) from this call, then only conversions.
    w.gtag("config", config.googleAdsId, { send_page_view: false, allow_ad_personalization_signals: false, page_location: cleanLocation() });
    out.google = (...args) => w.gtag?.(...args);
  }
  return out;
}

const AD_COOKIE = /^(_fbp|_fbc|_gcl_|_gac_)/;

function clearAdCookies() {
  try {
    const parts = location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < parts.length - 1; i += 1) domains.push(`; Domain=${parts.slice(i).join(".")}`);
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0].trim();
      if (!AD_COOKIE.test(name)) continue;
      for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  } catch {}
}

// Report, child and test ids in the address are UUIDs.
const ID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

const AD_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid"];

function cleanLocation() {
  const all = new URLSearchParams(window.location.search);
  const kept = new URLSearchParams();
  for (const k of AD_KEYS) {
    const v = all.get(k);
    if (v) kept.set(k, v);
  }
  const query = kept.toString();
  return window.location.origin + window.location.pathname.replace(ID_SEGMENT, "/id") + (query ? `?${query}` : "");
}

function whenIdle(run: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

// One instance per page, kept on globalThis in case the bundler loads this file twice.
const holder = globalThis as typeof globalThis & { __unicaAdTags?: ReturnType<typeof createAdTags> | null };

/** The page's ad tags; null on the server. */
export function getAdTags() {
  if (typeof window === "undefined") return null;
  holder.__unicaAdTags ??= createAdTags({
    config: adConfig(),
    getConsent,
    subscribe: subscribeConsent,
    path: () => window.location.pathname,
    location: cleanLocation,
    whenIdle,
    install: installTags,
    clearCookies: clearAdCookies,
  });
  return holder.__unicaAdTags;
}
