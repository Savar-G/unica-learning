import type { StartState } from "@/lib/assessment";

/** The time zone of the province that a postal code's first letter belongs to. A guess for the few that span two zones. */
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
  V: "America/Vancouver",
  X: "America/Yellowknife",
  Y: "America/Whitehorse",
};
export const zoneFor = (postal: string | null) => ZONE[(postal ?? "").trim().charAt(0).toUpperCase()] ?? "America/Vancouver";

/** The family's clock time, with no zone abbreviation. Format on the server and pass the text to the browser. */
export const familyTime = (at: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone }).format(at);

/** For example, "4:15 p.m. on Monday, October 12", in the family's time zone. */
export function familyWhen(at: number, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone }).format(at);
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
