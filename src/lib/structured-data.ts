// schema.org JSON-LD for the home page (see node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
// Only facts the page states: no ratings, reviews or counts (DESIGN.md: no proof we do not have).
import { FAQ } from "@/lib/faq";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/metadata";
import { BRAND, PLANS } from "@/lib/site";
import { BUSINESS_NAME, SUPPORT_EMAIL } from "@/lib/contact";

export const ORG_ID = `${SITE_URL}/#organization`;

const offer = (p: (typeof PLANS)[keyof typeof PLANS]) => ({
  "@type": "Offer",
  name: p.name,
  description: p.note,
  price: p.price,
  priceCurrency: "CAD",
  priceSpecification: { "@type": "UnitPriceSpecification", price: p.price, priceCurrency: "CAD", unitText: "MONTH", billingDuration: "P1M" },
  eligibleRegion: { "@type": "Country", name: "Canada" },
  url: `${SITE_URL}/#price`,
});

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: BUSINESS_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/apple-icon.png`,
  email: SUPPORT_EMAIL,
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
        name: `${BRAND} personalized workbooks`,
        serviceType: "Personalized math and reading workbooks",
        description: SITE_DESCRIPTION,
        provider: { "@id": ORG_ID },
        areaServed: { "@type": "Country", name: "Canada" },
        audience: { "@type": "PeopleAudience", suggestedMinAge: 6, suggestedMaxAge: 12 },
        offers: [offer(PLANS.one)],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      },
    ],
  };
}

// Resources section (/resources and /resources/<slug>). Facts come from each article's meta.
type Crumb = { name: string; path: string };

function breadcrumbs(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path === "/" ? "" : c.path}` })),
  };
}

export function resourcesHubJsonLd(articles: { title: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      breadcrumbs([{ name: "Home", path: "/" }, { name: "Resources", path: "/resources" }]),
      {
        "@type": "CollectionPage",
        name: "Guides for BC parents",
        url: `${SITE_URL}/resources`,
        inLanguage: "en-CA",
        publisher: { "@id": ORG_ID },
        hasPart: articles.map((a) => ({ "@type": "Article", headline: a.title, url: `${SITE_URL}${a.path}` })),
      },
    ],
  };
}

export function resourceJsonLd(a: { path: string; title: string; description: string; updated: string; faqs?: { q: string; a: string }[] }) {
  const url = `${SITE_URL}${a.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      breadcrumbs([{ name: "Home", path: "/" }, { name: "Resources", path: "/resources" }, { name: a.title, path: a.path }]),
      {
        "@type": "Article",
        headline: a.title,
        description: a.description,
        dateModified: a.updated,
        url,
        mainEntityOfPage: url,
        inLanguage: "en-CA",
        author: { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
      },
      ...(a.faqs?.length
        ? [{ "@type": "FAQPage", mainEntity: a.faqs.map(({ q, a: ans }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: ans } })) }]
        : []),
    ],
  };
}

/** Safe JSON-LD script body: escapes "<" so content cannot close the script tag. */
export const jsonLdHtml = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
