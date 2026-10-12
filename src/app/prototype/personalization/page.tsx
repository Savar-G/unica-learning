// Round r18 prototype: the home page with one "Personalization" variant after How it works.
// /prototype/personalization?v=a|b|c|d. Not on production and never indexed. Delete after Savar picks (D-096).
import { notFound } from "next/navigation";
import { Landing } from "@/components/landing";
import { Personalization, type PersonalizationVariant } from "@/components/personalization";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  path: "/prototype/personalization",
  title: "Personalization prototype",
  description: "Design round r18.",
  index: false,
});

const VARIANTS: PersonalizationVariant[] = ["a", "b", "c", "d"];

export default async function PersonalizationPrototype({ searchParams }: PageProps<"/prototype/personalization">) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { v } = await searchParams;
  const variant = VARIANTS.find((x) => x === v) ?? "a";
  return <Landing look="warm" afterHow={<Personalization variant={variant} />} />;
}
