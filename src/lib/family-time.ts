import type { Province, StartState } from "@/lib/assessment";
import { normalizeTimeZone } from "@/lib/supported-time-zones";
export { normalizeTimeZone } from "@/lib/supported-time-zones";

import { PACIFIC_ZONE, PROVINCE_ZONES, postalZone, type FamilyZone } from "@/lib/canada-postal-zones";
export { PACIFIC_ZONE, zoneFor, type FamilyZone } from "@/lib/canada-postal-zones";

/** Whether the shared allow-list accepts a stored browser zone. */
export function validTimeZone(tz: unknown): tz is string {
  return normalizeTimeZone(tz) !== null;
}

export interface FamilyLocation {
  timeZone?: string | null;
  postal?: string | null;
  province?: string | null;
}

/** The oldest child defines the family's province fallback, including children with no calls or tests. */
export function familyProvince(children: readonly { id: string; created_at?: string; province?: string | null }[]): string | null {
  return [...children].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id))[0]?.province ?? null;
}

/** One family rule: valid browser zone, postal mapping, child's province, then Pacific. */
export function familyZone({ timeZone, postal, province }: FamilyLocation): FamilyZone {
  const canonical = normalizeTimeZone(timeZone);
  if (canonical) return canonical;
  return postalZone(postal) ?? (province ? PROVINCE_ZONES[province] : undefined) ?? PACIFIC_ZONE;
}

/** Only for older report inputs that have a curriculum province but no family fields. */
export const zoneForProvince = (province: Province): FamilyZone => familyZone({ province });

// Keep named zones before each cutoff, preserving historical offsets.
// Etc/GMT signs are reversed: Etc/GMT+7 means UTC-7.
const OVERRIDES = [
  // https://www.iana.org/time-zones/releases/2026b
  // https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/daylight-saving-time
  { zones: [PACIFIC_ZONE], from: Date.parse("2026-03-08T10:00:00Z"), zone: "Etc/GMT+7", expected: "2026b" },
  // https://www.iana.org/time-zones/releases/2026c
  // East Kootenay and Golden also adopted permanent UTC-6:
  // https://engage.rdek.bc.ca/timechange
  // https://www.golden.ca/town-hall/news-notices/no-time-change-weekend-golden
  { zones: ["America/Edmonton"], from: Date.parse("2026-11-01T08:00:00Z"), zone: "Etc/GMT+6", expected: "2026c" },
  // Regulation effective 2026-08-21; the first changed clock reading is 2026-11-01.
  // https://www.gov.nt.ca/en/newsroom/northwest-territories-ends-seasonal-time-change
  { zones: ["America/Yellowknife", "America/Inuvik"], from: Date.parse("2026-11-01T08:00:00Z"), zone: "Etc/GMT+6", expected: "NWT regulation (2026-08-21)" },
  // https://news.gov.mb.ca/news/print,index.html?item=75940&posted=2026-10-31
  // https://www.ontario.ca/laws/regulation/r26333
  { zones: ["America/Winnipeg"], from: Date.parse("2026-11-01T07:00:00Z"), zone: "Etc/GMT+5", expected: "Manitoba / Ontario regulations (2026-11-01)" },
] as const;

/** Applies the confirmed rule even when the runtime still has older tz data. */
export function effectiveZone(at: number, zone: FamilyZone): string {
  if (typeof zone !== "string") return normalizeTimeZone(zone.zone) ?? effectiveZone(at, PACIFIC_ZONE);
  const canonical = normalizeTimeZone(zone) ?? PACIFIC_ZONE;
  return OVERRIDES.find((rule) => at >= rule.from && rule.zones.some((name) => name === canonical))?.zone ?? canonical;
}

type FormatOptions = Omit<Intl.DateTimeFormatOptions, "timeZone">;
type Instant = number | string | Date;
const instant = (at: Instant) => typeof at === "number" ? at : new Date(at).getTime();
const formatter = (at: number, zone: FamilyZone, options: FormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { ...options, timeZone: effectiveZone(at, zone) });

/** All instant formatting uses the same rule layer, on both server and browser. */
export function formatInZone(at: Instant, zone: FamilyZone, options: FormatOptions): string {
  const ms = instant(at);
  return formatter(ms, zone, options).format(ms);
}

export function partsInZone(at: Instant, zone: FamilyZone, options: FormatOptions): Record<string, string> {
  const ms = instant(at);
  return Object.fromEntries(formatter(ms, zone, options).formatToParts(ms).map((p) => [p.type, p.value]));
}

/** YYYY-MM-DD for grouping events by the same local day that the display uses. */
export const localDay = (at: Instant, zone: FamilyZone): string =>
  formatInZone(at, zone, { year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar dates have no instant or zone. Keep article dates and chart labels on that date. */
export const formatCalendarDate = (day: string, options: FormatOptions): string =>
  formatInZone(`${day}T12:00:00Z`, "UTC", options);

/** Calendar date arithmetic, independent of elapsed hours and seasonal clock changes. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStartFor(day: string): string {
  return addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}

/** An instant at a local calendar date and hour, using the dated override at the resulting instant. */
export function localDateTime(day: string, zone: FamilyZone, hour = 0, minute = 0, second = 0): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("Hour must be between 0 and 23");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(second) || second < 0 || second > 59) throw new RangeError("Invalid minute or second");
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCHours(hour, minute, second);
  const wall = date.getTime();
  const represented = (at: number) => {
    const f = partsInZone(at, zone, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    return Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour, +f.minute, +f.second);
  };
  // Include both offsets around a transition. Exact matches choose the earlier occurrence on fall back.
  const candidates = [...new Set([-2, 0, 2].map((days) => {
    const at = wall + days * 86_400_000;
    return wall - (represented(at) - at);
  }))].sort((a, b) => a - b);
  const exact = candidates.find((at) => represented(at) === wall);
  if (exact !== undefined) return exact;
  // The requested wall time lies in a forward gap. Find the transition itself, not the same minute after the gap.
  let low = candidates[0];
  let high = candidates[candidates.length - 1];
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2000) * 1000;
    if (represented(middle) >= wall) high = middle;
    else low = middle;
  }
  return high;
}

/** Most recent Monday at the local hour (0 for a weekly reset, 7 for weekly email). */
export function localWeekStart(at: number, zone: FamilyZone, hour = 0): number {
  const monday = weekStartFor(localDay(at, zone));
  const start = localDateTime(monday, zone, hour);
  return at < start ? localDateTime(addDays(monday, -7), zone, hour) : start;
}

/** A local ledger period and the instant when the next one starts. */
export interface Period {
  start: string;
  resetsAt: number;
}

export function weekOf(at: number, zone: FamilyZone): Period {
  const start = weekStartFor(localDay(at, zone));
  return { start, resetsAt: localDateTime(addDays(start, 7), zone) };
}

export function dayOf(at: number, zone: FamilyZone): Period {
  const start = localDay(at, zone);
  return { start, resetsAt: localDateTime(addDays(start, 1), zone) };
}

/** Test/startup diagnostic. Probe behaviour where no tz version is exposed. */
export function warnIfTimeZoneDataIsOld(warn: (message: string) => void = console.warn): void {
  const probe = Date.parse("2026-11-18T12:00:00Z");
  for (const rule of OVERRIDES) {
    for (const zone of rule.zones) {
      const options: Intl.DateTimeFormatOptions = { hour: "2-digit", hourCycle: "h23" };
      const native = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: zone }).format(probe);
      const expected = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: rule.zone }).format(probe);
      if (native !== expected) warn(`[family-time] Runtime time-zone data is older than ${rule.expected} for ${zone}. The confirmed override is active. Update the runtime tz data.`);
    }
  }
}

/** The family's clock time, with no zone abbreviation. Format on the server and pass the text to the browser. */
export const familyTime = (at: number, timeZone: FamilyZone): string =>
  formatInZone(at, timeZone, { hour: "numeric", minute: "2-digit" });

/** A stable place name for people, without seasonal abbreviations or an IANA identifier. */
export function familyZoneName(zone: FamilyZone): string {
  const name = typeof zone === "string" ? zone : zone.zone;
  const canonical = normalizeTimeZone(name) ?? PACIFIC_ZONE;
  const fixed = /^(?:Etc\/)?(?:GMT|UTC)([+-]\d+)?$/.exec(canonical);
  if (fixed) {
    const hours = fixed[1] ? -Number(fixed[1]) : 0;
    return hours ? `UTC${hours > 0 ? "+" : ""}${hours} time` : "Coordinated Universal Time";
  }
  return `${canonical.split("/").at(-1)!.replaceAll("_", " ")} time`;
}

/** For example, "4:15 p.m. on Monday, October 12", in the family's time zone. */
export function familyWhen(at: number, timeZone: FamilyZone): string {
  const day = formatInZone(at, timeZone, { weekday: "long", month: "long", day: "numeric" });
  return `${familyTime(at, timeZone)} on ${day}`;
}

/** The account and start pages compute this once on the server, including its time-zone data. */
export const startWhen = (state: StartState, timeZone: FamilyZone): string =>
  state.kind === "wait" ? familyWhen(state.opensAt, timeZone)
    : state.kind === "resume" ? familyWhen(state.resumeUntil, timeZone) : "";

/** Server-formatted retry labels for PIN responses. Optional on the wire for an older server response. */
export interface RetryTime {
  retryWhen?: string;
  retryTime?: string;
}
