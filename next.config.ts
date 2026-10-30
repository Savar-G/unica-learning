import type { NextConfig } from "next";

const POSTHOG = process.env.NEXT_PUBLIC_POSTHOG_INGEST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS = POSTHOG.replace(".i.posthog.com", "-assets.i.posthog.com");

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
  },
  // First-party proxy so ad blockers do not drop funnel events.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
  // The workbook renderer (#309) runs the serverless Chromium build, whose compressed browser files the trace does not
  // find, and embeds the template's fonts.
  outputFileTracingIncludes: {
    "/api/workbook-render-check": ["./node_modules/@sparticuz/chromium/bin/**", "./src/ds/fonts/Geist.woff2", "./src/ds/fonts/GeistMono.woff2"],
  },
  // Pages whose address can hold an id or a token (a Stripe session, a report id, a sign-in or unsubscribe token) send
  // only the origin as the referrer, so the next page, and any tag on it, never sees the full address (D-126).
  async headers() {
    const originOnly = [{ key: "Referrer-Policy", value: "strict-origin" }];
    return ["/thank-you", "/account/:path*", "/auth/:path*", "/sign-in/:path*", "/unsubscribe"].map((source) => ({ source, headers: originOnly }));
  },
};

export default nextConfig;
