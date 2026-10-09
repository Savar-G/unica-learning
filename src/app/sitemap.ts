import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";

// Only public, indexable pages. /thank-you and the 404 page stay out.
// Supporting pages (privacy, terms) stay out of search. The home page and /our-story are indexable.
const PATHS = ["/", "/our-story"];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
