import Link from "next/link";
import { ArticleCard, AssessmentCta, ResourcesShell } from "@/components/article";
import { Eyebrow } from "@/ds";
import { pageMetadata } from "@/lib/metadata";
import { blogCard, blogPath, BLOG_POSTS } from "@/lib/blog";
import { hubJsonLd } from "@/lib/structured-data";

// Indexable; listed in sitemap.ts. Linked from the footer. Posts are added by the weekly routine (docs/blog-automation.md).
export const metadata = pageMetadata({
  path: "/blog",
  title: "Blog: math help for parents",
  description: "Posts for parents of children from Kindergarten to Grade 9: how to help with math at home, how tutors and learning programs compare, and school in BC.",
});

export default function BlogHub() {
  const jsonLd = hubJsonLd("blog", "Unica Learning blog", BLOG_POSTS.map((p) => ({ title: p.meta.title, path: blogPath(p.meta.slug), published: p.meta.published })));
  return (
    <ResourcesShell jsonLd={jsonLd} navSrc="blog-nav">
      <main id="main" className="res res-hub">
        <header className="res-head">
          <Eyebrow>Blog</Eyebrow>
          <h1>Math help for parents</h1>
          <p className="res-lead">
            How to help with math at home, how tutors and learning programs compare, and what school in BC expects. For grade-by-grade
            guides, see <Link href="/resources">Resources</Link>.
          </p>
        </header>

        <section className="res-group" aria-labelledby="blog-latest">
          <h2 id="blog-latest">Latest posts</h2>
          {BLOG_POSTS.length ? (
            <ul className="res-cards">
              {BLOG_POSTS.map((p, i) => <ArticleCard key={p.meta.slug} item={blogCard(p.meta)} index={i} />)}
            </ul>
          ) : (
            <p>New posts are on the way.</p>
          )}
        </section>

        <AssessmentCta slug="blog-hub">Want to know where your child is? The free online math assessment shows their math level and gaps.</AssessmentCta>
      </main>
    </ResourcesShell>
  );
}
