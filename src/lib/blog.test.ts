import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_CATEGORIES, BLOG_POSTS, blogPath, relatedForPost } from "@/lib/blog";

// The quality gate for every post, written by a person or by the weekly routine (docs/blog-automation.md).
// The registry throws on broken slugs, dates and links; these tests check the writing contract.

const CONTENT_DIR = join(process.cwd(), "src", "content", "blog");
const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".tsx"));
const source = (slug: string) => readFileSync(join(CONTENT_DIR, `${slug}.tsx`), "utf8");

// Words and phrases that mark machine-written filler. Keep in sync with docs/blog-style.md.
const BANNED = [
  "delve", "tapestry", "embark", "unlock", "unleash", "game-changer", "game changer", "elevate", "seamless", "empower",
  "navigate the", "in today's", "fast-paced", "ever-evolving", "it's important to note", "it is important to note",
  "in conclusion", "look no further", "rest assured", "plethora", "myriad", "supercharge", "journey", "realm",
  "dive into", "deep dive", "crucial", "holistic", "robust", "leverage", "cutting-edge", "revolutionize",
  "pagewise", "guaranteed results", "proven to",
];

describe("blog registry", () => {
  it("has one registered post per content file", () => {
    expect(BLOG_POSTS.map((p) => `${p.meta.slug}.tsx`).sort()).toEqual([...files].sort());
  });

  it("lists posts newest first", () => {
    const dates = BLOG_POSTS.map((p) => p.meta.published);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("gives each post related reading that never links to itself", () => {
    for (const { meta } of BLOG_POSTS) {
      const related = relatedForPost(meta);
      expect(related.length, meta.slug).toBeLessThanOrEqual(4);
      expect(related.map((r) => r.href), meta.slug).not.toContain(blogPath(meta.slug));
    }
  });
});

describe.each(BLOG_POSTS.map((p) => [p.meta.slug, p] as const))("post %s", (slug, { meta }) => {
  const text = source(slug);
  const lower = text.toLowerCase();

  it("meets the SEO field limits", () => {
    expect(meta.title.length).toBeLessThanOrEqual(70);
    expect(meta.description.length).toBeGreaterThanOrEqual(120);
    expect(meta.description.length).toBeLessThanOrEqual(155);
    expect(BLOG_CATEGORIES).toContain(meta.category);
    expect(meta.lead.length).toBeGreaterThan(40);
  });

  it("answers 3-6 questions and cites at least 3 dated sources", () => {
    expect(meta.faqs.length).toBeGreaterThanOrEqual(3);
    expect(meta.faqs.length).toBeLessThanOrEqual(6);
    expect(meta.sources.length).toBeGreaterThanOrEqual(3);
    for (const s of meta.sources) {
      expect(s.url, s.label).toMatch(/^https:\/\//);
      expect(s.accessed, s.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.accessed <= meta.updated, `${s.label} accessed after the post date`).toBe(true);
    }
  });

  it("cites only sources that exist", () => {
    const cites = [...text.matchAll(/<Cite n=\{(\d+)\}/g)].map((m) => Number(m[1]));
    expect(cites.length, "cite at least one source in the body").toBeGreaterThan(0);
    for (const n of cites) expect(n, `Cite ${n}`).toBeLessThanOrEqual(meta.sources.length);
  });

  it("links to the free assessment and to at least one other page on the site", () => {
    expect(text).toContain("<AssessmentCta");
    expect(text).toMatch(/<Link href="\/(resources|blog|compare|sample-report)/);
  });

  it("imports only the article blocks, the blog types and Link", () => {
    const imports = [...text.matchAll(/\bfrom\s+["']([^"']+)["']|^import\s+["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);
    for (const from of imports) expect(["next/link", "@/lib/blog", "@/components/article"], `import from "${from}"`).toContain(from);
    expect(text, "no dynamic import or require").not.toMatch(/\bimport\(|\brequire\(/);
  });

  it("has no em dashes, en dashes or filler words", () => {
    expect(text).not.toMatch(/[—–]/);
    for (const w of BANNED) expect(lower, `banned phrase "${w}"`).not.toContain(w);
  });
});
