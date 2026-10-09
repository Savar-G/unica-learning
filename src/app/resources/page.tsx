import { AssessmentCta, ResourceCard, ResourcesShell } from "@/components/article";
import { Eyebrow } from "@/ds";
import { pageMetadata } from "@/lib/metadata";
import { resourcePath, resourcesByCategory, RESOURCES } from "@/lib/resources";
import { resourcesHubJsonLd } from "@/lib/structured-data";

// Indexable; listed in sitemap.ts. Linked only from the footer (not from the home page body).
export const metadata = pageMetadata({
  path: "/resources",
  title: "Guides for BC parents",
  description: "Plain guides for BC parents of children in grades 1-7: the BC curriculum, report cards, the FSA, and how tutoring options compare.",
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function ResourcesHub() {
  const jsonLd = resourcesHubJsonLd(RESOURCES.map((r) => ({ title: r.meta.title, path: resourcePath(r.meta.slug) })));
  return (
    <ResourcesShell jsonLd={jsonLd} navSrc="resources-nav">
      <main id="main" className="res res-hub">
        <header className="res-head">
          <Eyebrow>Resources</Eyebrow>
          <h1>Guides for BC parents</h1>
          <p className="res-lead">What your child learns in each grade, what school reports mean, and how the options for extra help compare.</p>
        </header>

        {resourcesByCategory().filter((g) => g.items.length).map((g) => (
          <section key={g.category} className="res-group" aria-labelledby={`grp-${slugify(g.category)}`}>
            <h2 id={`grp-${slugify(g.category)}`}>{g.category}</h2>
            <ul className="res-cards">
              {g.items.map((m, i) => <ResourceCard key={m.slug} meta={m} index={i} />)}
            </ul>
          </section>
        ))}

        <AssessmentCta slug="hub">Want to know where your child is? A free placement assessment on paper finds their level and gaps.</AssessmentCta>
      </main>
    </ResourcesShell>
  );
}
