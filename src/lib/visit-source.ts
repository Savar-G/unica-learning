// The channel that brought a parent: the page's referrer, UTM tags and ad click IDs, kept in parents.source at signup.
// The tags of the first tagged page in a browser tab are kept for the tab (first touch wins), on whichever page the
// visitor lands, so a visitor who browses to another page first, or who signs up with Google (and comes back on
// /account/finish), still keeps them (the flyer test, docs/flyer-tracking.md; the ad test, docs/ad-tracking.md). A visit
// from an ad also gets a random visit ID, counted once by /api/visit and saved with the signup (`visit_id`). Pure: the
// browser parts (the query string, the referrer, the tab's storage, the ID maker, the sender) are passed in.

export const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref", "gclid", "fbclid"] as const;
/** sessionStorage key of the tags kept for the tab. */
export const SOURCE_STORAGE_KEY = "unica:source";
/** sessionStorage key of the tab's ad visit ID (one per tab, made when an ad visit lands). */
export const VISIT_STORAGE_KEY = "unica:visit";
/** Flyer scans are counted by /f/<code> already (docs/flyer-tracking.md), so a flyer visit is not an ad visit. */
const FLYER_SOURCE = "flyer";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The tags in a query string; empty when it has none. */
export function sourceTags(search: string): Record<string, string> {
  const qs = new URLSearchParams(search);
  const tags: Record<string, string> = {};
  for (const k of SOURCE_KEYS) {
    const v = qs.get(k);
    if (v) tags[k] = v;
  }
  return tags;
}

/** The tags kept for the tab, read back; empty when there are none or the value is not ours. */
export function storedTags(raw: string | null): Record<string, string> {
  if (!raw) return {};
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const tags: Record<string, string> = {};
  for (const k of SOURCE_KEYS) {
    const t = (v as Record<string, unknown>)[k];
    if (typeof t === "string" && t) tags[k] = t;
  }
  return tags;
}

/**
 * What a signup sends as its source: the referrer, and this page's tags, or else the ones kept for the tab, and the
 * tab's ad visit ID (`visit_id`) when it has one, so the visit counted in ad_visits joins to the family.
 */
export function visitSource({ search, referrer, stored, visitId = null }: { search: string; referrer: string; stored: string | null; visitId?: string | null }): Record<string, string> {
  const here = sourceTags(search);
  const tags = Object.keys(here).length ? here : storedTags(stored);
  return { ...(referrer ? { referrer } : {}), ...tags, ...(visitId && UUID.test(visitId) ? { visit_id: visitId.toLowerCase() } : {}) };
}

/** True when tags show a visit from an ad or a tagged link: a utm_source other than a flyer, or an ad click ID. */
export function isAdVisit(tags: Record<string, string>): boolean {
  const source = tags.utm_source?.trim().toLowerCase();
  return Boolean((source && source !== FLYER_SOURCE) || tags.gclid || tags.fbclid);
}

/** What the browser posts to /api/visit: the visit ID and the UTM tags, and only whether a click ID was there. */
export interface AdVisitPost {
  visitId: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  has_gclid: boolean;
  has_fbclid: boolean;
}

/** The tab's sessionStorage, or a stand-in. A call may throw (storage blocked). */
export interface TabStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Runs on every page: keeps the first tagged page's tags for the tab (first touch wins). When those tags show an ad
 * visit, it makes one visit ID for the tab and sends it once (`send`, a post to /api/visit). Nothing is sent when the
 * tab cannot keep the ID, so a blocked storage never counts one visit on every page.
 */
export function keepVisit({ search, store, newId, send }: { search: string; store: TabStore; newId: () => string | null; send: (visit: AdVisitPost) => void }): void {
  const here = sourceTags(search);
  if (!Object.keys(here).length) return;
  try {
    if (Object.keys(storedTags(store.getItem(SOURCE_STORAGE_KEY))).length) return;
    store.setItem(SOURCE_STORAGE_KEY, JSON.stringify(here));
  } catch {
    return; // storage off: the tags stay on this page only
  }
  if (!isAdVisit(here)) return;
  let visitId: string | null;
  try {
    if (store.getItem(VISIT_STORAGE_KEY)) return;
    visitId = newId();
    if (!visitId || !UUID.test(visitId)) return;
    store.setItem(VISIT_STORAGE_KEY, visitId);
    if (store.getItem(VISIT_STORAGE_KEY) !== visitId) return;
  } catch {
    return;
  }
  const utm = Object.fromEntries((["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const).flatMap((k) => (here[k] ? [[k, here[k]]] : [])));
  send({ visitId, ...utm, has_gclid: Boolean(here.gclid), has_fbclid: Boolean(here.fbclid) });
}

/** The signup link for a visit: /start, with the visit's tags carried along so a signup keeps its channel. */
export function startHref(search: URLSearchParams | string): string {
  const query = new URLSearchParams(sourceTags(new URLSearchParams(search).toString())).toString(); // not .size: older iPhones lack it
  return query ? `/start?${query}` : "/start";
}
