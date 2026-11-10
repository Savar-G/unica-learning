import Link from "next/link";
import type { ReactNode } from "react";
import { SendLink, StartTest, TrackOnce } from "@/components/account";
import { ReportCard, type NewTestOffer, type ReportNextContext } from "@/components/report";
import { ReportNextActions } from "@/components/report-next";
import type { StartState } from "@/lib/assessment";
import { familyWhen, formatInZone, zoneForProvince } from "@/lib/family-time";
import { learningPath, type LearningAnswers } from "@/lib/learning-style";
import { freeMonthWords, otherTests, reportAction, testWords, whatHappensNext, type Step } from "@/lib/parent-assessment";
import type { ChildView } from "@/lib/parent-view";
import { NEXT_STEP_ANCHOR, nextStep, reportDate, type ReportView } from "@/lib/report-view";
import type { ReportSrc } from "@/lib/next-step";
import { SupportPage } from "@/components/support-page";
import "./report.css";

// The Assessment tab's two pages (#552, spec #544): the report with the action beside it, and the test before there is a
// report. Round r544, set 1, option B, which Savar has not chosen yet: the layout is these two components and the
// `.pd-split` and `.pd-go` rules of parent-shell.css. In the column, the action part never scrolls; the rest scrolls in
// `.pd-rail-more`, so the button stays in view in a short window. The action is the report's own ReportNextActions on
// the current card route, with no new form (D-249).

export function ParentAlerts({ password, pin, deskError, existing }: { password: boolean; pin: boolean; deskError: boolean; existing: boolean }) {
  return (
    <>
      {password && <p role="status" className="acct-alert acct-saved">Your password is saved.</p>}
      {pin && <p role="status" className="acct-alert acct-saved">Your PIN is saved.</p>}
      {deskError && <p role="status" className="acct-alert">We cannot open the desk right now. Try again in a moment.</p>}
      {existing && <p role="status" className="acct-alert acct-saved">This email already has an account, so the code signed you in. Nothing in your account changed. To add a child, use Add another child.</p>}
    </>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return <ol className="pd-steps">{steps.map((s) => <li key={s.title}><span><b>{s.title}</b><span>{s.detail}</span></span></li>)}</ol>;
}

function LearnLink({ path, answered, name, forWorkbook }: { path: string; answered: boolean; name: string; forWorkbook: boolean }) {
  return <p className="small"><Link href={path}>{answered ? `How ${name} learns: change answers` : `Tell us how ${name} learns`}</Link>{forWorkbook && " (optional, for Workbook 1)"}</p>;
}

export function ParentReport({ view, child, next, newTest, learning, alerts, tracked, src, nextActions }: {
  view: ReportView;
  child: ChildView;
  next: ReportNextContext;
  newTest: NewTestOffer | null;
  learning: LearningAnswers | null;
  alerts: Parameters<typeof ParentAlerts>[0];
  /** False when the parent came back from the payment page: not a new report open. */
  tracked: boolean;
  src: ReportSrc;
  nextActions?: ReactNode;
}) {
  const name = view.childName;
  const zone = view.timeZone ?? zoneForProvince(view.province);
  const action = reportAction(child.stage, view.model.callToAction);
  const card = action && view.model.callToAction === "card";
  const tests = otherTests(child, view.id, (at) => formatInZone(at, zone, { dateStyle: "long" }));
  const opens = newTest?.state.kind === "opens" ? newTest.state.at : null;
  // Past work reads after a plan ended, and nothing new starts (spec #544).
  const startable = newTest?.state.kind === "open" && !child.readOnly;
  return (
    <SupportPage label="Assessment" title={`${name}'s report`} wide>
      {tracked && <TrackOnce event="report_open" props={{ src }} />}
      <ParentAlerts {...alerts} />
      <p className="pd-sub">Finished on {reportDate(view)}.{opens !== null && !child.readOnly && ` The next test opens at ${familyWhen(opens, zone)}.`}</p>
      <div className="pd-split">
        <div className="pd-split-main">
          <ReportCard view={view} next={next} newTest={view.model.reliability && !child.readOnly ? newTest : null} actionBeside />
        </div>
        <aside className="pd-split-rail" aria-label="Next step">
          {action && (
            <div className="rpt" id={NEXT_STEP_ANCHOR}>
              {nextActions ?? <ReportNextActions reportId={view.id} step={nextStep(view)} childName={name} province={view.province} src={next.src} asked={next.asked} start={next.start} words={card ? freeMonthWords(name, view.planOffer) : undefined} pinned />}
            </div>
          )}
          <div className="pd-rail-more">
            {card && <div className="pd-after"><p className="pd-k">What happens next</p><Steps steps={whatHappensNext(name, view.planOffer)} /></div>}
            {!child.readOnly && <div className="pd-after"><LearnLink path={learningPath(child.id)} answered={learning !== null} name={name} forWorkbook={card} /></div>}
            {(tests.length > 0 || startable) && (
              <div className="pd-after">
                {tests.length > 0 && (
                  <>
                    <p className="pd-k">Tests</p>
                    <ul className="pd-tests">
                      {tests.map((t) => <li key={t.href}><Link href={t.href} aria-current={t.current ? "page" : undefined}>{t.date}{t.current && <span>Shown</span>}</Link></li>)}
                    </ul>
                  </>
                )}
                {startable && newTest && <Link className="btn ghost pd-new-test" href={newTest.href}>{newTest.label}</Link>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </SupportPage>
  );
}

export function ParentTestStart({ childId, name, state, when, report, late = false, phone, sent, parentEmail, alerts, learning, children }: {
  childId: string;
  name: string;
  state: StartState;
  when: string;
  report?: string;
  /** #771: the report of the test just done is late. */
  late?: boolean;
  phone: boolean;
  sent: boolean;
  parentEmail: string;
  alerts: Parameters<typeof ParentAlerts>[0];
  /** Once the child has a report. */
  learning: { path: string; answered: boolean } | null;
  children?: ReactNode;
}) {
  const words = testWords(state, name, phone);
  const usesLink = phone && state.kind !== "wait";
  return (
    <SupportPage label="Assessment" title={`${name}'s math test`} wide>
      <ParentAlerts {...alerts} />
      {words.sub && <p className="pd-sub">{words.sub}</p>}
      <div className="pd-split pd-split-start">
        <div className="pd-split-main">
          <section className="pd-card">
            <h2>{words.info.heading}</h2>
            {words.info.steps ? <Steps steps={words.info.steps} /> : <p>{words.info.text}</p>}
            <p className="small"><Link href="/sample-report">See a sample report →</Link></p>
          </section>
          {children}
        </div>
        <aside className="pd-split-rail" aria-label="Next step">
          <div className="rpt">
            <div className="rpt-next">
              <h3>{words.title}</h3>
              {usesLink && <TrackOnce event="phone_screen" />}
              {words.text && <p>{words.text}</p>}
              {usesLink && sent && <p role="status" className="acct-sent">We sent the link for {name} to <b>{parentEmail}</b>.</p>}
              <div className="pd-test-go">
                {usesLink
                  ? <SendLink key={childId} childId={childId} name={name} sent={sent} />
                  : <StartTest childId={childId} name={name} state={state} when={when} report={report} late={late} />}
              </div>
            </div>
          </div>
          {learning && <div className="pd-rail-more"><div className="pd-after"><LearnLink path={learning.path} answered={learning.answered} name={name} forWorkbook={false} /></div></div>}
        </aside>
      </div>
    </SupportPage>
  );
}
