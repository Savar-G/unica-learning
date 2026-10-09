"use client";

import { SupportPage } from "@/components/support-page";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <SupportPage label="Page error" title="This page could not load.">
    <p className="lead" role="alert">Try to load the page again. If the error continues, return home.</p>
    <button type="button" className="btn" onClick={retry}>Try again</button>
  </SupportPage>;
}
