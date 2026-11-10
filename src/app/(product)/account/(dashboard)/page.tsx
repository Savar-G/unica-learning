import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { startWhen, familyZone, familyProvince } from "@/lib/family-time";
import { CURRICULA } from "@/lib/signup";
import { gradeLabel } from "@/lib/assessment/grades";
import type { StartState } from "@/lib/assessment";
import { stateFor } from "@/lib/test-attempt";
import { parentStartStates } from "@/lib/test-attempt-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isPhone } from "@/lib/account-server";
import { reportPath } from "@/lib/report-view";
import { reportLateNow } from "@/lib/report-late";
import { fromRow, LEARNING_COLUMNS, learningPath } from "@/lib/learning-style";
import { pinIsSet } from "@/lib/parent-pin-server";
import { workbookStore } from "@/lib/workbook-store";
import type { WorkbookSummary } from "@/lib/workbook-content";
import { AddChild, SaveTimeZone, SendLink, SignOut, StartTest, TrackOnce } from "@/components/account";
import { parentChatUsage } from "@/lib/maya-chat-server";
import { mayaNoticeDueForFamily } from "@/lib/maya-notice-server";
import { PlanClosedNote, closedNoteFor } from "@/components/plan-closed-note";
import { DeskRow, MayaNoticeCard, MayaChatRow } from "@/components/parent-home-rows";
import { ParentDashboardHome } from "@/components/parent-dashboard-home";
import { dashboardOverview, parentDashboard } from "@/lib/parent-dashboard-server";
import { openingPath } from "@/lib/parent-assessment";
import { pickChild, signInPath } from "@/lib/parent-shell";
import { SupportPage } from "@/components/support-page";
import { scanPagesAccess } from "@/lib/scan-pages-access";
import { latestParentMayaNotes } from "@/lib/parent-maya-notes";
import { NoteCard } from "@/components/parent-maya-notes";

export const metadata = pageMetadata({
  path: "/account",
  title: "Your account",
  description: "Your children and their free math assessment.",
  index: false,
});

// The parent's children, read with their own session, so row-level security returns only their rows.
// On a phone the test cannot start: the child takes it on a laptop or tablet, and the parent emails themselves a
// one-time sign-in link for that device (D-082, #63). A parent new from Google has no row yet and finishes first.
export default async function Account({ searchParams }: PageProps<"/account">) {
  const db = await sessionClient();
  const parentUser = await parentId(db);
  const query = await searchParams;
  // A link to one child's Overview (the monthly email, #563) comes back to that child after sign-in.
  if (!parentUser) redirect(signInPath(typeof query.child === "string" ? query.child : null));
  // The dashboard (#551), for the families its switch opens to. A child whose stage opens on the report goes there (#552).
  const dashboard = await parentDashboard();
  const addressed = typeof query.child === "string" ? query.child : null;
  const opening = dashboard && pickChild(dashboard.children, addressed, dashboard.remembered);
  const report = opening && openingPath(opening, query);
  if (report) redirect(report);
  const [{ data: parent }, { data: kids }, states, { data: reports }, { data: cards }] = await Promise.all([
    db.from("parents").select("name, email, postal, time_zone").maybeSingle(),
    db.from("children").select(`id, created_at, first_name, grade, province, ${LEARNING_COLUMNS}`).order("created_at").order("id"),
    // Start, continue, start again after 24 hours, or wait 30 days after a completed test (#72).
    parentStartStates(parentUser),
    // Reports (#65), oldest first, each with the time its test finished.
    db.from("reports").select("id, child_id, assessment:assessments(completed_at)").order("created_at"),
    // A saved card opens the plan page, where the parent can see or cancel the plan.
    db.from("card_setups").select("card_saved_at"),
  ]);
  if (!parent) redirect("/account/finish");
  // While a child waits for the next test, the link opens the report of the test just done (none while it is built).
  // In every other state it opens the child's newest report.
  const testReport = new Map((reports ?? []).map((r) => [`${r.child_id}@${Date.parse(r.assessment?.completed_at ?? "")}`, reportPath(r.id)]));
  const newestReport = new Map((reports ?? []).map((r) => [r.child_id, reportPath(r.id)]));
  const reportFor = (id: string, state: StartState) => (state.kind === "wait" ? testReport.get(`${id}@${state.completedAt}`) : newestReport.get(id));
  // #771: with no report an hour after the test, the line under the button says it is late.
  const lateFor = (id: string, state: StartState) => reportLateNow(state, reportFor(id, state));
  const phone = isPhone(await headers());
  const { sent, password, existing, pin, desk } = query;

  const children = kids ?? [];
  const timeZone = familyZone({ timeZone: parent.time_zone, postal: parent.postal, province: familyProvince(children) });
  // Parent home (#301): each child's current workbook (the newest shipped one) and the desk, which needs the PIN.
  // D-293: show only existing gated chat usage and saved notes. Voice follows later.
  const [current, pinSet, chats, scansEnabled, notes, noticeDue, planClosed] = await Promise.all([
    currentWorkbooks(db, children.map((c) => c.id)), pinIsSet(parentUser),
    parentChatUsage(db, parentUser, children, timeZone), scanPagesAccess(parentUser), latestParentMayaNotes(db, parentUser, children.map((c) => c.id)), mayaNoticeDueForFamily(parentUser, children), closedNoteFor(parentUser, !!dashboard),
  ]);
  // Everyone else gets today's Parent home below.
  if (dashboard) {
    const overview = await dashboardOverview(dashboard, addressed);
    const facts = { dashboard, overview, kids: children, phone, sent: sent === "1", timeZone, states, reportFor, lateFor, current, chats, notes, scansEnabled, noticeDue };
    return <ParentDashboardHome {...facts} addressChild={addressed} alerts={{ password: password === "1", pin: pin === "1", deskError: desk === "error", existing: existing === "1" }} parentEmail={parent.email}
      note={planClosed ? <PlanClosedNote closed={planClosed.closed} dashboardOpen={planClosed.dashboardOpen} on="home" /> : undefined} />;
  }
  return (
    <SupportPage label="Your account" title={`Hi, ${parent.name.split(" ")[0]}.`}>
      {planClosed && <PlanClosedNote closed={planClosed.closed} dashboardOpen={planClosed.dashboardOpen} on="home" />}
      {password === "1" && <p role="status" className="acct-alert acct-saved">Your password is saved.</p>}
      {pin === "1" && <p role="status" className="acct-alert acct-saved">Your PIN is saved.</p>}
      {desk === "error" && <p role="status" className="acct-alert">We cannot open the desk right now. Try again in a moment.</p>}
      {existing === "1" && <p role="status" className="acct-alert acct-saved">This email already has an account, so the code signed you in. Nothing in your account changed. To add a child, use Add another child.</p>}
      {phone ? (
        <div className="acct-card acct-phone">
          <TrackOnce event="phone_screen" />
          <h2>Use a laptop or tablet for the test.</h2>
          <p>A phone screen is too small for the test. We email you a sign-in link: open it on the laptop or tablet, and it opens your child&apos;s start screen. The link works once and only for 24 hours.</p>
          {sent === "1" && <p role="status" className="acct-sent">We sent the link for {children[0]?.first_name ?? "your child"} to <b>{parent.email}</b>.</p>}
        </div>
      ) : (
        <p className="lead">Your child takes the test alone, on this device, in one sitting. Start when your child is ready.</p>
      )}
      {noticeDue && current.size > 0 && <MayaNoticeCard />}
      <ul className="acct-kids">
        {children.map((c, i) => (
          <li key={c.id} className="acct-kid">
            <span>
              <b>{c.first_name}</b><span className="small">{gradeLabel(c.grade)} · {CURRICULA[c.province]}</span>
              {/* #126: after the first report, the parent can answer or change how the child learns. */}
              {newestReport.has(c.id) && <Link className="small acct-learn" href={learningPath(c.id)}>
                {fromRow(c) ? `How ${c.first_name} learns: change answers` : `Tell us how ${c.first_name} learns`}
              </Link>}
            </span>
            {/* Inside the 30 days after a test there is nothing to open on the laptop: the phone shows the date too (#72). */}
            {phone && stateFor(states, c.id).kind !== "wait"
              ? <SendLink childId={c.id} name={c.first_name} sent={sent === "1" && i === 0} />
              : <StartTest childId={c.id} name={c.first_name} state={stateFor(states, c.id)} when={startWhen(stateFor(states, c.id), timeZone)} report={reportFor(c.id, stateFor(states, c.id))} late={lateFor(c.id, stateFor(states, c.id))} />}
            {current.has(c.id) && <DeskRow childId={c.id} name={c.first_name} workbook={current.get(c.id)!} pinSet={pinSet} />}
            {chats.has(c.id) && <MayaChatRow name={c.first_name} chat={chats.get(c.id)!} />}
            {notes.has(c.id) && <NoteCard note={notes.get(c.id)!} name={c.first_name} zone={timeZone} latest />}
          </li>
        ))}
      </ul>
      {scansEnabled && <p><Link className="btn" href="/account/scan">Scan pages <span aria-hidden="true">→</span></Link></p>}
      {cards?.some((c) => c.card_saved_at) && <p><Link className="btn ghost" href="/account/plan">Manage or cancel plan</Link></p>}
      {!parent.time_zone && <SaveTimeZone />}
      <AddChild province={children.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <Link href="/account/password">Add or change your password</Link>. <Link href="/account/pin">Set or change your PIN</Link>. <Link href="/account/maya-notice">Maya notice</Link>. <SignOut /></p>
    </SupportPage>
  );
}

/** Each child's newest shipped workbook. Read with the parent's session: row-level security gives only shipped ones. */
async function currentWorkbooks(db: Awaited<ReturnType<typeof sessionClient>>, childIds: string[]): Promise<Map<string, WorkbookSummary>> {
  const store = workbookStore(db);
  try {
    const lists = await Promise.all(childIds.map((id) => store.childWorkbooks(id)));
    return new Map(lists.flatMap((list) => list.filter((w) => w.status === "shipped").slice(0, 1).map((w) => [w.childId, w] as const)));
  } catch (error) {
    console.error("[account] workbooks load failed", error instanceof Error ? error.message : error);
    return new Map();
  }
}
