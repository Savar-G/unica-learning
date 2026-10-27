// Small helpers for the Resources and Blog sections. Kept apart from resources.ts and blog.ts so that
// src/components/article.tsx does not import the registries (which import every content file).

export const resourcePath = (slug: string) => `/resources/${slug}`;
export const blogPath = (slug: string) => `/blog/${slug}`;

export type ArticleFaq = { q: string; a: string };
export type ArticleSource = { label: string; url: string; /** ISO date, e.g. "2026-10-09". */ accessed: string };

/** The fields ArticleLayout reads. ResourceMeta and BlogMeta both have them. */
export type ArticleBase = {
  slug: string;
  title: string;
  description: string;
  category: string;
  lead: string;
  /** ISO date of the last real update. */
  updated: string;
  /** ISO publish date. Blog posts only; guides show the update date alone. */
  published?: string;
  faqs?: ArticleFaq[];
  sources?: ArticleSource[];
};

/** A card on a hub page or in "Related" lists. `date` and `category` show on blog cards. */
export type CardItem = { href: string; title: string; lead: string; date?: string; category?: string };

export type ArticleSection = "resources" | "blog";

/** Per-section names: breadcrumb, related heading, schema.org type and the analytics `src` prefix. */
export const ARTICLE_SECTIONS: Record<ArticleSection, { name: string; path: string; relatedTitle: string; schemaType: "Article" | "BlogPosting"; src: string }> = {
  resources: { name: "Resources", path: "/resources", relatedTitle: "Related guides", schemaType: "Article", src: "resource" },
  blog: { name: "Blog", path: "/blog", relatedTitle: "Related reading", schemaType: "BlogPosting", src: "blog" },
};

export const articlePath = (section: ArticleSection, slug: string) => `${ARTICLE_SECTIONS[section].path}/${slug}`;

/** "2026-10-09" -> "October 9, 2026" (UTC, so the date never shifts by time zone). */
export function formatResourceDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
