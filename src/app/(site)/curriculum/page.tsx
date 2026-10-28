import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { CurriculumPage } from "@/components/curriculum-page";

// Draft (Oct 27, 2026): kept out of search until the founders sign off on the curriculum.
export const metadata = pageMetadata({
  path: "/curriculum",
  title: `The ${BRAND} curriculum`,
  description: `How ${BRAND} is built: 30 levels from the BC math curriculum, Kindergarten to Grade 9, and what your child works on at each level.`,
  index: false,
});

export default function Curriculum() {
  return <CurriculumPage />;
}
