// PostHog's side of the admin Traffic tab (docs/web-analytics.md): visitors who accepted analytics, read with HogQL
// through PostHog's query API and a read-only personal API key (`POSTHOG_PERSONAL_API_KEY`; `POSTHOG_PROJECT_ID`, default
// the Unica Learning project; `POSTHOG_HOST`, default the US cloud). PostHog counts only consenting visitors, so these
// numbers sit beside the cookieless counter (src/lib/site-hits.ts) and never replace it. Pure but for the injected
// `fetch`: the queries and the parsing of the answers are tested without a network. The admin area never sends events
// to PostHog (src/lib/analytics.ts), so nothing here counts the team's own pages.
import { addDays, localDateTime, localDay, PACIFIC_ZONE } from "@/lib/family-time";

export const POSTHOG_DEFAULT_PROJECT = "650128";
export const POSTHOG_DEFAULT_HOST = "https://us.posthog.com";
const TIMEOUT_MS = 12_000;

export interface PosthogConfig { key: string; projectId: string; host: string }

/** The settings from the environment, or null when no key is set (the tab then says PostHog is not connected). */
export function posthogConfig(env: Record<string, string | undefined> = process.env): PosthogConfig | null {
  const key = env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!key) return null;
  const projectId = env.POSTHOG_PROJECT_ID?.trim() || POSTHOG_DEFAULT_PROJECT;
  const host = (env.POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST).replace(/\/+$/, "");
  if (!/^\d{1,12}$/.test(projectId) || !/^https:\/\/[a-z0-9.-]+$/i.test(host)) return null;
  return { key, projectId, host };
}

export interface WindowCount { visitors: number; views: number }
export interface PosthogWindows { today: WindowCount; d7: WindowCount; d30: WindowCount; all: WindowCount }
export interface CountRow { label: string; visitors: number; views?: number }
export interface DailyRow { day: string; visitors: number; views: number }

export interface PosthogTraffic {
  windows: PosthogWindows | null;
  daily: DailyRow[] | null;
  pages: CountRow[] | null;
  referrers: CountRow[] | null;
  campaigns: CountRow[] | null;
  devices: CountRow[] | null;
  browsers: CountRow[] | null;
  countries: CountRow[] | null;
  /** One line per query that failed, for the tab to show. The other sections still show. */
  errors: string[];
}

export type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const epoch = (ms: number) => Math.floor(ms / 1000);

/** The start of a Pacific day as epoch seconds; a day is `YYYY-MM-DD`. */
const dayStart = (day: string) => epoch(localDateTime(day, PACIFIC_ZONE));

/** The queries for the tab, keyed by name. `days`: the range of the breakdowns (null: all time). Only numbers we make go into the text. */
export function trafficQueries(now: number, days: number | null): Record<string, string> {
  const today = localDay(now, PACIFIC_ZONE);
  const t0 = dayStart(today);
  const t7 = dayStart(addDays(today, -6));
  const t30 = dayStart(addDays(today, -29));
  const from = days === null ? null : dayStart(addDays(today, -(days - 1)));
  const range = from === null ? "" : ` AND timestamp >= fromUnixTimestamp(${from})`;
  const base = `FROM events WHERE event = '$pageview'`;
  const since = (t: number) => `timestamp >= fromUnixTimestamp(${t})`;
  const top = (expr: string, empty: string, extra = "") =>
    `SELECT coalesce(nullIf(toString(${expr}), ''), '${empty}') AS k, uniq(person_id) AS n, count() AS views ${base}${range}${extra} GROUP BY k ORDER BY n DESC, views DESC LIMIT 10`;
  return {
    windows:
      `SELECT uniqIf(person_id, ${since(t0)}), countIf(${since(t0)}), uniqIf(person_id, ${since(t7)}), countIf(${since(t7)}), ` +
      `uniqIf(person_id, ${since(t30)}), countIf(${since(t30)}), uniq(person_id), count() ${base}`,
    daily:
      `SELECT toString(toDate(toTimeZone(timestamp, '${PACIFIC_ZONE}'))) AS day, uniq(person_id), count() ${base}${range} GROUP BY day ORDER BY day`,
    pages: top("properties.$pathname", "(unknown)"),
    referrers: top("properties.$referring_domain", "$direct"),
    campaigns:
      // HogQL reads NULL != '' as true, so a missing tag is tested with IS NOT NULL.
      `SELECT concat(toString(properties.utm_source), if(coalesce(toString(properties.utm_campaign), '') = '', '', concat(' / ', toString(properties.utm_campaign)))) AS k, uniq(person_id) AS n, count() AS views ` +
      `${base}${range} AND nullIf(toString(properties.utm_source), '') IS NOT NULL GROUP BY k ORDER BY n DESC, views DESC LIMIT 10`,
    devices: top("properties.$device_type", "Unknown"),
    browsers: top("properties.$browser", "Unknown"),
    countries: top("properties.$geoip_country_code", "Unknown"),
  };
}

const rows = (answer: unknown): unknown[][] => {
  const r = (answer as { results?: unknown })?.results;
  return Array.isArray(r) ? r.filter(Array.isArray) as unknown[][] : [];
};

export function parseWindows(answer: unknown): PosthogWindows | null {
  const r = rows(answer)[0];
  if (!r || r.length < 8) return null;
  return {
    today: { visitors: num(r[0]), views: num(r[1]) },
    d7: { visitors: num(r[2]), views: num(r[3]) },
    d30: { visitors: num(r[4]), views: num(r[5]) },
    all: { visitors: num(r[6]), views: num(r[7]) },
  };
}

export function parseDaily(answer: unknown): DailyRow[] {
  return rows(answer).map((r) => ({ day: String(r[0]), visitors: num(r[1]), views: num(r[2]) }));
}

/** The words for PostHog's own placeholders. */
const LABEL: Record<string, string> = { $direct: "Direct", "(unknown)": "Unknown" };
export function parseCounts(answer: unknown): CountRow[] {
  return rows(answer).map((r) => ({ label: LABEL[String(r[0])] ?? String(r[0]), visitors: num(r[1]), views: num(r[2]) }));
}

/** Runs every query at once. A failing query leaves its section null and adds one line to `errors`. */
export async function loadPosthogTraffic(config: PosthogConfig, now: number, days: number | null, doFetch: FetchLike = fetch as unknown as FetchLike): Promise<PosthogTraffic> {
  const queries = trafficQueries(now, days);
  const errors: string[] = [];
  const run = async (name: string): Promise<unknown | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(`${config.host}/api/projects/${config.projectId}/query/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ name: `admin-traffic-${name}`, query: { kind: "HogQLQuery", query: queries[name] } }),
        signal: controller.signal,
      });
      if (!res.ok) {
        errors.push(`${name}: PostHog answered ${res.status}${res.status === 401 || res.status === 403 ? " (check the API key and its read scope)" : ""}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error && e.name === "AbortError" ? "PostHog did not answer in time" : "PostHog could not be reached"}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const [windows, daily, pages, referrers, campaigns, devices, browsers, countries] = await Promise.all(
    ["windows", "daily", "pages", "referrers", "campaigns", "devices", "browsers", "countries"].map(run),
  );
  return {
    windows: windows === null ? null : parseWindows(windows),
    daily: daily === null ? null : parseDaily(daily),
    pages: pages === null ? null : parseCounts(pages),
    referrers: referrers === null ? null : parseCounts(referrers),
    campaigns: campaigns === null ? null : parseCounts(campaigns),
    devices: devices === null ? null : parseCounts(devices),
    browsers: browsers === null ? null : parseCounts(browsers),
    countries: countries === null ? null : parseCounts(countries),
    errors,
  };
}
