import { addDays } from "@/lib/family-time";

// The next book's date range (spec #544, "Next book range"; D-213, D-246). Pure: no database, network or clock; every
// day is a calendar date (YYYY-MM-DD) in family time, which the caller reads through src/lib/family-time.ts.
//   - Earliest: the current book's shipping day plus 14 days (the two-week cadence).
//   - Latest: its confirmed delivery plus 28 days (the 21-day backstop plus 7 days to approve, print and mail); with no
//     confirmed delivery, its shipping day plus 35 days.
//   - Before the first book ships: a status, with no date.
// Two cases the spec leaves open, kept as statuses with no date, so the page never shows a date we cannot keep:
//   - The range has passed and no newer book shipped: `past_estimate`. Nothing here knows whether the next book is being made.
//   - The plan ended: `none`.
// Pause (#559) moves both ends by the paused weeks; it is not built yet.

export const EARLIEST_DAYS = 14;
export const LATEST_AFTER_DELIVERY_DAYS = 28;
export const LATEST_AFTER_SHIPPING_DAYS = 35;

export interface NextBookInput {
  /** The current (latest shipped) book's shipping day; null before the first book ships. */
  shippedOn: string | null;
  /** Its confirmed delivery day; null when no delivery is confirmed. */
  deliveredOn: string | null;
  today: string;
  /** The plan ended. */
  ended: boolean;
}

export type NextBook =
  | { kind: "first_book_coming" }
  | { kind: "range"; earliest: string; latest: string }
  | { kind: "past_estimate" }
  | { kind: "none" };

function day(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || addDays(value, 0) !== value) throw new RangeError(`${name} is not a calendar date`);
  return value;
}

export function nextBook({ shippedOn, deliveredOn, today, ended }: NextBookInput): NextBook {
  day(today, "today");
  if (ended) return { kind: "none" };
  if (shippedOn === null) return { kind: "first_book_coming" };
  const shipped = day(shippedOn, "shippedOn");
  const latest = deliveredOn === null ? addDays(shipped, LATEST_AFTER_SHIPPING_DAYS) : addDays(day(deliveredOn, "deliveredOn"), LATEST_AFTER_DELIVERY_DAYS);
  if (today > latest) return { kind: "past_estimate" };
  return { kind: "range", earliest: addDays(shipped, EARLIEST_DAYS), latest };
}
