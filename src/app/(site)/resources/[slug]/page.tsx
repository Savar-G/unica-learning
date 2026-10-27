import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/article";
import { pageMetadata } from "@/lib/metadata";
import { getResource, relatedResources, resourceCard, resourcePath, RESOURCES } from "@/lib/resources";

// One static page per article in the registry (src/lib/resources.ts). Unknown slugs 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.meta.slug }));
}

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) return {};
  return pageMetadata({ path: resourcePath(slug), title: r.meta.title, description: r.meta.description });
}

export default async function ResourceArticle({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) notFound();
  const { meta, Body } = r;
  return (
    <ArticleLayout meta={meta} section="resources" related={relatedResources(meta).map(resourceCard)}>
      <Body />
    </ArticleLayout>
  );
}
