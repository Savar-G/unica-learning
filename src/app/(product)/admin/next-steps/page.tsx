import { LIST_MAX, listNextSteps, requireAdmin } from "@/lib/admin-store";
import { listOffset } from "@/lib/admin-view";
import { AdminFrame, More } from "@/components/admin";
import { CardsTable, WaitlistTable } from "@/components/admin-records";

export default async function NextStepsPage({ searchParams }: PageProps<"/admin/next-steps">) {
  const admin = await requireAdmin();
  const offset = listOffset(await searchParams, LIST_MAX);
  const { cards, waitlist } = await listNextSteps(admin, offset);
  return <AdminFrame email={admin.email} section="next-steps" title="Cards and waitlist">
    <p className="adm-note">For the shipping address, use &quot;Open in Stripe&quot; on the child&apos;s card setup and check Shipping details on the customer. If no shipping address is saved, ask the parent for it before mailing the workbook. A billing address is not a confirmed shipping address.</p>
    <p className="adm-note">A saved card is not a payment. Open the child&apos;s workbook 1 and save its delivery confirmation. Then press &quot;Workbook delivered: start free month&quot;. The 30-day free month begins at that confirmation. Adding a card, printing a workbook, and sending tracking details do not start it. Stripe charges the monthly price on day 30, then every month. Stripe emails the parent a reminder 7 days before day 30, with a link to manage or cancel the plan. The dashboard shows who is paying.</p>
    <h2>Card setups</h2><CardsTable cards={cards.rows} />
    <h2>Waitlist</h2><WaitlistTable waitlist={waitlist.rows} />
    <More more={cards.more || waitlist.more} max={LIST_MAX} offset={offset} action="/admin/next-steps" />
  </AdminFrame>;
}
