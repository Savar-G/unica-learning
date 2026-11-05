import Link from "next/link";
import type { CSSProperties } from "react";
import { gradeLabel, type AreaLabel, type Level } from "@/lib/assessment";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { formatCalendarDate } from "@/lib/family-time";
import { learningPath } from "@/lib/learning-style";
import { WEEK_SECONDS } from "@/lib/maya-minutes";
import type { ChildMinutes } from "@/lib/maya-minutes-server";
import type { ActionItem, OverviewView } from "@/lib/parent-view";
import "./parent-overview.css";

// The Overview (#560, spec #544, D-243, D-248): the tiles, the area bars and one thing to do, in the mock's white cards
// (round r544) and the report's ruler colours: At grade green, Building up tangerine, Ahead sky. A tile or a section with
// no data does not appear. No streaks, time spent, percent right, counts of wrong answers or comparison with other
// children. The copy names the child; it never says she or her.

const LABELS: Record<AreaLabel, string> = { ahead: "Ahead", "at-grade": "At grade", "building-up": "Building up" };

const labelOf = (level: Level, grade: number): AreaLabel => (level > grade ? "ahead" : level === grade ? "at-grade" : "building-up");

/** "October 31": a calendar day in family time, which the view already holds. */
const date = (day: string) => formatCalendarDate(day, { month: "long", day: "numeric" });

/** The scale's last grade: grade 8, as on the report, or higher when the child's grade or a level is higher. */
const scaleTop = (o: OverviewView) => Math.max(8, o.child.schoolGrade, o.level?.working ?? 0, ...o.areas.map((a) => a.level));

const tick = (l: number) => (l === 0 ? "K" : String(l));

export function ParentOverview({ overview, maya }: { overview: OverviewView; maya: ChildMinutes | null }) {
  const { child, level, areas, resultPreparing, resultLate, workbook, action, summaryMonth } = overview;
  const n = scaleTop(overview) + 1;
  const tiles = level || workbook || maya;
  return (
    <div className="po">
      {resultPreparing && (
        <section className="po-card">
          <p className="po-preparing">
            {resultLate
              ? <>{child.firstName}&apos;s new result is taking longer than it should. Please email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> and we will look into it.</>
              : <>{child.firstName}&apos;s new result is being prepared.</>}
          </p>
        </section>
      )}
      {tiles && (
        <div className="po-tiles">
          {level && <LevelTile working={level.working} grade={child.schoolGrade} earlySign={level.earlySign} testedOn={level.testedOn} n={n} />}
          {workbook && (
            <section className="po-card" aria-labelledby="po-book">
              <p className="po-label" id="po-book">This workbook</p>
              <p className="po-value">Workbook {workbook.number}</p>
              <p className="po-sub">{workbook.scannedDays} of {workbook.days} days scanned</p>
            </section>
          )}
          {maya && (
            <section className="po-card" aria-labelledby="po-maya">
              <p className="po-label" id="po-maya">Maya this week</p>
              <p className="po-value">{maya.used} of {WEEK_SECONDS / 60} minutes</p>
              <p className="po-sub">{maya.left > 0 ? `The minutes start again on ${maya.backOn}.` : `Maya is back on ${maya.backOn}.`}</p>
              <Link className="po-more" href={`/account/notes/${encodeURIComponent(child.id)}`}>Notes from Maya <span aria-hidden="true">→</span></Link>
            </section>
          )}
        </div>
      )}
      {level && areas.length > 0 && (
        <section className="po-card po-areas" aria-labelledby="po-areas">
          <h2 id="po-areas">Level by area</h2>
          <p className="po-sub">From the test on {date(level.testedOn)}. The line marks {child.firstName}&apos;s school grade, {gradeLabel(child.schoolGrade)}.</p>
          <div className="po-bars" style={{ "--n": n, "--grade": child.schoolGrade } as CSSProperties}>
            <div className="po-axis" aria-hidden="true">
              <span />
              <span className="po-ticks">{Array.from({ length: n }, (_, l) => <span key={l} className={l === child.schoolGrade ? "is-grade" : undefined}>{tick(l)}</span>)}</span>
            </div>
            <ul>
              {areas.map((a) => (
                <li key={a.area} className={`po-bar is-${a.label}${a.earlySign ? " is-early" : ""}`}>
                  <span className="po-area">
                    <b>{a.name}</b>
                    <span>{LABELS[a.label]}{a.earlySign ? " · Early sign" : ""}</span>
                  </span>
                  <span className="po-track" role="img" aria-label={`${a.name}: ${gradeLabel(a.level)}. ${LABELS[a.label]}${a.earlySign ? ". Early sign" : ""}.`}>
                    <span className="po-fill" style={{ "--level": a.level } as CSSProperties} />
                    <span className="po-line" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {areas.some((a) => a.earlySign) && <p className="po-note">Early sign: too few answers in this area to be sure. The workbooks check it.</p>}
        </section>
      )}
      {action && <ActionCard item={action} name={child.firstName} childId={child.id} />}
      {summaryMonth && <SummaryCard month={summaryMonth} name={child.firstName} childId={child.id} />}
    </div>
  );
}

/** The Level tile, with the report's ruler, small: the working level a filled circle, the school grade a dashed ring. */
function LevelTile({ working, grade, earlySign, testedOn, n }: { working: Level; grade: number; earlySign: boolean; testedOn: string; n: number }) {
  const [lo, hi] = [Math.min(working, grade), Math.max(working, grade)];
  const at = { "--n": n, "--work": working, "--grade": grade, "--lo": lo, "--hi": hi } as CSSProperties;
  return (
    <section className={`po-card po-level is-${labelOf(working, grade)}`} aria-labelledby="po-level">
      <p className="po-label" id="po-level">Level</p>
      <p className="po-value">Working at {gradeLabel(working)}</p>
      <p className="po-sub">In {gradeLabel(grade)} at school.{earlySign && <> <span className="po-chip">Early sign</span></>}</p>
      <div className="po-ruler" role="img" aria-label={`Working level: ${gradeLabel(working)}. School grade: ${gradeLabel(grade)}.`} style={at}>
        {lo !== hi && <span className="po-gap" />}
        <span className="po-pin is-work" />
        <span className="po-pin is-grade" />
        {Array.from({ length: n }, (_, l) => <span key={l} className={`po-tick${l === working ? " is-work" : ""}`}>{tick(l)}</span>)}
      </div>
      <p className="po-foot">From the test on {date(testedOn)}.</p>
    </section>
  );
}

const ACTIONS: Record<ActionItem, (name: string, childId: string) => { title: string; body: string; href: string; button: string }> = {
  start_test: (name) => ({ title: "Start the test", body: `${name}'s first workbook starts from the test result.`, href: "#pd-test", button: "Go to the test" }),
  continue_test: (name) => ({ title: "Go to the test", body: `The answers are saved. ${name}'s first workbook starts from the test result.`, href: "#pd-test", button: "Go to the test" }),
  payment_failed: (name) => ({ title: "A payment did not go through", body: `The last payment for ${name}'s plan did not go through. Check the card on the plan.`, href: "/account/plan", button: "See the plan" }),
  no_pin: (name) => ({ title: "Set your PIN", body: `Set a 4-digit PIN before ${name} uses the desk. The desk asks for it before anyone leaves the desk for your account.`, href: "/account/pin", button: "Set your PIN" }),
  learning_card_empty: (name, childId) => ({ title: `Tell us how ${name} learns`, body: `A few short questions about what ${name} likes and how ${name} learns. You can change the answers at any time.`, href: learningPath(childId), button: "Answer the questions" }),
};

/** One thing to do, the first in the spec's order (D-248). */
function ActionCard({ item, name, childId }: { item: ActionItem; name: string; childId: string }) {
  const a = ACTIONS[item](name, childId);
  return (
    <section className={`po-card po-action is-${item}`} aria-labelledby="po-action">
      <p className="po-label">To do</p>
      <h2 id="po-action">{a.title}</h2>
      <p className="po-sub">{a.body}</p>
      <Link className="btn" href={a.href}>{a.button} <span aria-hidden="true">→</span></Link>
    </section>
  );
}

/** The monthly summary PDF (#562, D-248): the last finished month, from the month after the first delivery. */
function SummaryCard({ month, name, childId }: { month: string; name: string; childId: string }) {
  const label = formatCalendarDate(`${month}-01`, { month: "long", year: "numeric" });
  const href = `/api/account/children/${encodeURIComponent(childId)}/monthly-summary?month=${encodeURIComponent(month)}`;
  return (
    <section className="po-card po-summary" aria-labelledby="po-summary">
      <p className="po-label" id="po-summary">Monthly summary</p>
      <p className="po-value">{label}</p>
      <p className="po-sub">One page on {name}&apos;s month: the level, the workbooks and what comes next. You can print it or take it to a teacher meeting.</p>
      <a className="po-more" href={href} target="_blank" rel="noopener">Open the PDF <span aria-hidden="true">→</span></a>
    </section>
  );
}
