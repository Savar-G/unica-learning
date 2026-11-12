// The admin Traffic tab's numbers in plain data (docs/web-analytics.md): the range the tab shows, and the reading of the
// database function `admin_site_traffic` (the cookieless counter, src/lib/site-hits.ts). Pure: no network, database or
// clock. The function answers jsonb; every field is read defensively, so a changed function never crashes the page.

export interface TrafficRange { key: "today" | "7d" | "30d" | "all"; label: string; days: number | null }
export const TRAFFIC_RANGES: readonly TrafficRange[] = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Past 7 days", days: 7 },
  { key: "30d", label: "Past 30 days", days: 30 },
  { key: "all", label: "All time", days: null },
];
/** The range from `?range=`; anything else is the past 7 days. */
export function trafficRange(raw: unknown): TrafficRange {
  return TRAFFIC_RANGES.find((r) => r.key === raw) ?? TRAFFIC_RANGES[1];
}

/** Arguments for `admin_site_traffic`. All time sends `p_days: null`; omitting it would use the function's 7-day default. */
export function trafficCall(range: TrafficRange, withTests: boolean): { p_days: number | null; p_with_tests: boolean } {
  return { p_days: range.days, p_with_tests: withTests };
}

export interface HitWindow { visits: number; views: number }
export interface HitRow { label: string; visits: number; views?: number }
export interface HitCampaign { source: string; medium: string | null; campaign: string | null; visits: number; signups: number }
export interface HitDay { day: string; visits: number; views: number }
export interface SiteTraffic {
  windows: Record<"today" | "d7" | "d30" | "all", HitWindow>;
  daily: HitDay[];
  pages: HitRow[];
  landingPages: HitRow[];
  referrers: HitRow[];
  campaigns: HitCampaign[];
  devices: HitRow[];
  browsers: HitRow[];
  countries: HitRow[];
  regions: HitRow[];
  funnel: { visits: number; startOpen: number; accounts: number; started: number; finished: number };
  firstHit: string | null;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const win = (v: unknown): HitWindow => ({ visits: num(rec(v).visits), views: num(rec(v).views) });
const labelled = (v: unknown): HitRow[] => arr(v).map((r) => ({ label: text(r.label) ?? "Unknown", visits: num(r.visits), ...(r.views === undefined ? {} : { views: num(r.views) }) }));

export function parseSiteTraffic(json: unknown): SiteTraffic {
  const j = rec(json);
  const w = rec(j.windows);
  const f = rec(j.funnel);
  return {
    windows: { today: win(w.today), d7: win(w.d7), d30: win(w.d30), all: win(w.all) },
    daily: arr(j.daily).map((d) => ({ day: String(d.day ?? ""), visits: num(d.visits), views: num(d.views) })),
    pages: labelled(j.pages),
    landingPages: labelled(j.landing_pages),
    referrers: labelled(j.referrers),
    campaigns: arr(j.campaigns).map((c) => ({ source: text(c.source) ?? "?", medium: text(c.medium), campaign: text(c.campaign), visits: num(c.visits), signups: num(c.signups) })),
    devices: labelled(j.devices),
    browsers: labelled(j.browsers),
    countries: labelled(j.countries),
    regions: labelled(j.regions),
    funnel: { visits: num(f.visits), startOpen: num(f.start_open), accounts: num(f.accounts), started: num(f.started), finished: num(f.finished) },
    firstHit: text(j.first_hit),
  };
}

/** The share of `part` in `whole` as a whole percent, or null when there is no whole. */
export const sharePercent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);

const counted = (v: number) => v.toLocaleString("en-CA");

/**
 * The line under Accepted analytics. The cookieless counter is new, so a share against PostHog's longer history
 * is withheld until 30 whole days have counted. `counterDays` is whole days since the first counted visit, or null.
 */
export function consentGapNote(counterDays: number | null, accepted: number, visits: number): string {
  if (counterDays === null || !Number.isFinite(counterDays) || counterDays < 30) {
    const began = counterDays === null || !Number.isFinite(counterDays) || counterDays < 1
      ? "today"
      : `${counterDays} day${counterDays === 1 ? "" : "s"} ago`;
    return `The visit counter began ${began}, so the two counts cannot be compared yet. The share of visitors who accepted analytics shows here once 30 days have counted.`;
  }
  const share = sharePercent(accepted, visits);
  return share === null
    ? "No visits in the past 30 days to compare."
    : `In the past 30 days, ${counted(accepted)} visitors accepted analytics against ${counted(visits)} visits (${share}%). The gap is people who rejected the banner, plus people who came in more than one tab.`;
}

const COUNTRY = new Intl.DisplayNames("en", { type: "region" });
/** "CA" as "Canada"; anything that is not a country code stays as it is. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try { return COUNTRY.of(code) ?? code; } catch { return code; }
}

const PROVINCES: Record<string, string> = { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" };
export const provinceName = (code: string): string => PROVINCES[code] ?? code;

const DEVICE: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Computer", Mobile: "Phone", Tablet: "Tablet", Desktop: "Computer" };
export const deviceName = (label: string): string => DEVICE[label] ?? label;
