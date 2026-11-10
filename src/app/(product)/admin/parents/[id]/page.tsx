import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { dashboardRows, getParent, requireAdmin, testAccountState } from "@/lib/admin-store";
import { ADMIN_PATH, when } from "@/lib/admin-view";
import { STAGE_ACTION, at, buildFamilies, nextReminderText, paymentText, since } from "@/lib/admin-dashboard";
import { DELIVERY_WORDS } from "@/lib/delivery-state";
import { AdminFrame } from "@/components/admin-frame";
import { StageChip } from "@/components/admin-dashboard-parts";
import { FamilyRecords, RecordFacts } from "@/components/admin-records";
import { DeleteFamily } from "@/components/delete-family";
import { TestAccount } from "@/components/test-account";
import { ChatFamily } from "@/components/chat-family";
import { PlanCancelRecovery } from "@/components/plan-cancel-recovery";
import { openFamilyCancels } from "@/lib/plan-cancel-admin-server";
import { chatFamilyState, chatSwitchText } from "@/lib/admin-maya-chat";

// One family: its facts, stage and emails, whether it is a test family, its Maya chat access (D-313: set here, not on
// a page of its own), its records, and the deletion. A detail page: test families always show here.
export default async function ParentPage({ params }: PageProps<"/admin/parents/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  // the family's stage and payment, the same way the dashboard works them out (D-099). The related reads run at once,
  // but the family decides first: an unknown family is a 404 even when another read failed.
  if (!isUuid(id)) notFound();
  const others = Promise.all([dashboardRows(admin), testAccountState(admin, id), chatFamilyState(admin, id), openFamilyCancels(admin, id)]);
  others.catch(() => {});
  const family = await getParent(admin, id);
  if (!family) notFound();
  const [rows, test, chat, cancels] = await others;
  const p = family.parent;
  const f = buildFamilies(rows).find((x) => x.id === p.id);
  const now = new Date().toISOString();
  return <AdminFrame email={admin.email} title={p.name}>
    <RecordFacts facts={[
      ["Email", <a key="email" href={`mailto:${p.email}`}>{p.email}</a>], ["Postal code", p.postal ?? "-"], ["Joined (Pacific)", when(p.created_at)],
      ["Stage", f ? <span key="stage"><StageChip stage={f.stage} /> <span className="adm-sub">{since(f.stageAt, now)}, since {at(f.stageAt)}</span></span> : "-"],
      ["Next", f ? STAGE_ACTION[f.stage] : "-"],
      ["Payment", f ? paymentText(f) : "-"],
      ["Last email", f?.lastEmail ? `${f.lastEmail.subject} (${DELIVERY_WORDS[f.lastEmail.state]}, ${at(f.lastEmail.at)})` : "None"],
      ["Reminders", f?.unsubscribed ? "Off: the parent unsubscribed" : "On"],
      ["Next email", f?.nextReminders.length ? f.nextReminders.map((r) => nextReminderText(r, now)).join("; ") : "None planned"],
      ["Source", Object.entries(p.source).map(([k, v]) => `${k}: ${v}`).join(", ") || "-"],
    ]} />
    <p className="adm-row"><Link href={`${ADMIN_PATH}?family=${p.id}`}>Open on Home</Link><Link href={`${ADMIN_PATH}/activity?family=${p.id}`}>Open in the activity log</Link></p>
    <TestAccount parentId={p.id} marked={test.marked} admin={test.admin} />
    <section className="adm-card" aria-labelledby="maya-chat">
      <h2 id="maya-chat">Maya chat</h2>
      <p>{chatSwitchText()}</p>
      <ChatFamily parentId={p.id} listed={chat.listed} rehearsal={chat.rehearsal} test={chat.test} />
      <p className="adm-note">Only children in Grade 3 and up can chat, after a parent agrees to the Maya notice. <Link href={`${ADMIN_PATH}/maya-chat`}>See every family on the chat list</Link></p>
    </section>
    <FamilyRecords family={family} />
    <PlanCancelRecovery parentId={p.id} operations={cancels} />
    <DeleteFamily parentId={p.id} email={p.email} />
    <details className="adm-tech">
      <summary>Technical details</summary>
      <p>Parent id: <span className="adm-mono">{p.id}</span></p>
    </details>
  </AdminFrame>;
}
