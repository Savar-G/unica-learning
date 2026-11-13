import { loadAdminBook1Baselines } from "@/lib/admin-book1-baselines-server";
import { loadAdminScanHolds } from "@/lib/admin-scan-progress-server";
import { LIST_MAX, listNextSteps, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { listOffset } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";
import { More } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { PlansView } from "@/components/admin-plans";

export const metadata = pageMetadata({ path: "/admin/next-steps", title: "Admin: plans and delivery", description: "Admin area.", index: false });

// Workbooks > Plans and delivery (D-313, D-315; it was "Cards and waitlist"): what needs the team first (free months to
// start, plan starts to check, books on hold, Book 1 records to save (#870), workbook emails to check), the families by plan state, then every saved card
// and the waitlist (src/components/admin-plans.tsx). Test families follow the "Show test families" switch and never count.
export default async function NextStepsPage({ searchParams }: PageProps<"/admin/next-steps">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const offset = listOffset(query, LIST_MAX);
  const view = await loadTestFamilies(admin);
  // Each read leaves the hidden test families out in the database, before its limit.
  const [{ cards, waitlist }, holds, baselines] = await Promise.all([listNextSteps(admin, offset, view.hidden), loadAdminScanHolds(admin, view), loadAdminBook1Baselines(admin, view)]);
  return <AdminFrame email={admin.email} title="Plans and delivery" lead="Start each free month after Book 1 arrives, and keep every saved card and the waitlist in view." testNote={view.show}>
    <PlansView cards={cards.rows} waitlist={waitlist.rows} holds={holds} baselines={baselines} show={view.show} isTest={view.isTest} now={new Date()} cardsMore={cards.more} waitMore={waitlist.more} />
    <More more={cards.more || waitlist.more} max={LIST_MAX} offset={offset} action="/admin/next-steps" />
  </AdminFrame>;
}
