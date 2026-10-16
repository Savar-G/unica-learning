// The channel that brought a parent: the page's referrer and UTM tags, kept in parents.source at signup. The tags are
// also kept for the browser tab, because a parent who signs up with Google leaves /start and comes back on
// /account/finish without them (the door-to-door flyer test needs them, docs/flyer-tracking.md). Pure: the browser
// parts (the query string, the referrer, the kept value) are passed in.

export const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"] as const;
/** sessionStorage key of the tags kept for the tab. */
export const SOURCE_STORAGE_KEY = "unica:source";

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

/** What a signup sends as its source: the referrer, and this page's tags, or else the ones kept for the tab. */
export function visitSource({ search, referrer, stored }: { search: string; referrer: string; stored: string | null }): Record<string, string> {
  const here = sourceTags(search);
  const tags = Object.keys(here).length ? here : storedTags(stored);
  return { ...(referrer ? { referrer } : {}), ...tags };
}

/** The signup link for a visit: /start, with the visit's tags carried along so a signup keeps its channel. */
export function startHref(search: URLSearchParams | string): string {
  const query = new URLSearchParams(sourceTags(new URLSearchParams(search).toString())).toString(); // not .size: older iPhones lack it
  return query ? `/start?${query}` : "/start";
}
