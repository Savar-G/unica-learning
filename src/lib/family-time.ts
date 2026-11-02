import type { Province, StartState } from "@/lib/assessment";

export const PACIFIC_ZONE = "America/Vancouver";
const ZONE: Record<string, string> = {
  A: "America/St_Johns",
  B: "America/Halifax",
  C: "America/Halifax",
  E: "America/Moncton",
  G: "America/Toronto",
  H: "America/Toronto",
  J: "America/Toronto",
  K: "America/Toronto",
  L: "America/Toronto",
  M: "America/Toronto",
  N: "America/Toronto",
  P: "America/Toronto",
  R: "America/Winnipeg",
  S: "America/Regina",
  T: "America/Edmonton",
  V: PACIFIC_ZONE,
  X: "America/Yellowknife",
  Y: "America/Whitehorse",
};
// Boundaries: https://raw.githubusercontent.com/eggert/tz/main/northamerica
// Remote postal locations (including FlexDelivery):
// https://origin-www.canadapost.ca/cpc/en/support/articles/air-stage-offices/find-an-air-stage-office.page
// Full postal codes and rural delivery prefixes take precedence over an FSA.
const POSTAL_ZONES: Record<string, string> = {};
function postalZones(zone: string, codes: string) {
  for (const code of codes.split(" ")) POSTAL_ZONES[code] = zone;
}
postalZones("America/Iqaluit", "X0A");
postalZones("America/Resolute", "X0A0V0 X0A0A2 X0A0G0"); // Resolute and Eureka
postalZones("America/Rankin_Inlet", "X0C");
postalZones("America/Atikokan", "X0C0C0 X0C0A2"); // Coral Harbour: no DST
postalZones("America/Cambridge_Bay", "X0B"); // Nunavut still observes seasonal Mountain time
postalZones("America/Inuvik", "X0E");
postalZones("America/Goose_Bay", "A0P A0R A2V A0K1N0 A0K0B5"); // Southeast Labrador stays Newfoundland time
postalZones("America/Winnipeg", "P0V P0W P0X P0Y P8N P8T P8V P9A P9N P0T1T0");
postalZones("America/Atikokan", "P0T1C0 P0V2V0 P0V2H0"); // Atikokan, Pickle Lake, Mishkeegogamang
postalZones("America/Toronto", "P0V1W0 P0V0B8"); // Fort Severn, east of the Central-time communities
postalZones("America/Edmonton", "V1A V1C V0A V0B"); // East Kootenay and Golden
postalZones(PACIFIC_ZONE, "V0B1E V0B1S V0B1X V0B2B"); // Crawford Bay, Gray Creek, Kootenay Bay, Riondel
postalZones("America/Creston", "V0B1A V0B1C V0B1G V0B1K V0B1W V0B2C V0B2N V0B2P V0B3G"); // Creston Valley: no DST
postalZones("America/Dawson_Creek", "V1G V1J V0C1J0 V0C1V0 V0C2K0 V0C2W0");
postalZones("America/Fort_Nelson", "V0C1R0");
// Lower north shore: Atlantic time without DST. The rest of G0G stays Eastern.
postalZones("America/Blanc-Sablon", "G0G1C0 G0G1E0 G0G1G0 G0G1M0 G0G1N0 G0G1S0 G0G1T0 G0G1W0 G0G1Z0 G0G2C0 G0G2G0 G0G2P0 G0G2R0 G0G2W0 G0G0B5 G0G0C7 G0G0A6 G0G0B3 G0G0A2 G0G0A3");
postalZones("America/Halifax", "G4T"); // Magdalen Islands: Atlantic with DST

/** Postal code -> named zone. Missing and unrecognised codes use BC time. */
export function zoneFor(postal: string | null): string {
  const code = (postal ?? "").replace(/\s/g, "").toUpperCase();
  return POSTAL_ZONES[code] ?? POSTAL_ZONES[code.slice(0, 5)] ?? POSTAL_ZONES[code.slice(0, 3)] ?? ZONE[code[0]] ?? PACIFIC_ZONE;
}

/** Only for older report inputs that have a curriculum province but no postal field. */
export function zoneForProvince(province: Province): string {
  return { BC: PACIFIC_ZONE, AB: ZONE.T, SK: ZONE.S, MB: ZONE.R, ON: ZONE.M, other: ZONE.M }[province];
}

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
export function effectiveZone(at: number, zone: string): string {
  return OVERRIDES.find((rule) => at >= rule.from && rule.zones.some((name) => name === zone))?.zone ?? zone;
}

type FormatOptions = Omit<Intl.DateTimeFormatOptions, "timeZone">;
type Instant = number | string | Date;
const instant = (at: Instant) => typeof at === "number" ? at : new Date(at).getTime();
const formatter = (at: number, zone: string, options: FormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { ...options, timeZone: effectiveZone(at, zone) });

/** All instant formatting uses the same rule layer, on both server and browser. */
export function formatInZone(at: Instant, zone: string, options: FormatOptions): string {
  const ms = instant(at);
  return formatter(ms, zone, options).format(ms);
}

export function partsInZone(at: Instant, zone: string, options: FormatOptions): Record<string, string> {
  const ms = instant(at);
  return Object.fromEntries(formatter(ms, zone, options).formatToParts(ms).map((p) => [p.type, p.value]));
}

/** YYYY-MM-DD for grouping events by the same local day that the display uses. */
export const localDay = (at: Instant, zone: string): string =>
  formatInZone(at, zone, { year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar dates have no instant or zone. Keep article dates and chart labels on that date. */
export const formatCalendarDate = (day: string, options: FormatOptions): string =>
  formatInZone(`${day}T12:00:00Z`, "UTC", options);

/** Most recent Monday at the local hour (0 for a weekly reset, 7 for weekly email). */
export function localWeekStart(at: number, zone: string, hour = 0): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("Hour must be between 0 and 23");
  const p = partsInZone(at, zone, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" });
  const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday - (daysSinceMonday === 0 && Number(p.hour) < hour ? 7 : 0));
  date.setUTCHours(hour);
  const wall = date.getTime();
  let result = wall;
  // Convert local calendar fields back to an instant. Re-evaluate the offset across DST.
  for (let i = 0; i < 4; i++) {
    const fields = partsInZone(result, zone, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    const represented = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second));
    const next = result + wall - represented;
    if (next === result) return result;
    result = next;
  }
  throw new RangeError("Cannot resolve local Monday");
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
export const familyTime = (at: number, timeZone: string): string =>
  formatInZone(at, timeZone, { hour: "numeric", minute: "2-digit" });

/** For example, "4:15 p.m. on Monday, October 12", in the family's time zone. */
export function familyWhen(at: number, timeZone: string): string {
  const day = formatInZone(at, timeZone, { weekday: "long", month: "long", day: "numeric" });
  return `${familyTime(at, timeZone)} on ${day}`;
}

/** The account and start pages compute this once on the server, including its time-zone data. */
export const startWhen = (state: StartState, timeZone: string): string =>
  state.kind === "wait" ? familyWhen(state.opensAt, timeZone)
    : state.kind === "resume" ? familyWhen(state.resumeUntil, timeZone) : "";

/** Server-formatted retry labels for PIN responses. Optional on the wire for an older server response. */
export interface RetryTime {
  retryWhen?: string;
  retryTime?: string;
}
