import { pageMetadata } from "@/lib/metadata";
import { Rewards } from "@/components/rewards";

// Indexable like /our-story: listed in sitemap.ts and /llms.txt.
export const metadata = pageMetadata({
  path: "/rewards",
  title: "Rewards for kids",
  description: "Your child earns points for every finished workbook page and every full week of practice, and trades them for prizes you approve.",
});

export default function RewardsPage() {
  return <Rewards />;
}
