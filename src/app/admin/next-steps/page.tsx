import { LIST_MAX, listNextSteps, requireAdmin } from "@/lib/admin-store";
import { listOffset } from "@/lib/admin-view";
import { AdminFrame, More } from "@/components/admin";
import { CardsTable, WaitlistTable } from "@/components/admin-records";

export default async function NextStepsPage({ searchParams }: PageProps<"/admin/next-steps">) {
  const admin = await requireAdmin();
  const offset = listOffset(await searchParams, LIST_MAX);
  const { cards, waitlist } = await listNextSteps(admin, offset);
  return <AdminFrame email={admin.email} section="next-steps" title="Cards and waitlist">
    <p className="adm-note">A saved card is not a payment: nothing is charged until you start the Stripe subscription. The dashboard shows who is paying.</p>
    <h2>Card setups</h2><CardsTable cards={cards.rows} />
    <h2>Waitlist</h2><WaitlistTable waitlist={waitlist.rows} />
    <More more={cards.more || waitlist.more} max={LIST_MAX} offset={offset} action="/admin/next-steps" />
  </AdminFrame>;
}
