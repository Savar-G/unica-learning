"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { mayCarryQrToken, redactUrlTokens } from "@/lib/url-tokens";

// Vercel Analytics for the whole site, with QR tokens kept out of every page view and event before it is sent
// (#301, review R349-4): a page's QR code is `/tutor/p/<token>`, and the token must never leave the site.
// Desk pages and any address that may hold a token (a /tutor path, or a sign-in redirect whose `next` holds a QR page)
// are not sent at all (review R349-5): Vercel also derives a route from the path, which could keep an encoded token.
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (mayCarryQrToken(event.url)) return null;
  return { ...event, url: redactUrlTokens(event.url) };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={scrubAnalyticsEvent} />;
}
