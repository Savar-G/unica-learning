import { AdminFrame } from "@/components/admin-frame";
import { AiUsagePage, parseAiUsageReport } from "@/components/admin-ai-usage";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_AI_PATH, parseRange, periodFor, type UsageView } from "@/lib/admin-ai-usage";
import { readAiUsage } from "@/lib/admin-ai-usage-store";
import { readWorkspaceUsage } from "@/lib/openrouter-workspace-store";
import { readProviderReceipts } from "@/lib/openrouter-provider-receipts-store";
import { readAiCostHistory } from "@/lib/ai-cost-history-store";
import { spendConfig } from "@/lib/maya-spend";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_AI_PATH, title: "Admin: AI usage", description: "Admin area.", index: false });

// Read Unica workspace usage, app costs and provider receipts independently after the admin gate.
// Historical exports are full snapshots with unknown row zones, separate from the period reads.
export default async function AiUsageRoute({ searchParams }: PageProps<"/admin/ai">) {
  const query = await searchParams;
  const admin = await requireAdmin();
  const now = new Date().getTime();
  const period = periodFor(parseRange(query.range), now);
  const rate = spendConfig().usdToCad;
  const report = parseAiUsageReport(query.report);
  const [usage, workspace, providerReceipts, history] = await Promise.all([
    readAiUsage(admin, period, true, rate).then((v): { view: UsageView } | { error: string } => ({ view: v }), () => ({ error: "AI usage could not be read. Try again in a moment." })),
    readWorkspaceUsage(period).catch(() => ({ status: "unavailable" as const, usage: null })),
    readProviderReceipts(admin, period).catch(() => null),
    report === "records" ? readAiCostHistory(admin, query.historicalExport).catch(() => null) : Promise.resolve(null),
  ]);
  const view = "view" in usage ? usage.view : null;
  return (
    <AdminFrame email={admin.email} title="AI usage" lead="AI costs for Unica Learning, including testing." testNote="All families are included on this page, regardless of the global test-family switch.">
      <AiUsagePage view={view} period={period} rate={rate} workspace={workspace} receipts={providerReceipts}
        report={report} history={history} historySelection={query.historicalExport === undefined ? undefined : typeof query.historicalExport === "string" ? query.historicalExport : ""}
        error={"error" in usage ? usage.error : null} />
    </AdminFrame>
  );
}
