import { LIST_MAX, listNextSteps, requireAdmin } from "@/lib/admin-store";
import { listOffset } from "@/lib/admin-view";
import { AdminFrame, More } from "@/components/admin";
import { CardsTable, WaitlistTable } from "@/components/admin-records";

export default async function NextStepsPage({ searchParams }: PageProps<"/admin/next-steps">) {
  const admin = await requireAdmin();
  const offset = listOffset(await searchParams, LIST_MAX);
  const { cards, waitlist } = await listNextSteps(admin, offset);
  return <AdminFrame email={admin.email} section="next-steps" title="Cards and waitlist">
    <p className="adm-note">A saved card is not a payment. When a child&apos;s first workbook ships, press &quot;Workbook shipped: start plan&quot;: the 2 free weeks begin, and Stripe charges CAD 50 on day 14, then the monthly price. Email the parent a reminder a few days before day 14. The dashboard shows who is paying.</p>
    <h2>Card setups</h2><CardsTable cards={cards.rows} />
    <h2>Waitlist</h2><WaitlistTable waitlist={waitlist.rows} />
    <More more={cards.more || waitlist.more} max={LIST_MAX} offset={offset} action="/admin/next-steps" />
  </AdminFrame>;
}
