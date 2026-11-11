import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { dashboardRows, familyProduction, getParent, requireAdmin, testAccountState } from "@/lib/admin-store";
import { ADMIN_PATH, when } from "@/lib/admin-view";
import { buildDashboard } from "@/lib/admin-dashboard";
import { buildBooks } from "@/lib/admin-production";
import { childPlan, familyJourney, familyNextSteps, familyTimeline, latestTest } from "@/lib/admin-family-page";
import { workbookRunner } from "@/lib/workbook-ai";
import { AdminFrame } from "@/components/admin-frame";
import { TestTag, TestsTable } from "@/components/admin";
import { CardsTable, EmailTable, WaitlistTable } from "@/components/admin-records";
import { ChildCard, FamilyHead, FamilyTimeline, SectionHead } from "@/components/admin-family-page";
import { DeleteFamily } from "@/components/delete-family";
import { TestAccount } from "@/components/test-account";
import { ChatFamily } from "@/components/chat-family";
import { PlanCancelRecovery } from "@/components/plan-cancel-recovery";
import { openFamilyCancels } from "@/lib/plan-cancel-admin-server";
import { chatFamilyState, chatSwitchText } from "@/lib/admin-maya-chat";

/** Maya chat is for children in Grade 3 and up. */
const CHAT_GRADE = 3;

// One family (D-313, D-315): a head card (where the family is on the board's stages, the one next step for the team,
// the contact), one card per child (latest test, current workbook, plan, Maya chat), the family's timeline, the tables
// still worth comparing, then the team's actions with the deletion in its own danger area. A detail page: test families
// always show here.
export default async function ParentPage({ params }: PageProps<"/admin/parents/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  // the family's stage and payment, the same way the dashboard works them out (D-099). The related reads run at once,
  // but the family decides first: an unknown family is a 404 even when another read failed.
  if (!isUuid(id)) notFound();
  const now = new Date();
  const others = Promise.all([dashboardRows(admin), testAccountState(admin, id), chatFamilyState(admin, id), openFamilyCancels(admin, id), familyProduction(admin, id, now)]);
  others.catch(() => {});
  const family = await getParent(admin, id);
  if (!family) notFound();
  const [rows, test, chat, cancels, production] = await others;
  const p = family.parent;
  // The dashboard's own families and Needs you list: the next step uses the same rules (real families only).
  const d = buildDashboard(rows, "7d", now, { withTests: true });
  const f = d.families.find((x) => x.id === p.id) ?? null;
  const isTest = f?.test ?? (test.marked || test.admin);
  const books = buildBooks({
    ...production, tests: { show: true, isTest: () => isTest },
    children: family.children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name })), parents: [{ id: p.id, name: p.name }],
  }, now);
  const runner = workbookRunner();
  const source = Object.entries(p.source).map(([k, v]) => `${k}: ${v}`).join(", ");
  const people = <T extends { child_id: string }>(r: T) => ({ ...r, parent: p, child: family.children.find((c) => c.id === r.child_id) ?? null });
  const timeline = f ? familyTimeline(f) : [];
  const kids = [...family.children].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return <AdminFrame email={admin.email} title={<>{p.name}<TestTag test={isTest} /></>} lead="Where this family is, what to do next, and everything that happened."
    actions={<>
      <Link className="btn ghost adm-btn" href={`${ADMIN_PATH}?family=${p.id}`} prefetch={false}>Open on Home</Link>
      <Link className="btn ghost adm-btn" href={`${ADMIN_PATH}/activity?family=${p.id}`} prefetch={false}>Open in the activity log</Link>
    </>}>
    <FamilyHead f={f} journey={f ? familyJourney(f) : null} next={f ? familyNextSteps(f, d.needs) : null} now={d.now} contact={[
      ["Email", <a key="email" href={`mailto:${p.email}`}>{p.email}</a>],
      ["Phone", p.phone ? <a key="phone" href={`tel:${p.phone}`}>{p.phone}</a> : "Not provided"],
      ["Postal code", p.postal ?? "-"],
      ["Joined (Pacific)", when(p.created_at)],
      ["Came from", source || "-"],
    ]} />
    <PlanCancelRecovery parentId={p.id} operations={cancels} />

    <section className="rec-sec" aria-labelledby="rec-children">
      <SectionHead id="rec-children" title="Children" count={kids.length} hint="Each child's latest test, current workbook and plan." />
      {kids.length === 0 ? <p className="adm-empty">No children yet.</p> : <div className="rec-children">
        {kids.map((c) => <ChildCard key={c.id} runner={runner} now={now} isTest={isTest} c={{
          id: c.id, parentId: c.parent_id, name: c.first_name, grade: c.grade, place: c.province === "other" ? "other curriculum" : c.province, addedAt: c.created_at,
          test: latestTest(f?.tests ?? [], c.id), tests: (f?.tests ?? []).filter((t) => t.childId === c.id).length,
          plan: childPlan(family.cards, c.id), book: books.find((b) => b.childId === c.id) ?? null,
          chat: c.grade < CHAT_GRADE ? "From Grade 3." : chat.listed ? "The family is on the chat list." : chat.test ? "Test family: chat works without the list." : "Not on the chat list.",
        }} />)}
      </div>}
    </section>

    <section className="rec-sec" aria-labelledby="rec-timeline">
      <SectionHead id="rec-timeline" title="Timeline" count={timeline.length} hint="Signup, tests, payment steps and emails, newest first. Pacific time." />
      <FamilyTimeline items={timeline} now={now} />
    </section>

    <section className="rec-sec" aria-labelledby="tests">
      <SectionHead id="tests" title="Tests" count={family.tests.length} hint="Every test, with its flags and AI reviews." />
      <TestsTable tests={family.tests} family />
    </section>
    <section className="rec-sec" aria-labelledby="cards">
      <SectionHead id="cards" title="Cards and plans" count={family.cards.length} hint="Start the free month here once workbook 1 is delivered." />
      <CardsTable cards={family.cards.map(people)} />
    </section>
    {family.waitlist.length > 0 && <section className="rec-sec" aria-labelledby="rec-waitlist">
      <SectionHead id="rec-waitlist" title="Waitlist" count={family.waitlist.length} />
      <WaitlistTable waitlist={family.waitlist.map(people)} />
    </section>}
    <section className="rec-sec" aria-labelledby="emails">
      <SectionHead id="emails" title="Email log" count={family.emails.length} hint="Reminders and unsubscribes, with tries and errors." />
      {family.emails.length === 0 ? <p className="adm-empty">No reminder emails or unsubscribes.</p>
        : <details className="rec-fold"><summary>Show the email log</summary><EmailTable emails={family.emails} /></details>}
    </section>

    <section className="rec-sec rec-team" aria-labelledby="rec-team">
      <SectionHead id="rec-team" title="Team actions" hint="Changes to how the site treats this family." />
      <div className="rec-team-grid">
        <div className="adm-card">
          <h3>Test family</h3>
          <TestAccount parentId={p.id} marked={test.marked} admin={test.admin} />
        </div>
        <div className="adm-card">
          <h3 id="maya-chat">Maya chat</h3>
          <p className="adm-note">{chatSwitchText()}</p>
          <ChatFamily parentId={p.id} listed={chat.listed} rehearsal={chat.rehearsal} test={chat.test} />
          <p className="adm-note">Only children in Grade 3 and up can chat, after a parent agrees to the Maya notice. <Link href={`${ADMIN_PATH}/maya-chat`}>See every family on the chat list</Link></p>
        </div>
      </div>
      <div className="rec-danger">
        <DeleteFamily parentId={p.id} email={p.email} />
      </div>
    </section>

    <details className="adm-tech">
      <summary>Technical details</summary>
      <p>Parent id: <span className="adm-mono">{p.id}</span></p>
      {family.children.map((c) => <p key={c.id}>{c.first_name}: <span className="adm-mono">{c.id}</span></p>)}
    </details>
  </AdminFrame>;
}
