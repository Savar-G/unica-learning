import { Landing } from "@/components/landing";
import { HeroPrototype, pickVariant } from "@/components/hero-prototype/variants";
import { homeMetadata } from "@/lib/metadata";
import { homeJsonLd } from "@/lib/structured-data";

export const metadata = homeMetadata;

// PROTOTYPE (throwaway): hero variants on `/?variant=`, off in Vercel production.
const PROTOTYPE_ON = process.env.VERCEL_ENV !== "production";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const variant = PROTOTYPE_ON ? pickVariant((await searchParams).variant) : null;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()).replace(/</g, "\\u003c") }} />
      <Landing look="warm" hero={variant ? <HeroPrototype variant={variant} /> : undefined} />
    </>
  );
}
