// schema.org JSON-LD for the home page (see node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
// Only facts the page states: no ratings, reviews or counts (DESIGN.md: no proof we do not have).
// No FAQPage or HowTo markup (D-319): the FAQ stays on the page as text.
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/metadata";
import { BRAND, PLANS, SOCIAL_LINKS } from "@/lib/site";
import { BUSINESS_NAME, SUPPORT_EMAIL } from "@/lib/contact";
import { ARTICLE_SECTIONS, type ArticleSection } from "@/lib/resource-format";

export const ORG_ID = `${SITE_URL}/#organization`;

const offer = (p: (typeof PLANS)[keyof typeof PLANS]) => ({
  "@type": "Offer",
  name: p.name,
  description: `${p.note}. Available for the BC curriculum.`,
  price: p.price,
  priceCurrency: "CAD",
  priceSpecification: { "@type": "UnitPriceSpecification", price: p.price, priceCurrency: "CAD", unitText: "MONTH", billingDuration: "P1M" },
  url: `${SITE_URL}/pricing`,
});

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: BUSINESS_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/apple-icon.png`,
  email: SUPPORT_EMAIL,
  sameAs: SOCIAL_LINKS.map((l) => l.href),
  areaServed: { "@type": "Country", name: "Canada" },
  address: { "@type": "PostalAddress", addressLocality: "Vancouver", addressRegion: "BC", addressCountry: "CA" },
};

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: BRAND, inLanguage: "en-CA", publisher: { "@id": ORG_ID } },
      {
        "@type": "Service",
        name: `${BRAND} personalized learning program`,
        serviceType: "Personalized math learning program",
        description: SITE_DESCRIPTION,
        provider: { "@id": ORG_ID },
        areaServed: { "@type": "Country", name: "Canada" },
        audience: { "@type": "PeopleAudience", suggestedMinAge: 5, suggestedMaxAge: 14 },
        offers: [offer(PLANS.one)],
      },
    ],
  };
}

// Resources and Blog sections (/resources, /blog and their articles). Facts come from each article's meta.
type Crumb = { name: string; path: string };

function breadcrumbs(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path === "/" ? "" : c.path}` })),
  };
}

/** A section hub (/resources or /blog): a CollectionPage that lists its articles. */
export function hubJsonLd(section: ArticleSection, name: string, articles: { title: string; path: string; published?: string }[]) {
  const sec = ARTICLE_SECTIONS[section];
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      breadcrumbs([{ name: "Home", path: "/" }, { name: sec.name, path: sec.path }]),
      {
        "@type": "CollectionPage",
        name,
        url: `${SITE_URL}${sec.path}`,
        inLanguage: "en-CA",
        publisher: { "@id": ORG_ID },
        hasPart: articles.map((a) => ({
          "@type": sec.schemaType,
          headline: a.title,
          url: `${SITE_URL}${a.path}`,
          ...(a.published ? { datePublished: a.published } : {}),
        })),
      },
    ],
  };
}

export function articleJsonLd(a: { section: ArticleSection; path: string; title: string; description: string; published?: string; updated: string }) {
  const sec = ARTICLE_SECTIONS[a.section];
  const url = `${SITE_URL}${a.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      breadcrumbs([{ name: "Home", path: "/" }, { name: sec.name, path: sec.path }, { name: a.title, path: a.path }]),
      {
        "@type": sec.schemaType,
        headline: a.title,
        description: a.description,
        ...(a.published ? { datePublished: a.published } : {}),
        dateModified: a.updated,
        url,
        mainEntityOfPage: url,
        inLanguage: "en-CA",
        author: { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

/** A site page outside Resources and Blog (D-319): its page type, a breadcrumb from Home, and the publisher. */
export function pageJsonLd(p: { path: string; title: string; description: string }, type: "WebPage" | "AboutPage" | "ContactPage" = "WebPage") {
  const url = `${SITE_URL}${p.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      breadcrumbs([{ name: "Home", path: "/" }, { name: p.title, path: p.path }]),
      { "@type": type, name: p.title, description: p.description, url, inLanguage: "en-CA", isPartOf: { "@id": `${SITE_URL}/#website` }, publisher: { "@id": ORG_ID } },
    ],
  };
}

/** Safe JSON-LD script body: escapes "<" so content cannot close the script tag. */
export const jsonLdHtml = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
