import Link from "next/link";
import { notFound } from "next/navigation";
import { dashboardRows, getParent, requireAdmin, testAccountState } from "@/lib/admin-store";
import { ADMIN_PATH, when } from "@/lib/admin-view";
import { STAGE_ACTION, at, buildFamilies, since } from "@/lib/admin-dashboard";
import { AdminFrame } from "@/components/admin";
import { StageChip } from "@/components/admin-dashboard-parts";
import { FamilyRecords, RecordFacts } from "@/components/admin-records";
import { DeleteFamily } from "@/components/delete-family";
import { TestAccount } from "@/components/test-account";

export default async function ParentPage({ params }: PageProps<"/admin/parents/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  const family = await getParent(admin, id);
  if (!family) notFound();
  const p = family.parent;
  // the family's stage and payment, the same way the dashboard works them out (D-099)
  const [rows, test] = await Promise.all([dashboardRows(admin), testAccountState(admin, p.id)]);
  const f = buildFamilies(rows).find((x) => x.id === p.id);
  const now = new Date().toISOString();
  return <AdminFrame email={admin.email} section="parents" title={p.name}>
    <RecordFacts facts={[
      ["Email", <a key="email" href={`mailto:${p.email}`}>{p.email}</a>], ["Postal code", p.postal], ["Joined (Pacific)", when(p.created_at)],
      ["Stage", f ? <span key="stage"><StageChip stage={f.stage} /> <span className="adm-sub">{since(f.stageAt, now)}, since {at(f.stageAt)}</span></span> : "-"],
      ["Next", f ? STAGE_ACTION[f.stage] : "-"],
      ["Payment", f?.subscription ? `Stripe subscription ${f.subscription.status} since ${at(f.subscription.since)}` : f?.card?.savedAt ? "Card saved, no subscription yet" : f?.card ? "Opened the payment page, no card" : "No card"],
      ["Last email", f?.lastEmail ? `${f.lastEmail.subject} (${f.lastEmail.status}, ${at(f.lastEmail.at)})` : "None"],
      ["Reminders", f?.unsubscribed ? "Off: the parent unsubscribed" : "On"],
      ["Source", Object.entries(p.source).map(([k, v]) => `${k}: ${v}`).join(", ") || "-"], ["Parent id", p.id],
    ]} />
    <p className="adm-row"><Link href={`${ADMIN_PATH}?family=${p.id}${test.marked || test.admin ? "&tests=1" : ""}`}>Open in the dashboard</Link><Link href={`${ADMIN_PATH}/activity?family=${p.id}${test.marked || test.admin ? "&tests=1" : ""}`}>Open in the activity log</Link></p>
    <TestAccount parentId={p.id} marked={test.marked} admin={test.admin} />
    <FamilyRecords family={family} />
    <DeleteFamily parentId={p.id} email={p.email} />
  </AdminFrame>;
}
