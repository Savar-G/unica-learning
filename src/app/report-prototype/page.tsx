import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { Nav as NavBar } from "@/ds";
import { ReportPrototype } from "@/components/report-prototype/report-prototype";

// PROTOTYPE (branch site/report-prototype, round r12, ticket #61): the parent's assessment report in 5 variations.
// Dev and preview deploys only; production returns 404, so the path stays hidden until the pilot.
export const metadata = pageMetadata({
  path: "/report-prototype",
  title: "Report prototype",
  description: "Prototype of the math placement report, with sample data.",
  index: false,
});

const HIDDEN = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";

export default function ReportPrototypePage() {
  if (HIDDEN) notFound();
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={[]} cta={<span className="rp-nav-acct">Priya&apos;s account</span>} />
      <main id="main" className="rp-main">
        <ReportPrototype />
      </main>
    </div>
  );
}
