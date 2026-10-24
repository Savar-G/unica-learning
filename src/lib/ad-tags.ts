// Meta Pixel and the Google tag (Google Ads) for the ad test (D-126, docs/ad-tracking.md). Rules:
// - Off unless their IDs are set (NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_GOOGLE_ADS_ID); each conversion label is
//   optional (NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL, _REPORT_LABEL, _CARD_LABEL).
// - Loaded only after the visitor accepts optional cookies (consent.ts), at the same moment as PostHog: after the
//   page is idle for a returning visitor, at once after a click on Accept.
// - Never on a page a child uses (adsBlockedPath). The scripts never load there; when they are loaded from an earlier
//   page of the same visit, they are paused on arrival (Meta consent revoke, Google consent denied) and get no call
//   until the visitor is back on an allowed page.
// - Meta Pixel reads the page address and the referrer itself, so it is stricter: it loads, sends a PageView and sends
//   an event only on a clean address (metaCleanAddress: a fixed marketing or parent page from an allowlist, with no
//   id, and a query that holds only utm_* or fbclid) with a clean referrer (metaCleanReferrer: none, another site's
//   bare origin, or a clean address here). Anywhere else it is paused and silent. So Meta gets PageView and Lead
//   (account_created fires on /start or /account/finish), never ReportOpen or AddPaymentInfo (their pages hold a
//   report id or a Stripe session reference). Meta's own history tracking and automatic events are off.
// - A conversion goes out with the existing track() call (track.ts is the one place call sites use) and carries no
//   personal data: no email, name, child data, grade or ids. Google gets the page address and the referrer with ids
//   replaced and only the ad tags (utm_*, gclid) kept in the query (another site's referrer: its origin only), so
//   Google gets all three conversions.
// Pure apart from getAdTags and its browser helpers: createAdTags takes its browser parts, so tests use fakes.
import { getConsent, subscribeConsent, type ConsentState } from "@/lib/consent";
import { PLANS } from "@/lib/site";

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

// The pages a child uses: the start screen the parent hands over (/account/start/<child>) and the test
// (/account/test/<child>).
const CHILD_PAGES = /^\/account\/(?:start|test)(?:\/|$)/i;
// Pages whose address can hold a sign-in or unsubscribe token, and the admin area: no ad tags there either.
const PRIVATE_PAGES = /^\/(?:admin|api|auth|sign-in|unsubscribe)(?:\/|$)/i;

/** True on a page where the ad tags never load and never send. An address that cannot be read counts as blocked. */
export function adsBlockedPath(path: string): boolean {
  let p: string;
  try { p = decodeURIComponent(path); } catch { return true; }
  p = p.replace(/\/{2,}/g, "/");
  return CHILD_PAGES.test(p) || PRIVATE_PAGES.test(p);
}

// The only pages where Meta Pixel may run: fixed marketing and parent pages whose address holds no id. A resources guide
// has a fixed slug of lowercase words.
const META_PAGES = /^\/(?:|our-story|compare|rewards|sample-report|privacy|terms|resources|resources\/[a-z0-9]+(?:-[a-z0-9]+)*|start|account|account\/finish)$/;
// fbclid is Meta's own click ID; Google's gclid is not for Meta, so an address with one is not clean.
const META_QUERY_KEY = /^(?:utm_[a-z]{1,20}|fbclid)$/;

/**
 * True when Meta Pixel may run on this address (path, query and hash, as in location): an allowlisted page, a query of
 * only utm_* or fbclid, and no hash beyond a short plain anchor. Anything else may hold an id or a token.
 */
export function metaCleanAddress(address: string): boolean {
  let url: URL;
  try { url = new URL(address, "https://unicalearning.com"); } catch { return false; }
  if (url.origin !== "https://unicalearning.com") return false;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (!META_PAGES.test(path)) return false;
  for (const key of url.searchParams.keys()) if (!META_QUERY_KEY.test(key)) return false;
  return url.hash === "" || /^#[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(url.hash);
}

/**
 * True when the page's referrer (document.referrer, which Meta sends) holds no id or token: none, another site's bare
 * origin (browsers send only that by default), or a clean address on this site. Pages whose address can hold an id
 * send only the origin as the referrer (Referrer-Policy in next.config.ts); this check covers what that misses.
 */
export function metaCleanReferrer(referrer: string, origin: string): boolean {
  if (!referrer) return true;
  let url: URL;
  try { url = new URL(referrer); } catch { return false; }
  if (url.origin !== origin) return url.pathname === "/" && !url.search && !url.hash;
  return metaCleanAddress(url.pathname + url.search + url.hash);
}

/** The value of a saved card: the first charge, the monthly price after the free first month (2026-10-24). */
export const CARD_VALUE = PLANS.one.price;

type Call = (...args: unknown[]) => void;
type Tag = "meta" | "google";

export interface AdDeps {
  config: AdConfig;
  getConsent: () => ConsentState;
  subscribe: (onChange: () => void) => () => void;
  /** The current page's address: path, query and hash. */
  address: () => string;
  /** The current page's address with ids replaced and only its ad tags kept in the query, for Google's page_location. */
  location: () => string;
  /** The page's referrer, as the browser gives it (document.referrer). */
  referrer: () => string;
  /** The current page's origin. */
  origin: () => string;
  /** The referrer cleaned like `location` (another site: its origin only), for Google's page_referrer. */
  referrerLocation: () => string;
  whenIdle: (run: () => void) => void;
  /** Adds one tag's script (once) and returns its call function. */
  install: (config: AdConfig, tag: Tag) => Call;
  /** Deletes the tags' cookies after the visitor turns optional cookies off. */
  clearCookies: () => void;
}

export function createAdTags(deps: AdDeps) {
  const { config } = deps;
  const tags: Record<Tag, { on: boolean; send: Call | null; paused: boolean }> = {
    meta: { on: Boolean(config.metaPixelId), send: null, paused: false },
    google: { on: Boolean(config.googleAdsId), send: null, paused: false },
  };
  let ready = false;
  let started = false;
  let lastViewed: string | null = null;
  let lastConsent: ConsentState = "unset";

  function pause(tag: Tag) {
    const t = tags[tag];
    if (!t.send || t.paused) return;
    t.paused = true;
    if (tag === "meta") t.send("consent", "revoke");
    else t.send("consent", "update", { ad_storage: "denied", ad_user_data: "denied" });
  }

  function resume(tag: Tag) {
    const t = tags[tag];
    if (!t.send || !t.paused) return;
    t.paused = false;
    if (tag === "meta") t.send("consent", "grant");
    else t.send("consent", "update", { ad_storage: "granted", ad_user_data: "granted" });
  }

  /** May this tag run on this address (consent aside)? */
  function allowedHere(tag: Tag, address: string): boolean {
    const path = address.split(/[?#]/)[0];
    if (adsBlockedPath(path)) return false;
    return tag === "google" || (metaCleanAddress(address) && metaCleanReferrer(deps.referrer(), deps.origin()));
  }

  /**
   * Brings each tag in line with the consent and the address. Returns the call functions of the tags that may send
   * now. `now`: load without waiting for the page to be idle (a conversion, or the visitor just accepted).
   */
  function sync(now = false): Partial<Record<Tag, Call>> {
    const live: Partial<Record<Tag, Call>> = {};
    if (!tags.meta.on && !tags.google.on) return live;
    const consent = deps.getConsent();
    const wasGranted = lastConsent === "granted";
    lastConsent = consent;
    const address = deps.address();
    for (const tag of ["google", "meta"] as const) {
      const t = tags[tag];
      if (!t.on) continue;
      if (consent !== "granted" || !allowedHere(tag, address)) {
        pause(tag);
        continue;
      }
      if (!t.send) {
        if (!ready && !now) continue;
        t.send = deps.install(config, tag);
      }
      resume(tag);
      live[tag] = t.send;
    }
    if (consent !== "granted" && wasGranted) deps.clearCookies();
    const path = address.split(/[?#]/)[0];
    if (!live.meta) lastViewed = null;
    // Meta's history tracking is off, so this is the only page view: one per clean page.
    else if (lastViewed !== path) {
      lastViewed = path;
      live.meta("track", "PageView");
    }
    return live;
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

  /** A funnel event from track(). Only three map to a conversion; the rest send nothing. No props travel. */
  function conversion(event: string) {
    if (event !== "account_created" && event !== "report_open" && event !== "card_saved") return;
    const live = sync(true);
    const google = (label: string | null, extra: Record<string, unknown> = {}) => {
      if (live.google && label) live.google("event", "conversion", { send_to: `${config.googleAdsId}/${label}`, page_location: deps.location(), page_referrer: deps.referrerLocation(), ...extra });
    };
    if (event === "account_created") {
      live.meta?.("track", "Lead");
      google(config.googleLabels.lead);
    } else if (event === "report_open") {
      live.meta?.("trackCustom", "ReportOpen");
      google(config.googleLabels.report);
    } else {
      live.meta?.("track", "AddPaymentInfo", { value: CARD_VALUE, currency: "CAD" });
      google(config.googleLabels.card, { value: CARD_VALUE, currency: "CAD" });
    }
  }

  return { begin, page, conversion };
}

// Browser parts.

type Queue = Call & { queue?: unknown[]; callMethod?: Call; push?: Call; loaded?: boolean; version?: string; disablePushState?: boolean; allowDuplicatePageViews?: boolean };
type AdWindow = Window & { fbq?: Queue; _fbq?: Queue; dataLayer?: unknown[]; gtag?: Call };

function addScript(src: string, onload?: () => void) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  if (onload) s.addEventListener("load", onload);
  document.head.appendChild(s);
}

const currentAddress = () => window.location.pathname + window.location.search + window.location.hash;
const metaCleanHere = () => metaCleanAddress(currentAddress()) && metaCleanReferrer(document.referrer, window.location.origin);

function installMeta(id: string): Call {
  const w = window as AdWindow;
  // Our calls wait here until fbevents.js runs, and go out then only if the address is still clean: Meta reads the
  // address when it sends, and the visitor may have moved on to a page with an id meanwhile.
  let pending: unknown[][] | null = [];
  const flush = () => {
    const calls = pending ?? [];
    pending = null;
    const clean = metaCleanHere();
    for (const args of calls) if (clean || args[0] === "consent") w.fbq?.(...args);
  };
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
    // Our page views only: Meta must not send one by itself after a client-side move.
    fbq.disablePushState = true;
    fbq.allowDuplicatePageViews = true;
    w.fbq = fbq;
    w._fbq ??= fbq;
    // No automatic events (button clicks, page data): only the events this file sends.
    fbq("set", "autoConfig", false, id);
    fbq("init", id);
    addScript("https://connect.facebook.net/en_US/fbevents.js", flush);
  } else pending = null;
  // Consent commands (pause and resume) send nothing to Meta, so they pass on any address.
  return (...args) => {
    if (pending) pending.push(args);
    else if (args[0] === "consent" || metaCleanHere()) w.fbq?.(...args);
  };
}

function installGoogle(id: string): Call {
  const w = window as AdWindow;
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
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
    // No page_view hits: Google gets the visit (and the gclid in the address) from this call, then only conversions.
    w.gtag("config", id, { send_page_view: false, allow_ad_personalization_signals: false, page_location: cleanLocation(), page_referrer: cleanReferrer() });
  }
  return (...args) => w.gtag?.(...args);
}

function installTag(config: AdConfig, tag: Tag): Call {
  return tag === "meta" ? installMeta(config.metaPixelId!) : installGoogle(config.googleAdsId!);
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

/** An address of this site with ids replaced and only its ad tags kept in the query; another site's origin only. */
function cleanUrl(href: string): string {
  let url: URL;
  try { url = new URL(href); } catch { return ""; }
  if (url.origin !== window.location.origin) return `${url.origin}/`;
  const kept = new URLSearchParams();
  for (const k of AD_KEYS) {
    const v = url.searchParams.get(k);
    if (v) kept.set(k, v);
  }
  const query = kept.toString();
  return url.origin + url.pathname.replace(ID_SEGMENT, "/id") + (query ? `?${query}` : "");
}

const cleanLocation = () => cleanUrl(window.location.href);
const cleanReferrer = () => (document.referrer ? cleanUrl(document.referrer) : "");

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
    address: currentAddress,
    referrer: () => document.referrer,
    origin: () => window.location.origin,
    referrerLocation: cleanReferrer,
    location: cleanLocation,
    whenIdle,
    install: installTag,
    clearCookies: clearAdCookies,
  });
  return holder.__unicaAdTags;
}
