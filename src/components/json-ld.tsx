import { jsonLdHtml } from "@/lib/structured-data";

/** One schema.org JSON-LD block in the page body (node_modules/next/dist/docs/01-app/02-guides/json-ld.md). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
