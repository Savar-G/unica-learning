import { AdminFrame } from "@/components/admin-frame";
import { AiUsagePage } from "@/components/admin-ai-usage";
import { AdminProviderReceipts } from "@/components/admin-provider-receipts";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_AI_PATH, parseRange, periodFor, type UsageView } from "@/lib/admin-ai-usage";
import { readAiUsage } from "@/lib/admin-ai-usage-store";
import { readWorkspaceUsage } from "@/lib/openrouter-workspace-store";
import { providerReceiptPeriod, PROVIDER_RECEIPT_RANGES } from "@/lib/openrouter-provider-receipts";
import { readProviderReceipts } from "@/lib/openrouter-provider-receipts-store";
import { spendConfig } from "@/lib/maya-spend";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_AI_PATH, title: "Admin: AI usage", description: "Admin area.", index: false });

// Read Unica workspace usage, app costs and provider receipts independently after the admin gate.
// Workspace and app totals use the same selected period. Receipts keep their own period.
export default async function AiUsageRoute({ searchParams }: PageProps<"/admin/ai">) {
  const query = await searchParams;
  const admin = await requireAdmin();
  const now = new Date().getTime();
  const period = periodFor(parseRange(query.range), now);
  const providerPeriod = providerReceiptPeriod(query.providerRange, now);
  const providerRanges = PROVIDER_RECEIPT_RANGES.map((range) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "providerRange" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
    }
    params.set("providerRange", range.key);
    return { key: range.key, href: `${ADMIN_AI_PATH}?${params}`, label: range.label, current: range.key === providerPeriod.range };
  });
  const rate = spendConfig().usdToCad;
  const [usage, workspace, providerReceipts] = await Promise.all([
    readAiUsage(admin, period, true, rate).then((v): { view: UsageView } | { error: string } => ({ view: v }), () => ({ error: "AI usage could not be read. Try again in a moment." })),
    readWorkspaceUsage(period).catch(() => ({ status: "unavailable" as const, usage: null })),
    readProviderReceipts(admin, providerPeriod).catch(() => null),
  ]);
  const view = "view" in usage ? usage.view : null;
  return (
    <AdminFrame email={admin.email} title="AI usage" lead="Unica workspace charges and recorded app data, including testing." testNote="All families are included on this page, regardless of the global test-family switch.">
      <AiUsagePage view={view} period={period} rate={rate} workspace={workspace} error={"error" in usage ? usage.error : null} />
      <AdminProviderReceipts view={providerReceipts} periodLabel={providerPeriod.label} ranges={providerRanges} />
    </AdminFrame>
  );
}
