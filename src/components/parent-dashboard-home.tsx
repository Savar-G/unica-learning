import type { ReactNode } from "react";
import Link from "next/link";
import { SendLink, StartTest, TrackOnce } from "@/components/account";
import { NoteCard } from "@/components/parent-maya-notes";
import { DeskText, MayaNoticeCard, MayaChatRow } from "@/components/parent-home-rows";
import { ParentAlerts, ParentTestStart } from "@/components/parent-assessment";
import { ParentOverview } from "@/components/parent-overview";
import { SupportPage } from "@/components/support-page";
import type { StartState } from "@/lib/assessment";
import { gradeLabel } from "@/lib/assessment/grades";
import { startWhen, type FamilyZone } from "@/lib/family-time";
import { fromRow, learningPath, type LearningRow } from "@/lib/learning-style";
import type { ChatUsage } from "@/lib/maya-chat";
import type { ParentNote } from "@/lib/parent-maya-notes";
import type { ParentDashboard } from "@/lib/parent-dashboard-server";
import type { OverviewView } from "@/lib/parent-view";
import { activeTab, pickChild, tabLinks } from "@/lib/parent-shell";
import { CURRICULA, type CurriculumId } from "@/lib/signup";
import { stateFor } from "@/lib/test-attempt";
import type { WorkbookSummary } from "@/lib/workbook-content";

/** A child row as Parent home reads it, with the learning card's columns. */
type Kid = { id: string; first_name: string; grade: number; province: CurriculumId } & LearningRow;

export interface DashboardHomeProps {
  dashboard: ParentDashboard;
  /** The shown child's Overview (#560); null for a stage with no Overview, or when it cannot be read. */
  overview: OverviewView | null;
  kids: readonly Kid[];
  addressChild: string | null;
  phone: boolean;
  sent: boolean;
  parentEmail: string;
  timeZone: FamilyZone;
  states: Parameters<typeof stateFor>[0];
  reportFor: (id: string, state: StartState) => string | undefined;
  /** #771: the report of the test just done is late (reportLate in src/lib/report-late.ts). */
  lateFor: (id: string, state: StartState) => boolean;
  current: ReadonlyMap<string, WorkbookSummary>;
  chats: ReadonlyMap<string, ChatUsage>;
  notes: ReadonlyMap<string, ParentNote>;
  scansEnabled: boolean;
  noticeDue: boolean;
  alerts: Parameters<typeof ParentAlerts>[0];
  /** Why the product is closed, for a family whose plan stopped while the switch keeps this home open (#709). */
  note?: ReactNode;
}

/**
 * The dashboard's home (#551): before the report (#552), the test beside how it works; once a child's stage opens on the
 * Overview, one child's part of Parent home until #560 fills it. A panel with no data does not appear. A stage that opens
 * on the report never reaches this page: /account sends it there. The family's links are on the Account tab.
 */
export function ParentDashboardHome({ dashboard, overview, kids, addressChild, phone, sent, parentEmail, timeZone, states, reportFor, lateFor, current, chats, notes, scansEnabled, noticeDue, alerts, note }: DashboardHomeProps) {
  const view = pickChild(dashboard.children, addressChild, dashboard.remembered);
  const kid = kids.find((k) => k.id === view?.id);
  const links = tabLinks(view);
  const label = links.find((l) => l.tab === activeTab("/account", links))?.label ?? "Your account";
  const state = kid && stateFor(states, kid.id);
  // A sign-in link goes to the family's first child (Parent home says so too).
  const sentHere = sent && kid?.id === kids[0]?.id;
  // The Maya tab holds chat usage and saved notes (#553). A child without it keeps them here.
  const mayaHere = !view?.tabs.includes("maya");
  const scanLink = scansEnabled && !links.some((l) => l.tab === "scan_pages") && <p><Link className="btn" href="/account/scan">Scan pages <span aria-hidden="true">→</span></Link></p>;
  if (kid && state && view && (view.opensOn === "start_test" || view.opensOn === "continue_or_wait")) {
    return (
      <ParentTestStart childId={kid.id} name={kid.first_name} state={state} when={startWhen(state, timeZone)} report={reportFor(kid.id, state)} late={lateFor(kid.id, state)} phone={phone} sent={sentHere} parentEmail={parentEmail} alerts={alerts} learning={view.reportIds.length > 0 ? { path: learningPath(kid.id), answered: !!fromRow(kid) } : null}>
        {note}
        {noticeDue && current.size > 0 && <MayaNoticeCard />}
        {mayaHere && chats.has(kid.id) && <MayaChatRow name={kid.first_name} chat={chats.get(kid.id)!} />}
        {mayaHere && notes.has(kid.id) && <NoteCard note={notes.get(kid.id)!} name={kid.first_name} zone={timeZone} latest />}
        {scanLink}
      </ParentTestStart>
    );
  }
  return (
    <SupportPage label={label} title={kid?.first_name ?? "Your account"}>
      {note}
      <ParentAlerts {...alerts} />
      {noticeDue && current.size > 0 && <MayaNoticeCard />}
      {!kid && <p className="lead">Add a child on the <Link href="/account/settings">Account</Link> page to start.</p>}
      {kid && overview?.child.id === kid.id && <ParentOverview overview={overview} />}
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
          <ul className="acct-kids" id="pd-test">
            <li className="acct-kid">
              <span>
                <b>The test</b><span className="small">{gradeLabel(kid.grade)} · {CURRICULA[kid.province]}</span>
                {view && view.reportIds.length > 0 && <Link className="small acct-learn" href={learningPath(kid.id)}>
                  {fromRow(kid) ? `How ${kid.first_name} learns: change answers` : `Tell us how ${kid.first_name} learns`}
                </Link>}
              </span>
              {phone && state.kind !== "wait"
                ? <SendLink key={kid.id} childId={kid.id} name={kid.first_name} sent={sentHere} />
                : <StartTest childId={kid.id} name={kid.first_name} state={state} when={startWhen(state, timeZone)} report={reportFor(kid.id, state)} late={lateFor(kid.id, state)} lateShown={overview?.child.id === kid.id && overview.resultLate} />}
              {current.has(kid.id) && <div className="acct-desk"><DeskText name={kid.first_name} workbook={current.get(kid.id)!} pinSet={dashboard.pinSet} /></div>}
              {mayaHere && chats.has(kid.id) && <MayaChatRow name={kid.first_name} chat={chats.get(kid.id)!} />}
              {mayaHere && notes.has(kid.id) && <NoteCard note={notes.get(kid.id)!} name={kid.first_name} zone={timeZone} latest />}
            </li>
          </ul>
        </>
      )}
      {scanLink}
    </SupportPage>
  );
}
