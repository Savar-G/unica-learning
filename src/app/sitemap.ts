import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";

// Only public, indexable pages. /thank-you and the 404 page stay out.
const PATHS = ["/", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
