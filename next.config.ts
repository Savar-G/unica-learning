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
};

export default nextConfig;
