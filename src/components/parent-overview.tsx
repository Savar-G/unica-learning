import Link from "next/link";
import { HomeSkills } from "@/components/parent-home-skills";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import type { OverviewView } from "@/lib/parent-view";
import type { WeekDayState } from "@/lib/parent-week";
import "./parent-option-a.css";
import "./parent-overview.css";

// The dashboard Home (#1003, #1005, Option A v9): the child's name above (the page title), this week's Monday-to-Friday
// circles, the workbook card, and the skills since the child started. Nothing else: no level tile, area bars, Maya tile,
// action card, monthly PDF row or goal sentence; no percent right or count of wrong answers; no count beside a heading.
// The copy names the child and never says she or her. A part with no data does not appear. The sentence under each
// skill (#989) and Highlights (#990) come later, and the rows leave room for them.

const SR: Record<WeekDayState, string> = { done: "done", today: "today, not done yet", today_done: "today, done", open: "coming up" };

/** The workbook's pages scanned: a ring with the percent. Its text alternative says the same in words. */
function Ring({ percent, book }: { percent: number; book: number }) {
  const size = 96, r = size / 2 - 7, c = 2 * Math.PI * r;
  return (
    <div className="po-ring" role="img" aria-label={`${percent}% of Workbook ${book}'s pages scanned`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f5f4f1" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16a06a" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * percent) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="po-ring-in" aria-hidden="true"><span><b>{percent}%</b>done</span></div>
    </div>
  );
}

/** One plain line for a newer book that is mailed and not delivered yet. */
export function OnTheWay({ number }: { number: number }) {
  return <p className="po-way">Workbook {number} is on its way</p>;
}

/** Whether the Home has a part to show; with none, Parent home keeps its old rows so the page is never just a name. */
export const homeHasParts = ({ week, workbook, scanPrompt, skills }: OverviewView): boolean => !!(week || workbook || scanPrompt || skills);

export function ParentOverview({ overview }: { overview: OverviewView }) {
  const { child, resultPreparing, resultLate, week, workbook, onTheWay, scanPrompt, skills } = overview;
  return (
    <div className="pa-wrap"><div className="pa po">
      {resultPreparing && (
        <section className="pa-card po-preparing-card">
          <p className="po-preparing">
            {resultLate
              ? <>{child.firstName}&apos;s new result is taking longer than it should. Please email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> and we will look into it.</>
              : <>{child.firstName}&apos;s new result is being prepared.</>}
          </p>
        </section>
      )}
      {onTheWay !== null && <OnTheWay number={onTheWay} />}
      {(week || workbook || scanPrompt) && (
        <div className="po-main">
          {week && (
            <ul className="po-week" aria-label="This week">
              {week.map((d) => (
                <li key={d.label} className={`po-day is-${d.state}`}>
                  <span className="po-dot" aria-hidden="true">{d.state === "done" || d.state === "today_done" ? "✓" : ""}</span>
                  <span aria-hidden="true">{d.label}</span>
                  <span className="pa-vh">{d.label}: {SR[d.state]}</span>
                </li>
              ))}
            </ul>
          )}
          {workbook && (
            <section className="pa-card po-book" aria-labelledby="po-book-k">
              <div className="po-book-top">
                <div>
                  <p className="po-k" id="po-book-k">Workbook {workbook.number}</p>
                  <p className="po-n">Day {workbook.day}<small> of {workbook.days}</small></p>
                </div>
                {workbook.percent !== null && <Ring percent={workbook.percent} book={workbook.number} />}
              </div>
              {workbook.today && (
                <div className="po-today">
                  <div><b>{workbook.today.label}</b>{workbook.today.topic && <span>{workbook.today.topic}</span>}</div>
                  {workbook.today.pages > 0 && <span className="po-pp">{workbook.today.scanned} of {workbook.today.pages} scanned</span>}
                </div>
              )}
            </section>
          )}
          {scanPrompt && (
            <div className="pa-card po-scan">
              <div>
                <b>Scan the first pages when they&apos;re done</b>
                <span>{scanPrompt.pages > 0 && <>Day {scanPrompt.day} has {scanPrompt.pages} pages. </>}Any order is fine.</span>
              </div>
              <Link className="pa-scanbtn" href="/account/scan">Scan</Link>
            </div>
          )}
        </div>
      )}
      {skills && <div className="po-side"><HomeSkills name={child.firstName} skills={skills} /></div>}
    </div></div>
  );
}
