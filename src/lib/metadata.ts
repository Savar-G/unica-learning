import type { Metadata } from "next";
import { BRAND, PLANS } from "@/lib/site";

const PRODUCTION_URL = "https://unicalearning.com";

// Public origin. Set NEXT_PUBLIC_SITE_URL on the launch deploy; local dev uses localhost.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : PRODUCTION_URL);

// Search indexing is off until NEXT_PUBLIC_ALLOW_INDEX=true, and always off on Vercel preview deploys.
export const INDEXABLE = process.env.NEXT_PUBLIC_ALLOW_INDEX === "true" && process.env.VERCEL_ENV !== "preview";

export const SITE_TITLE = `${BRAND}: Personalized math and reading workbooks, mailed home`;
export const SITE_DESCRIPTION = `Personalized math and reading workbooks for ages 6-12, mailed home across Canada and adapted after every book. Free placement assessment. From CAD ${PLANS.one.price}/month.`;

type PageMeta = {
  /** Route path, for example "/privacy". Used for the canonical URL. */
  path: string;
  /** Page title without the brand. The root layout template adds " | <brand>". */
  title: string;
  description: string;
  /** Set false for pages that must stay out of search (for example /thank-you). */
  index?: boolean;
};

const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TITLE };

// Root metadata for src/app/layout.tsx. Canonical and URL are per route, so the 404 page does not inherit them.
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${BRAND}` },
  description: SITE_DESCRIPTION,
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, siteName: BRAND, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: INDEXABLE ? undefined : { index: false, follow: false },
};

function build(path: string, title: Metadata["title"], full: string, description: string, index: boolean): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    // A route's openGraph replaces the parent's, so the shared image is set here again.
    openGraph: { title: full, description, url: path, siteName: BRAND, type: "website", locale: "en_CA", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE] },
    // Set explicitly: a route's robots (even undefined) replaces the root value.
    robots: index && INDEXABLE ? undefined : { index: false, follow: false },
  };
}

// Home page (src/app/page.tsx): the full brand title and the site description.
export const homeMetadata: Metadata = build("/", { absolute: SITE_TITLE }, SITE_TITLE, SITE_DESCRIPTION, true);

// Other routes: title, description and canonical. Pass index: false to add noindex.
// Social image is the shared one from src/app/opengraph-image.tsx.
export function pageMetadata({ path, title, description, index = true }: PageMeta): Metadata {
  return build(path, title, `${title} | ${BRAND}`, description, index);
}
