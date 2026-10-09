// Resource article: /resources/kumon-vs-mathnasium
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "kumon-vs-mathnasium",
  title: "Kumon vs Mathnasium: cost, method and fit",
  description: "Placeholder - writer fills this meta description (155 characters or fewer).",
  category: "Comparing options",
  lead: "Placeholder - writer fills this one-sentence intro.",
  updated: "2026-10-09",
  faqs: [
    { q: "Placeholder question 1 - writer fills this?", a: "Placeholder answer - writer fills this." },
    { q: "Placeholder question 2 - writer fills this?", a: "Placeholder answer - writer fills this." },
  ],
  sources: [
    { label: "Placeholder source 1 - writer fills this", url: "https://example.com/source-1", accessed: "2026-10-09" },
    { label: "Placeholder source 2 - writer fills this", url: "https://example.com/source-2", accessed: "2026-10-09" },
  ],
  related: ["is-kumon-worth-it", "kumon-alternatives"],
};

export default function Body() {
  return (
    <>
      <KeyFacts items={["Placeholder fact 1 - writer fills this.", "Placeholder fact 2 - writer fills this.", "Placeholder fact 3 - writer fills this."]} />

      <Section title="Placeholder section heading">
        <p>
          Placeholder - writer fills this paragraph. It shows <strong>bold text</strong>, <Link href="/resources">an internal link</Link>, <a href="https://example.com">an external link</a> and a citation.<Cite n={1} />
        </p>
        <ul>
          <li>Placeholder list item - writer fills this.</li>
          <li>Placeholder list item - writer fills this.</li>
        </ul>
        <h3>Placeholder subheading</h3>
        <ol>
          <li>Placeholder step - writer fills this.</li>
          <li>Placeholder step - writer fills this.<Cite n={2} /></li>
        </ol>
      </Section>

      <Section title="Placeholder table section">
        <DataTable
          caption="Placeholder table caption - writer fills this"
          columns={["Column A", "Column B", "Column C"]}
          rows={[
            ["Row 1", "Placeholder", "Placeholder"],
            ["Row 2", "Placeholder", "Placeholder"],
          ]}
          note="Placeholder table note - writer fills this."
        />
        <Callout label="Tip">
          <p>Placeholder tip - writer fills this.</p>
        </Callout>
      </Section>

      <AssessmentCta slug={meta.slug}>Placeholder call-to-action line - writer fills this.</AssessmentCta>
    </>
  );
}
