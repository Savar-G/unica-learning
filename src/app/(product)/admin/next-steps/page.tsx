import Link from "next/link";
import { PLAN_REMINDER_ADMIN } from "@/lib/plan-reminder";
import { ScanHold } from "@/components/admin-scan-progress";
import { loadAdminScanHolds } from "@/lib/admin-scan-progress-server";
import { LIST_MAX, listNextSteps, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { listOffset } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";
import { More, TestTag } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { CardsTable, WaitlistTable } from "@/components/admin-records";

export const metadata = pageMetadata({ path: "/admin/next-steps", title: "Admin: plans and delivery", description: "Admin area.", index: false });

// Plans and delivery (D-313; it was "Cards and waitlist"): saved cards, plan starts, books on hold and the waitlist.
// Test families follow the "Show test families" switch.
export default async function NextStepsPage({ searchParams }: PageProps<"/admin/next-steps">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const offset = listOffset(query, LIST_MAX);
  const view = await loadTestFamilies(admin, query);
  const [{ cards, waitlist }, holds] = await Promise.all([listNextSteps(admin, offset, view.hidden), loadAdminScanHolds(admin)]);
  const held = holds.rows.filter((h) => view.show || !h.testFamily);
  const isTest = view.show ? view.isTest : undefined;
  return <AdminFrame email={admin.email} title="Plans and delivery" lead="Saved cards, free months, books on hold and the waitlist." testNote={view.show}>
    <p className="adm-note">For the shipping address, use &quot;Open in Stripe&quot; on the child&apos;s card setup and check Shipping details on the customer. If no shipping address is saved, ask the parent for it before mailing the workbook. A billing address is not a confirmed shipping address.</p>
    <p className="adm-note">A saved card is not a payment. Open the child&apos;s workbook 1 and save its delivery confirmation. Then press &quot;Workbook delivered: start plan&quot;. The family&apos;s one 30-day free window begins with its first child&apos;s plan start. A sibling who starts inside it has the same trial end. A sibling who starts after it pays immediately. Adding a card, printing a workbook, and sending tracking details do not start it. Stripe charges the monthly price on day 30, then every month. {PLAN_REMINDER_ADMIN}, with a link to manage or cancel the plan. Home shows who is paying.</p>
    <h2>Books on hold</h2>
    {holds.unavailable && <p role="status">Some books on hold could not be read. Check again.</p>}
    {!held.length && !holds.unavailable && <p>No books on hold.</p>}
    {held.map(hold => <section key={hold.workbookId}><Link href={`/admin/children/${hold.childId}`}>Open child and workbook {hold.number}</Link><TestTag test={hold.testFamily} /><ScanHold number={hold.number} /></section>)}
    {holds.more && <p>More books may be on hold. Only the newest are shown here. Open each child to check the rest.</p>}
    <h2>Card setups</h2><CardsTable cards={cards.rows} isTest={isTest} />
    <h2>Waitlist</h2><WaitlistTable waitlist={waitlist.rows} isTest={isTest} />
    <More more={cards.more || waitlist.more} max={LIST_MAX} offset={offset} action="/admin/next-steps" />
  </AdminFrame>;
}
