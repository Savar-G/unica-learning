"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { SupportPage } from "@/components/support-page";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // A page error the boundary caught never reaches the global handler, so it goes to Sentry here (docs/sentry.md).
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <SupportPage label="Page error" title="This page could not load.">
    <p className="lead" role="alert">Try to load the page again. If the error continues, return home.</p>
    <button type="button" className="btn" onClick={retry}>Try again</button>
  </SupportPage>;
}
