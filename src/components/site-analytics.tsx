"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { redactUrlTokens } from "@/lib/url-tokens";

// Vercel Analytics for the whole site, with QR tokens taken out of every page view and event address before it is sent
// (#301, review R349-4): a page's QR code is `/tutor/p/<token>`, and the token must never leave the site.
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactUrlTokens(event.url) };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={scrubAnalyticsEvent} />;
}
