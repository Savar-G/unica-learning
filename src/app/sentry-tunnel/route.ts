// The browser's Sentry reports arrive here through /monitoring (tunnelRoute in next.config.ts) and go on to Sentry
// (docs/sentry.md). The request is rebuilt first (bareRequest in src/lib/sentry-tunnel.ts): replay addresses are
// cleaned, and no IP address, referrer or cookie goes on. An envelope that cannot be read is refused.
import { createSentryTunnelRoute } from "@sentry/nextjs/tunnel";
import { sentryDsn } from "@/lib/sentry-options";
import { bareRequest } from "@/lib/sentry-tunnel";

const tunnel = createSentryTunnelRoute({ allowedDsns: [sentryDsn(process.env)].filter(Boolean) });

export async function POST(request: Request): Promise<Response> {
  const bare = await bareRequest(request).catch(() => null);
  if (!bare) return new Response("Invalid envelope", { status: 400 });
  return tunnel.POST(bare);
}
