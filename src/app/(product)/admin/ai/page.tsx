import { AdminFrame } from "@/components/admin-frame";
import { AiUsagePage } from "@/components/admin-ai-usage";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_AI_PATH, parseRange, periodFor, type UsageView } from "@/lib/admin-ai-usage";
import { openRouterBilling, readAiUsage } from "@/lib/admin-ai-usage-store";
import { spendConfig } from "@/lib/maya-spend";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: ADMIN_AI_PATH, title: "Admin: AI usage", description: "Admin area.", index: false });

// AI usage and cost (D-330): a glance, not a deep tool. One or two database function calls (the chosen period, and this
// month when the period is not the month, for the check against OpenRouter) and one request to OpenRouter for each key,
// all at once with a 5 second limit; no polling, no prefetch. Admins only: everyone else gets the site's 404.
export default async function AiUsageRoute({ searchParams }: PageProps<"/admin/ai">) {
  const query = await searchParams;
  const admin = await requireAdmin();
  const now = new Date().getTime();
  const period = periodFor(parseRange(query.range), now);
  const rate = spendConfig().usdToCad;
  const [usage, billing] = await Promise.all([
    readAiUsage(admin, period, true, rate).then((v): { view: UsageView } | { error: string } => ({ view: v }), () => ({ error: "AI usage could not be read. Try again in a moment." })),
    openRouterBilling(),
  ]);
  const view = "view" in usage ? usage.view : null;
  return (
    <AdminFrame email={admin.email} title="AI usage" lead="Account billing and recorded app costs, including testing." testNote="All families are included on this page, regardless of the global test-family switch.">
      <AiUsagePage view={view} period={period} rate={rate} billing={billing} error={"error" in usage ? usage.error : null} />
    </AdminFrame>
  );
}
