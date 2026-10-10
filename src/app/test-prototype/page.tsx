// PROTOTYPE ONLY (branch site/assessment-test-prototype, ticket #60). Do not merge.
// Five variants of the child's test screens with fake data: /test-prototype?variant=A..E.
// Not in production: the route 404s there, and it is never indexed.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TestPrototype } from "@/components/test-prototype";

const SHOW = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const metadata: Metadata = { title: "Test prototype", robots: { index: false, follow: false } };

export default function Page() {
  if (!SHOW) notFound();
  return <TestPrototype />;
}
