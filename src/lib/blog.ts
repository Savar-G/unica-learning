// Blog section (dated SEO posts for parents): the content contract and the registry.
// Each post lives in src/content/blog/<slug>.tsx and exports `meta` (BlogMeta) and a default
// `Body` component built from the blocks in "@/components/article", like the Resources guides.
// To add a post: create its content file, then add it to the import list and BLOG_MODULES below
// (the file name must match meta.slug). The weekly routine follows docs/blog-automation.md.
import type { ComponentType } from "react";
import { blogPath, type ArticleFaq, type ArticleSource, type CardItem } from "@/lib/resource-format";
import { RESOURCES, resourcePath } from "@/lib/resources";

import * as mathnasiumCostBc from "@/content/blog/mathnasium-cost-bc";
import * as sylvanVsKumon from "@/content/blog/sylvan-vs-kumon";

/** Post topics, shown on cards and as the post eyebrow. */
export const BLOG_CATEGORIES = ["Math at home", "Comparing options", "School in BC"] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogMeta = {
  /** URL segment: /blog/<slug>. Must match the content file name. Lowercase words and hyphens. */
  slug: string;
  /** H1 and SEO title, without the brand (the layout template adds " | Unica Learning"). 70 characters or fewer. */
  title: string;
  /** Meta description, 120-155 characters. */
  description: string;
  category: BlogCategory;
  /** One sentence shown under the H1 and on cards. */
  lead: string;
  /** ISO date the post went live, e.g. "2026-11-01". */
  published: string;
  /** ISO date of the last real update. Same as `published` until the post changes. */
  updated: string;
  /** Rendered after the body and emitted as FAQPage JSON-LD. Plain text answers. 3-6 questions. */
  faqs: ArticleFaq[];
  /** Numbered "Sources" list. <Cite n={2} /> links to the 2nd entry. At least 3. */
  sources: ArticleSource[];
  /** Paths of related pages ("/blog/<slug>" or "/resources/<slug>"), shown before the sources. Max 4. */
  related?: string[];
};

export type BlogPost = { meta: BlogMeta; Body: ComponentType };

type BlogModule = { meta: BlogMeta; default: ComponentType };

const BLOG_MODULES: BlogModule[] = [mathnasiumCostBc, sylvanVsKumon];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every post, newest first. */
export const BLOG_POSTS: BlogPost[] = BLOG_MODULES.map((m) => ({ meta: m.meta, Body: m.default })).sort(
  (a, b) => b.meta.published.localeCompare(a.meta.published) || a.meta.slug.localeCompare(b.meta.slug),
);

// Fail the build early on a broken contract: an automated post must not ship with a bad slug, date or link.
const slugs = new Set<string>();
for (const { meta } of BLOG_POSTS) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) throw new Error(`Blog post ${meta.slug}: slug must be lowercase words and hyphens`);
  if (slugs.has(meta.slug)) throw new Error(`Duplicate blog slug: ${meta.slug}`);
  if (RESOURCES.some((r) => r.meta.slug === meta.slug)) throw new Error(`Blog post ${meta.slug}: a resource guide has the same slug`);
  slugs.add(meta.slug);
}
const knownPaths = new Set([...BLOG_POSTS.map((p) => blogPath(p.meta.slug)), ...RESOURCES.map((r) => resourcePath(r.meta.slug))]);
for (const { meta } of BLOG_POSTS) {
  if (!ISO_DATE.test(meta.published) || !ISO_DATE.test(meta.updated)) throw new Error(`Blog post ${meta.slug}: dates must be YYYY-MM-DD`);
  if (meta.updated < meta.published) throw new Error(`Blog post ${meta.slug}: updated is before published`);
  if (meta.description.length > 155) throw new Error(`Blog post ${meta.slug}: description is ${meta.description.length} characters (max 155)`);
  for (const r of meta.related ?? []) if (!knownPaths.has(r) || r === blogPath(meta.slug)) throw new Error(`Blog post ${meta.slug}: unknown related path "${r}"`);
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.meta.slug === slug);
}

/** A post as a card, with its date and topic. */
export const blogCard = (m: BlogMeta): CardItem => ({ href: blogPath(m.slug), title: m.title, lead: m.lead, date: m.published, category: m.category });

/** Related reading for a post: the listed paths, else the newest other posts (max 3). */
export function relatedForPost(meta: BlogMeta): CardItem[] {
  const listed = (meta.related ?? []).map((path) => {
    const post = BLOG_POSTS.find((p) => blogPath(p.meta.slug) === path);
    if (post) return blogCard(post.meta);
    const guide = RESOURCES.find((r) => resourcePath(r.meta.slug) === path);
    return guide ? { href: path, title: guide.meta.title, lead: guide.meta.lead } : undefined;
  });
  const cards = listed.filter((c): c is CardItem => Boolean(c));
  if (cards.length) return cards.slice(0, 4);
  return BLOG_POSTS.filter((p) => p.meta.slug !== meta.slug).slice(0, 3).map((p) => blogCard(p.meta));
}

export { blogPath };
