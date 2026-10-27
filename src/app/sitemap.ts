import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { blogPath, BLOG_POSTS } from "@/lib/blog";

// Only public, indexable pages. /thank-you and the 404 page stay out.
// Supporting pages (privacy, terms) stay out of search. The home page, /our-story, /compare, /rewards, /sample-report, /contact and the
// Resources section (hub plus every article in src/lib/resources.ts) and the Blog (hub plus every post in src/lib/blog.ts) are indexable.
const PATHS: { path: string; updated?: string }[] = [
  { path: "/" },
  { path: "/our-story" },
  { path: "/compare" },
  { path: "/rewards" },
  { path: "/sample-report" },
  { path: "/contact" },
  { path: "/resources" },
  ...RESOURCES.map((r) => ({ path: resourcePath(r.meta.slug), updated: r.meta.updated })),
  { path: "/blog", updated: BLOG_POSTS[0]?.meta.updated },
  ...BLOG_POSTS.map((p) => ({ path: blogPath(p.meta.slug), updated: p.meta.updated })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map(({ path, updated }) => ({ url: `${SITE_URL}${path === "/" ? "" : path}`, ...(updated ? { lastModified: updated } : {}) }));
}
