import { receiveProviderUsage } from "@/lib/openrouter-usage-webhook";
import { insertProviderReceipts } from "@/lib/openrouter-provider-receipts-store";
import { UNICA_WORKSPACE_ID } from "@/lib/openrouter-workspace";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  if (process.env.OPENROUTER_USAGE_WORKSPACE_ID !== UNICA_WORKSPACE_ID) {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return receiveProviderUsage(request, {
    secret: process.env.OPENROUTER_USAGE_WEBHOOK_SECRET,
    workspaceId: UNICA_WORKSPACE_ID,
    write: insertProviderReceipts,
  });
}
