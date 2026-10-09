import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";

// Only public, indexable pages. /thank-you and the 404 page stay out.
// Policy drafts remain noindex until their business details are approved.
const PATHS = ["/"];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
