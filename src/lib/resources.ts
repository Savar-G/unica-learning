// Resources section (SEO guides for BC parents): the content contract and the registry.
// Each article lives in src/content/resources/<slug>.tsx and exports `meta` (ResourceMeta) and a
// default `Body` component built from the blocks in "@/components/article".
// Writers edit only their own content file. To add, remove or rename an article, edit the import
// list and RESOURCE_MODULES below (the file name must match meta.slug).
import type { ComponentType } from "react";

import * as grade1 from "@/content/resources/bc-grade-1-math-and-reading";
import * as grade2 from "@/content/resources/bc-grade-2-math-and-reading";
import * as grade3 from "@/content/resources/bc-grade-3-math-and-reading";
import * as grade4 from "@/content/resources/bc-grade-4-math-and-reading";
import * as grade5 from "@/content/resources/bc-grade-5-math-and-reading";
import * as grade6 from "@/content/resources/bc-grade-6-math-and-reading";
import * as grade7 from "@/content/resources/bc-grade-7-math-and-reading";
import * as reportCard from "@/content/resources/bc-proficiency-scale";
import * as fsa from "@/content/resources/bc-fsa-grade-4-and-7";
import * as tutoringCost from "@/content/resources/tutor-cost-bc";
import * as kumonCost from "@/content/resources/kumon-cost-bc";
import * as kumonWorth from "@/content/resources/is-kumon-worth-it";
import * as kumonAlternatives from "@/content/resources/kumon-alternatives";
import * as kumonVsMathnasium from "@/content/resources/kumon-vs-mathnasium";

/** Hub groups, in display order. */
export const RESOURCE_CATEGORIES = ["BC curriculum", "BC school guides", "Comparing options"] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export type ResourceFaq = { q: string; a: string };
export type ResourceSource = { label: string; url: string; /** ISO date, e.g. "2026-10-09". */ accessed: string };

export type ResourceMeta = {
  /** URL segment: /resources/<slug>. Must match the content file name. */
  slug: string;
  /** H1 and SEO title, without the brand (the layout template adds " | Unica Learning"). */
  title: string;
  /** Meta description, 155 characters or fewer. */
  description: string;
  category: ResourceCategory;
  /** One sentence shown under the H1 and on hub cards. */
  lead: string;
  /** ISO date of the last real update, e.g. "2026-10-09". */
  updated: string;
  /** Rendered after the body and emitted as FAQPage JSON-LD. Plain text answers. */
  faqs?: ResourceFaq[];
  /** Rendered as a numbered "Sources" list. <Cite n={2} /> links to the 2nd entry. */
  sources?: ResourceSource[];
  /** Slugs of related articles, shown before the sources. */
  related?: string[];
};

export type Resource = { meta: ResourceMeta; Body: ComponentType };

type ResourceModule = { meta: ResourceMeta; default: ComponentType };

const RESOURCE_MODULES: ResourceModule[] = [
  grade1, grade2, grade3, grade4, grade5, grade6, grade7,
  reportCard, fsa,
  tutoringCost, kumonCost, kumonWorth, kumonAlternatives, kumonVsMathnasium,
];

export const RESOURCES: Resource[] = RESOURCE_MODULES.map((m) => ({ meta: m.meta, Body: m.default }));

// Fail the build early on a duplicate slug, an unknown related slug or a long description.
const seen = new Set<string>();
for (const { meta } of RESOURCES) {
  if (seen.has(meta.slug)) throw new Error(`Duplicate resource slug: ${meta.slug}`);
  seen.add(meta.slug);
}
for (const { meta } of RESOURCES) {
  for (const r of meta.related ?? []) if (!seen.has(r)) throw new Error(`Resource ${meta.slug}: unknown related slug "${r}"`);
  if (meta.description.length > 155) throw new Error(`Resource ${meta.slug}: description is ${meta.description.length} characters (max 155)`);
}

export { formatResourceDate, resourcePath } from "@/lib/resource-format";

export function getResource(slug: string): Resource | undefined {
  return RESOURCES.find((r) => r.meta.slug === slug);
}

/** Related articles for a page: the listed slugs, else others in the same category (max 3). */
export function relatedResources(meta: ResourceMeta): ResourceMeta[] {
  const listed = (meta.related ?? []).map((s) => getResource(s)?.meta).filter((m): m is ResourceMeta => Boolean(m));
  if (listed.length) return listed;
  return RESOURCES.map((r) => r.meta).filter((m) => m.category === meta.category && m.slug !== meta.slug).slice(0, 3);
}

export function resourcesByCategory(): { category: ResourceCategory; items: ResourceMeta[] }[] {
  return RESOURCE_CATEGORIES.map((category) => ({ category, items: RESOURCES.map((r) => r.meta).filter((m) => m.category === category) }));
}
