import { Suspense } from "react";
import { Landing } from "@/components/landing";
import { isOfferVariant } from "@/components/offer-prototype";
import { PrototypeSwitcher } from "@/components/offer-prototype-switcher";
import { homeMetadata } from "@/lib/metadata";
import { homeJsonLd } from "@/lib/structured-data";

export const metadata = homeMetadata;

// PROTOTYPE: ?variant=A..E picks how the 30% first-month offer is shown (offer-prototype.tsx).
export default async function Home({ searchParams }: PageProps<"/">) {
  const v = (await searchParams).variant;
  const offer = isOfferVariant(v) ? v : "A";
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()).replace(/</g, "\\u003c") }} />
      <Landing look="warm" offer={offer} />
      <Suspense><PrototypeSwitcher current={offer} /></Suspense>
    </>
  );
}
