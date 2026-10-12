import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/site";
import { SupportPage } from "@/components/support-page";

export const metadata: Metadata = {
  title: "Page not found",
  description: `This ${BRAND} page could not be found. Return home to see our math learning program.`,
  robots: { index: false, follow: false },
  openGraph: { title: `Page not found | ${BRAND}`, description: `This ${BRAND} page could not be found.` },
  twitter: { card: "summary_large_image", title: `Page not found | ${BRAND}`, description: `This ${BRAND} page could not be found.` },
};

export default function NotFound() {
  return <SupportPage label="404" title="This page could not be found.">
    <p className="lead">The address may have changed. You can return home to see our math learning program.</p>
    <Link className="btn" href="/">Back to home <span aria-hidden="true">→</span></Link>
  </SupportPage>;
}
