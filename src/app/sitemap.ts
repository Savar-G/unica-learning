import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/metadata";
import { resourcePath, RESOURCES } from "@/lib/resources";
import { blogPath, BLOG_POSTS } from "@/lib/blog";

// Only public, indexable pages. /thank-you and the 404 page stay out.
// The home page, /pricing, /math-assessment, /our-story, /compare, /rewards, /whats-included, /curriculum, /sample-report,
// /contact, /privacy, /terms (indexable since D-319), the Resources section (hub plus every article in src/lib/resources.ts)
// and the Blog (hub plus every post in src/lib/blog.ts) are indexable.
// `updated` is the date the page's visible text last changed (D-319): change it in the same commit as the copy, never to
// the build date. Search engines and IndexNow (scripts/indexnow.mjs) read it as "this page changed".
const newest = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), "");
const PATHS: { path: string; updated?: string }[] = [
  { path: "/", updated: "2026-11-13" },
  { path: "/pricing", updated: "2026-11-13" },
  { path: "/math-assessment", updated: "2026-11-05" },
  { path: "/our-story", updated: "2026-11-13" },
  { path: "/compare", updated: "2026-11-13" },
  { path: "/rewards", updated: "2026-11-11" },
  { path: "/whats-included", updated: "2026-11-13" },
  { path: "/curriculum", updated: "2026-11-13" },
  { path: "/sample-report", updated: "2026-11-11" },
  { path: "/contact", updated: "2026-10-18" },
  { path: "/privacy", updated: "2026-11-13" },
  { path: "/terms", updated: "2026-11-12" },
  { path: "/resources", updated: newest(RESOURCES.map((r) => r.meta.updated)) },
  ...RESOURCES.map((r) => ({ path: resourcePath(r.meta.slug), updated: r.meta.updated })),
  { path: "/blog", updated: newest(BLOG_POSTS.map((p) => p.meta.updated)) },
  ...BLOG_POSTS.map((p) => ({ path: blogPath(p.meta.slug), updated: p.meta.updated })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  return PATHS.map(({ path, updated }) => ({ url: `${SITE_URL}${path === "/" ? "" : path}`, ...(updated ? { lastModified: updated } : {}) }));
}
