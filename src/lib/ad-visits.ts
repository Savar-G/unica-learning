// The ad visit counter (docs/ad-tracking.md): a visit that lands from an ad or a tagged link (a utm_source other than a
// flyer, or a Google or Meta click ID) gets one random visit ID in the browser tab, and /api/visit stores one row per
// visit ID in public.ad_visits. This file turns what the browser posted into that row, with no network. A row holds
// the UTM tags, the time and whether a click ID was there: never the click ID itself, an IP, a user agent or a cookie.
import { isAdVisit } from "@/lib/visit-source";

export interface AdVisitRow {
  visit_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  has_gclid: boolean;
  has_fbclid: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The longest UTM value kept; the table's check allows the same. */
export const TAG_MAX = 100;
// No control characters (the table checks the same).
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A UTM value as stored: trimmed and at most TAG_MAX characters; null when absent or not text. */
function tag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, TAG_MAX).trim();
  return t && !CONTROL.test(t) ? t : null;
}

/**
 * The row to store for a posted visit, or null when the post is not an ad visit: no valid visit ID, or neither a
 * utm_source other than a flyer nor a click ID (flyer scans are counted by /f/<code>).
 */
export function adVisitRow(body: unknown): AdVisitRow | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.visitId !== "string" || !UUID.test(b.visitId)) return null;
  const row: AdVisitRow = {
    visit_id: b.visitId.toLowerCase(),
    utm_source: tag(b.utm_source),
    utm_medium: tag(b.utm_medium),
    utm_campaign: tag(b.utm_campaign),
    utm_content: tag(b.utm_content),
    has_gclid: b.has_gclid === true,
    has_fbclid: b.has_fbclid === true,
  };
  const counts = isAdVisit({ ...(row.utm_source ? { utm_source: row.utm_source } : {}), ...(row.has_gclid ? { gclid: "1" } : {}), ...(row.has_fbclid ? { fbclid: "1" } : {}) });
  return counts ? row : null;
}
