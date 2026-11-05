import type { NextConfig } from "next";

const POSTHOG = process.env.NEXT_PUBLIC_POSTHOG_INGEST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS = POSTHOG.replace(".i.posthog.com", "-assets.i.posthog.com");

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // 90 is for photos of people (the founders photo on /our-story), where 75 looks soft.
    qualities: [75, 90],
  },
  // First-party proxy so ad blockers do not drop funnel events.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
  // The workbook renderer (#309; the render check and the workbook job, #312) and the monthly summary PDF (#562) run the
  // serverless Chromium build, whose compressed browser files the trace does not find, embed the template's fonts, and
  // carry the licence notices of what they run and embed. Turbopack matches the keys as globs, where "[id]" unescaped is a
  // character class: built with the brackets unescaped, the traces of the three dynamic routes held no Chromium file and
  // no notice (route.js.nft.json in .next), so the brackets are escaped.
  outputFileTracingIncludes: Object.fromEntries(["/api/workbook-render-check", "/api/admin/children/[id]/workbook-runs", "/api/workbook-runs/[id]/resume", "/api/account/children/[id]/monthly-summary"].map((route) => [route.replace(/[[\]]/g, "\\$&"), [
    "./node_modules/@sparticuz/chromium/bin/**", "./src/ds/fonts/Geist.woff2", "./src/ds/fonts/GeistMono.woff2",
    "./THIRD_PARTY_NOTICES.md", "./node_modules/@sparticuz/chromium/LICENSE", "./node_modules/qrcode/license",
    "./node_modules/jsqr/LICENSE", "./node_modules/sharp/LICENSE",
  ]])),
  // Pages whose address can hold an id or a token (a Stripe session, a report id, a sign-in or unsubscribe token) send
  // only the origin as the referrer, so the next page, and any tag on it, never sees the full address (D-126).
  async headers() {
    const originOnly = [{ key: "Referrer-Policy", value: "strict-origin" }];
    return ["/thank-you", "/account/:path*", "/auth/:path*", "/sign-in/:path*", "/unsubscribe"].map((source) => ({ source, headers: originOnly }));
  },
};

export default nextConfig;
