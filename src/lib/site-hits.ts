// The site traffic counter (docs/web-analytics.md): every page view of a public page is posted once to /api/hit and
// stored as one row in public.site_hits, with no cookie and no consent, so the admin Traffic tab counts every visit and
// not only visitors who accepted analytics. A "visit" is one browser tab: a random id in sessionStorage until the tab
// closes. A row keeps the path, the referrer's host, the UTM tags (first page of the visit only), a coarse device class,
// a browser family and the country and region from the host's geo headers. Never an IP, a user agent, a cookie, a full
// referrer address or a query string. Pure: the browser parts (storage, id maker, sender) are passed in.
import { mayCarryQrToken } from "@/lib/url-tokens";
import type { TabStore } from "@/lib/visit-source";

/** sessionStorage key of the tab's visit id for the traffic counter. Not the ad visit id (VISIT_STORAGE_KEY). */
export const HIT_STORAGE_KEY = "unica:hit";
/** sessionStorage key of the last page sent (path and time), to count a page opened twice at once only once. */
export const HIT_LAST_KEY = "unica:hit:last";
const DUPLICATE_MS = 1500;
/** Page views /api/hit stores in 10 minutes before it stops counting. */
export const HIT_RATE_MAX = 3000;
export const PATH_MAX = 200;
const TAG_MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

// Private or technical areas: never counted. The product's signed-in pages, the team's pages, the child's desk and
// test, API and auth routes, QR pages and flyer redirects hold no public traffic.
const NOT_COUNTED = /^\/(?:admin|tutor|account|api|auth|sign-in|family-deleted|unsubscribe|f)(?:\/|$)/i;

/** True for a public page whose view is counted. Query strings and hashes are not part of the path. */
export function countablePath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > PATH_MAX || CONTROL.test(path)) return false;
  if (/[?#]/.test(path) || NOT_COUNTED.test(path) || mayCarryQrToken(path)) return false;
  return true;
}

export type DeviceClass = "mobile" | "tablet" | "desktop";

/** A coarse device class from the user agent. The user agent itself is never stored. */
export function deviceOf(userAgent: string | null): DeviceClass {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/** A browser family from the user agent; in-app browsers of ad platforms are named, because ads open in them. */
export function browserOf(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/Instagram/i.test(ua)) return "Instagram app";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook app";
  if (/EdgA?\/|Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/i.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

/** The host of a referrer, never its path or query; null for no referrer, this site itself or something that is not a web address. */
export function referrerHost(referrer: string | null | undefined, ownHost: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const own = (ownHost ?? "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
    if (!host || host.length > TAG_MAX || host === own) return null;
    return host;
  } catch {
    return null;
  }
}

/** What the browser posts to /api/hit. `ref` and the tags are sent with the first page of a visit only. */
export interface SiteHitPost {
  visitId: string;
  path: string;
  landing: boolean;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

const tag = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, TAG_MAX).trim();
  return t && !CONTROL.test(t) ? t : null;
};

/**
 * Sends one page view. Makes the tab's visit id on the first page (that page is the landing). Nothing is sent when
 * the path is not counted or the tab cannot keep the id, so a blocked storage never counts a visit on every page.
 */
export function trackHit({ pathname, search, referrer, ownHost, store, newId, send, now = Date.now }: {
  pathname: string; search: string; referrer: string; ownHost: string; store: TabStore; newId: () => string | null; send: (hit: SiteHitPost) => void; now?: () => number;
}): void {
  if (!countablePath(pathname)) return;
  let visitId: string | null;
  let landing = false;
  try {
    // The same page twice within a moment is one view: a double run of the page's effect (React's development checks,
    // a redirect that lands twice) must not count twice.
    const last = store.getItem(HIT_LAST_KEY);
    const at = now();
    if (last) {
      const [lastPath, lastAt] = [last.slice(0, last.lastIndexOf("|")), Number(last.slice(last.lastIndexOf("|") + 1))];
      if (lastPath === pathname && at - lastAt >= 0 && at - lastAt < DUPLICATE_MS) return;
    }
    store.setItem(HIT_LAST_KEY, `${pathname}|${at}`);
    visitId = store.getItem(HIT_STORAGE_KEY);
    if (!visitId || !UUID.test(visitId)) {
      visitId = newId();
      if (!visitId || !UUID.test(visitId)) return;
      store.setItem(HIT_STORAGE_KEY, visitId);
      if (store.getItem(HIT_STORAGE_KEY) !== visitId) return;
      landing = true;
    }
  } catch {
    return;
  }
  const post: SiteHitPost = { visitId, path: pathname, landing };
  if (landing) {
    const ref = referrerHost(referrer, ownHost);
    if (ref) post.ref = ref;
    const qs = new URLSearchParams(search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
      const v = tag(qs.get(k));
      if (v) post[k] = v;
    }
  }
  send(post);
}

export interface SiteHitRow {
  visit_id: string;
  path: string;
  is_landing: boolean;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  region: string | null;
  device: DeviceClass;
  browser: string;
}

/** The row to store for a posted page view, or null when the post is not a countable page with a valid visit id. */
export function siteHitRow(body: unknown, headers: { userAgent: string | null; country: string | null; region: string | null }): SiteHitRow | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.visitId !== "string" || !UUID.test(b.visitId) || !countablePath(b.path)) return null;
  const landing = b.landing === true;
  const country = headers.country && /^[A-Z]{2}$/.test(headers.country) ? headers.country : null;
  const region = headers.region && /^[A-Z0-9]{1,3}$/.test(headers.region) ? headers.region : null;
  const ref = landing && typeof b.ref === "string" ? referrerHost(`https://${b.ref}/`, null) : null;
  return {
    visit_id: b.visitId.toLowerCase(),
    path: b.path,
    is_landing: landing,
    referrer_host: ref,
    utm_source: landing ? tag(b.utm_source) : null,
    utm_medium: landing ? tag(b.utm_medium) : null,
    utm_campaign: landing ? tag(b.utm_campaign) : null,
    country,
    region: country ? region : null,
    device: deviceOf(headers.userAgent),
    browser: browserOf(headers.userAgent),
  };
}
