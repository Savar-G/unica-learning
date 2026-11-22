// The browser's Sentry reports arrive here through the /monitoring rewrite in next.config.ts (tunnel in
// src/instrumentation-client.ts, docs/sentry.md) and go on to Sentry. The request is rebuilt first (bareRequest in
// src/lib/sentry-tunnel.ts): replay addresses are cleaned, and no IP address, referrer or cookie goes on. An envelope
// that cannot be read is refused.
import { createSentryTunnelRoute } from "@sentry/nextjs/tunnel";
import { sentryDsn } from "@/lib/sentry-options";
import { bareRequest } from "@/lib/sentry-tunnel";

// Upstream forwarding in @sentry/core aborts after 30 s; cap the route well below the 300 s Fluid Compute default.
export const maxDuration = 60;

const tunnel = createSentryTunnelRoute({ allowedDsns: [sentryDsn(process.env)].filter(Boolean) });

export async function POST(request: Request): Promise<Response> {
  const bare = await bareRequest(request).catch(() => null);
  if (!bare) return new Response("Invalid envelope", { status: 400 });
  return tunnel.POST(bare);
}
