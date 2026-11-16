import { receiveProviderUsage } from "@/lib/openrouter-usage-webhook";
import { insertProviderReceipts } from "@/lib/openrouter-provider-receipts-store";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  return receiveProviderUsage(request, {
    secret: process.env.OPENROUTER_USAGE_WEBHOOK_SECRET,
    workspaceId: process.env.OPENROUTER_USAGE_WORKSPACE_ID,
    write: insertProviderReceipts,
  });
}
