import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";

// Only public, indexable pages. /thank-you and the 404 page stay out.
// Supporting pages (privacy, terms) stay out of search. The home page, /our-story, /rewards, /sample-report and the
// Resources section (hub plus every article in src/lib/resources.ts) are indexable.
const PATHS: { path: string; updated?: string }[] = [
  { path: "/" },
  { path: "/our-story" },
  { path: "/rewards" },
  { path: "/sample-report" },
  { path: "/resources" },
  ...RESOURCES.map((r) => ({ path: resourcePath(r.meta.slug), updated: r.meta.updated })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map(({ path, updated }) => ({ url: `${SITE_URL}${path === "/" ? "" : path}`, ...(updated ? { lastModified: updated } : {}) }));
}
