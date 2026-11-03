import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { CurriculumPage } from "@/components/curriculum-page";
import { CurriculumPrototype } from "@/components/curriculum-prototype";

export const metadata = pageMetadata({
  path: "/curriculum",
  title: `The ${BRAND} curriculum`,
  description: `How ${BRAND} is built: 30 levels from the BC math curriculum, Kindergarten to Grade 9, and what your child works on at each level.`,
});

// PROTOTYPE: outside Vercel production, ?variant= switches between layouts (src/components/curriculum-prototype).
export default async function Curriculum({ searchParams }: { searchParams: Promise<{ variant?: string | string[] }> }) {
  if (process.env.VERCEL_ENV === "production") return <CurriculumPage />;
  const { variant } = await searchParams;
  return <CurriculumPrototype variant={typeof variant === "string" ? variant : "0"} />;
}
