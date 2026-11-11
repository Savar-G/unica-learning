import { JsonLd } from "@/components/json-ld";
import { pageJsonLd } from "@/lib/structured-data";
import { pageMetadata } from "@/lib/metadata";
import { WhatsIncluded } from "@/components/whats-included";

// Indexable like /rewards: listed in sitemap.ts.
const PAGE = {
  path: "/whats-included",
  title: "What's included",
  description: "Everything your child gets, in the order it happens: the free assessment, the workbook, the AI Teaching Assistant, page scanning on our website, the parent dashboard and the next workbook.",
};
export const metadata = pageMetadata(PAGE);

export default function WhatsIncludedPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(PAGE)} />
      <WhatsIncluded />
    </>
  );
}
