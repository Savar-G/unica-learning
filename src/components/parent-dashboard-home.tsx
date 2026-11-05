import Link from "next/link";
import { SendLink, StartTest, TrackOnce } from "@/components/account";
import { NoteCard } from "@/components/parent-maya-notes";
import { DemoMinutesLine, DeskText, MayaNoticeCard, MinutesRow } from "@/components/parent-home-rows";
import { SupportPage } from "@/components/support-page";
import type { StartState } from "@/lib/assessment";
import { gradeLabel } from "@/lib/assessment/grades";
import { startWhen, type FamilyZone } from "@/lib/family-time";
import { fromRow, learningPath, type LearningRow } from "@/lib/learning-style";
import type { ChatUsage } from "@/lib/maya-chat";
import type { ChildMinutes } from "@/lib/maya-minutes-server";
import type { ParentNote } from "@/lib/parent-maya-notes";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import { activeTab, pickChild, tabLinks } from "@/lib/parent-shell";
import { CURRICULA, type CurriculumId } from "@/lib/signup";
import { stateFor } from "@/lib/test-attempt";
import type { WorkbookSummary } from "@/lib/workbook-content";

/** A child row as Parent home reads it, with the learning card's columns. */
type Kid = { id: string; first_name: string; grade: number; province: CurriculumId } & LearningRow;

export interface DashboardHomeProps {
  dashboard: ParentDashboard;
  kids: readonly Kid[];
  addressChild: string | null;
  phone: boolean;
  sent: boolean;
  parentEmail: string;
  timeZone: FamilyZone;
  states: Parameters<typeof stateFor>[0];
  reportFor: (id: string, state: StartState) => string | undefined;
  current: ReadonlyMap<string, WorkbookSummary>;
  minutes: ReadonlyMap<string, ChildMinutes>;
  chats: ReadonlyMap<string, ChatUsage>;
  notes: ReadonlyMap<string, ParentNote>;
  scansEnabled: boolean;
  noticeDue: boolean;
  alerts: { password: boolean; pin: boolean; deskError: boolean; existing: boolean };
}

/**
 * The dashboard's home (#551): one child's part of Parent home, in the frame. It has no panels yet: #552 and #560 fill
 * it, and a panel with no data does not appear. The family's links are on the Account tab.
 */
export function ParentDashboardHome({ dashboard, kids, addressChild, phone, sent, parentEmail, timeZone, states, reportFor, current, minutes, chats, notes, scansEnabled, noticeDue, alerts }: DashboardHomeProps) {
  const view = pickChild(dashboard.children, addressChild, dashboard.remembered);
  const kid = kids.find((k) => k.id === view?.id);
  const links = tabLinks(view);
  const label = links.find((l) => l.tab === activeTab("/account", links))?.label ?? "Your account";
  const state = kid && stateFor(states, kid.id);
  // A sign-in link goes to the family's first child (Parent home says so too).
  const sentHere = sent && kid?.id === kids[0]?.id;
  // The Maya tab holds the minutes and the notes (#553). A child without it keeps them here.
  const mayaHere = !view?.tabs.includes("maya");
  return (
    <SupportPage label={label} title={kid?.first_name ?? "Your account"}>
      {alerts.password && <p role="status" className="acct-alert acct-saved">Your password is saved.</p>}
      {alerts.pin && <p role="status" className="acct-alert acct-saved">Your PIN is saved.</p>}
      {alerts.deskError && <p role="status" className="acct-alert">We cannot open the desk right now. Try again in a moment.</p>}
      {alerts.existing && <p role="status" className="acct-alert acct-saved">This email already has an account, so the code signed you in. Nothing in your account changed. To add a child, use Add another child.</p>}
      {noticeDue && current.size > 0 && <MayaNoticeCard />}
      {!kid && <p className="lead">Add a child on the <Link href="/account/settings">Account</Link> page to start.</p>}
      {kid && state && (
        <>
          {phone && state.kind !== "wait" && (
            <div className="acct-card acct-phone">
              <TrackOnce event="phone_screen" />
              <h2>Use a laptop or tablet for the test.</h2>
              <p>A phone screen is too small for the test. We email you a sign-in link: open it on the laptop or tablet, and it opens {kid.first_name}&apos;s start screen. The link works once and only for 24 hours.</p>
              {sentHere && <p role="status" className="acct-sent">We sent the link for {kid.first_name} to <b>{parentEmail}</b>.</p>}
            </div>
          )}
          {!phone && (view?.stage === "no_test" || view?.stage === "test_running") && <p className="lead">{kid.first_name} takes the test alone, on this device, in one sitting. Start when {kid.first_name} is ready.</p>}
          <ul className="acct-kids">
            <li className="acct-kid">
              <span>
                <b>The test</b><span className="small">{gradeLabel(kid.grade)} · {CURRICULA[kid.province]}</span>
                {view && view.reportIds.length > 0 && <Link className="small acct-learn" href={learningPath(kid.id)}>
                  {fromRow(kid) ? `How ${kid.first_name} learns: change answers` : `Tell us how ${kid.first_name} learns`}
                </Link>}
              </span>
              {phone && state.kind !== "wait"
                ? <SendLink key={kid.id} childId={kid.id} name={kid.first_name} sent={sentHere} />
                : <StartTest childId={kid.id} name={kid.first_name} state={state} when={startWhen(state, timeZone)} report={reportFor(kid.id, state)} />}
              {current.has(kid.id) && <div className="acct-desk"><DeskText name={kid.first_name} workbook={current.get(kid.id)!} pinSet={dashboard.pinSet} /></div>}
              {mayaHere && (minutes.has(kid.id) || chats.has(kid.id)) && <MinutesRow name={kid.first_name} minutes={minutes.get(kid.id)} chat={chats.get(kid.id)} />}
              {mayaHere && notes.has(kid.id) && <NoteCard note={notes.get(kid.id)!} name={kid.first_name} zone={timeZone} latest />}
            </li>
          </ul>
        </>
      )}
      {scansEnabled && !links.some((l) => l.tab === "scan_pages") && <p><Link className="btn" href="/account/scan">Scan pages <span aria-hidden="true">→</span></Link></p>}
      {mayaHere && minutes.size > 0 && <DemoMinutesLine />}
    </SupportPage>
  );
}
