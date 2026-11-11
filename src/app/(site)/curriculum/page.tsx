import { JsonLd } from "@/components/json-ld";
import { pageJsonLd } from "@/lib/structured-data";
import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { CurriculumPage } from "@/components/curriculum-page";

const PAGE = {
  path: "/curriculum",
  title: `The ${BRAND} curriculum`,
  description: `How ${BRAND} is built: 30 levels from the BC math curriculum, Kindergarten to Grade 9, and what your child works on at each level.`,
};
export const metadata = pageMetadata(PAGE);

export default function Curriculum() {
  return (
    <>
      <JsonLd data={pageJsonLd(PAGE)} />
      <CurriculumPage />
    </>
  );
}
