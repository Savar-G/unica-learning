// The browser's Sentry reports arrive here through /monitoring (tunnelRoute in next.config.ts) and go on to Sentry
// (docs/sentry.md). The request is rebuilt first (bareRequest): no IP address, no referrer, no cookie goes on.
import { createSentryTunnelRoute } from "@sentry/nextjs/tunnel";
import { sentryDsn } from "@/lib/sentry-options";
import { bareRequest } from "@/lib/sentry-tunnel";

const tunnel = createSentryTunnelRoute({ allowedDsns: [sentryDsn(process.env)].filter(Boolean) });

export async function POST(request: Request): Promise<Response> {
  return tunnel.POST(bareRequest(request));
}
