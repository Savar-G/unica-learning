import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { Story } from "@/components/story";

// Indexable like the home page: no index: false, and listed in sitemap.ts.
export const metadata = pageMetadata({
  path: "/our-story",
  title: `Why we built ${BRAND}`,
  description: `${BRAND} is made in Vancouver by two students who grew up on workbooks. Personal, on paper, and affordable.`,
});

export default function OurStory() {
  return <Story />;
}
