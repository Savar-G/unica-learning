import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/article";
import { pageMetadata } from "@/lib/metadata";
import { blogPath, BLOG_POSTS, getBlogPost, relatedForPost } from "@/lib/blog";

// One static page per post in the registry (src/lib/blog.ts). Unknown slugs 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.meta.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const p = getBlogPost(slug);
  if (!p) return {};
  return pageMetadata({ path: blogPath(slug), title: p.meta.title, description: p.meta.description });
}

export default async function BlogArticle({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const p = getBlogPost(slug);
  if (!p) notFound();
  const { meta, Body } = p;
  return (
    <ArticleLayout meta={meta} section="blog" related={relatedForPost(meta)}>
      <Body />
    </ArticleLayout>
  );
}
