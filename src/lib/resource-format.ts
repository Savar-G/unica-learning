// Small helpers for the Resources section. Kept apart from resources.ts so that
// src/components/article.tsx does not import the registry (which imports every content file).

export const resourcePath = (slug: string) => `/resources/${slug}`;

/** "2026-10-09" -> "October 9, 2026" (UTC, so the date never shifts by time zone). */
export function formatResourceDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
