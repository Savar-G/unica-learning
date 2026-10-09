import type { Metadata } from "next";
import Link from "next/link";
import { SupportPage } from "@/components/support-page";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This Pagewise page could not be found. Return home to see our math and reading workbooks.",
  robots: { index: false, follow: false },
  openGraph: { title: "Page not found | Pagewise", description: "This Pagewise page could not be found." },
  twitter: { card: "summary_large_image", title: "Page not found | Pagewise", description: "This Pagewise page could not be found." },
};

export default function NotFound() {
  return <SupportPage label="404" title="This page could not be found.">
    <p className="lead">The address may have changed. You can return home to see our math and reading workbooks.</p>
    <Link className="btn" href="/">Back to home <span aria-hidden="true">→</span></Link>
  </SupportPage>;
}
