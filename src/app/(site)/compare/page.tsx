import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { ComparePage } from "@/components/compare-page";

// Indexable like the home page: no index: false, and listed in sitemap.ts.
export const metadata = pageMetadata({
  path: "/compare",
  title: `How ${BRAND} compares`,
  description: `${BRAND} side by side with private tutors, learning centres and online learning platforms: how personal each one is, the plan, help when they're stuck, the gaps you see, screen time and cost.`,
});

export default function Compare() {
  return <ComparePage />;
}
