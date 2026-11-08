"use client";

import { usePathname } from "next/navigation";
import { isParentPreviewPath } from "@/lib/parent-preview-path";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { mayCarryQrToken, redactUrlTokens } from "@/lib/url-tokens";

// Vercel Analytics for the whole site, with QR tokens kept out of every page view and event before it is sent
// (#301, review R349-4): a page's QR code is `/tutor/p/<token>`, and the token must never leave the site.
// Desk pages and any address that may hold a token (a /tutor path, or a sign-in redirect whose `next` holds a QR page)
// are not sent at all (review R349-5): Vercel also derives a route from the path, which could keep an encoded token.
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (isParentPreviewPath(event.url) || mayCarryQrToken(event.url)) return null;
  return { ...event, url: redactUrlTokens(event.url) };
}

type SpeedEvent = { type: "vital"; url: string; route?: string };

// Vercel Speed Insights (page load times) gets the same rule, and never a query or hash: a load time needs only the
// page, and a query can hold a Stripe session, a sign-in or unsubscribe token, or a reminder id.
export function scrubSpeedEvent<T extends SpeedEvent>(event: T): T | null {
  if (isParentPreviewPath(event.url) || mayCarryQrToken(event.url)) return null;
  let url = redactUrlTokens(event.url);
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    url = parsed.toString();
  } catch {
    url = url.replace(/[?#].*$/, "");
  }
  return { ...event, url };
}

export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname && isParentPreviewPath(pathname)) return null;
  return (
    <>
      <Analytics beforeSend={scrubAnalyticsEvent} />
      <SpeedInsights beforeSend={scrubSpeedEvent} />
    </>
  );
}
