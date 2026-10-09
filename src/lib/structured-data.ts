// schema.org JSON-LD for the home page (see node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
// Only facts the page states: no ratings, reviews or counts (DESIGN.md: no proof we do not have).
import { FAQ } from "@/lib/faq";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/metadata";
import { BRAND, PLANS } from "@/lib/site";
import { BUSINESS_NAME, SUPPORT_EMAIL } from "@/lib/contact";

const ORG_ID = `${SITE_URL}/#organization`;

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

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: BUSINESS_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/apple-icon.png`,
        email: SUPPORT_EMAIL,
        areaServed: { "@type": "Country", name: "Canada" },
        address: { "@type": "PostalAddress", addressLocality: "Vancouver", addressRegion: "BC", addressCountry: "CA" },
      },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: BRAND, inLanguage: "en-CA", publisher: { "@id": ORG_ID } },
      {
        "@type": "Service",
        name: `${BRAND} personalized workbooks`,
        serviceType: "Personalized math and reading workbooks",
        description: SITE_DESCRIPTION,
        provider: { "@id": ORG_ID },
        areaServed: { "@type": "Country", name: "Canada" },
        audience: { "@type": "PeopleAudience", suggestedMinAge: 6, suggestedMaxAge: 12 },
        offers: [offer(PLANS.one), offer(PLANS.both)],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      },
    ],
  };
}
