import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { Story } from "@/components/story";

// Indexable like the home page: no index: false, and listed in sitemap.ts.
export const metadata = pageMetadata({
  path: "/our-story",
  title: `Why we built ${BRAND}`,
  description: `Meet Savar and Cedric, two friends from Vancouver who tutored kids in math and built ${BRAND}: personal, on paper, and affordable.`,
});

export default function OurStory() {
  return <Story />;
}
