import { AdminFrame } from "@/components/admin-frame";
import { AiUsagePage } from "@/components/admin-ai-usage";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_AI_PATH, monthPeriod, parseRange, periodFor, type UsageView } from "@/lib/admin-ai-usage";
import { openRouterMonthCheck, readAiUsage } from "@/lib/admin-ai-usage-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";
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
  const withTests = await showTestFamilies();
  const rate = spendConfig().usdToCad;
  // The check compares OpenRouter's month with the month we recorded, test families included, because OpenRouter bills them too.
  const month = monthPeriod(now);
  const sameAsMonth = period.range === "month" && withTests;
  const [usage, monthUsage, check] = await Promise.all([
    readAiUsage(admin, period, withTests, rate).then((v): { view: UsageView } | { error: string } => ({ view: v }), () => ({ error: "AI usage could not be read. Try again in a moment." })),
    sameAsMonth ? Promise.resolve(null) : readAiUsage(admin, month, true, rate).catch(() => null),
    openRouterMonthCheck(),
  ]);
  const view = "view" in usage ? usage.view : null;
  const monthRecordedUsd = sameAsMonth ? view?.totals.costUsd ?? null : monthUsage?.totals.costUsd ?? null;
  return (
    <AdminFrame email={admin.email} title="AI usage" lead="Where the AI cost comes from: which features, which models, which families." testNote={withTests && "Test families are showing, and on this page they are counted in the numbers."}>
      <AiUsagePage view={view} period={period} rate={rate} check={check} monthRecordedUsd={monthRecordedUsd} error={"error" in usage ? usage.error : null} />
    </AdminFrame>
  );
}
