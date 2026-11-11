// The family page's parts (D-313, D-315): the head card (where the family is on the board's stages, the team's next
// step and the contact), one card per child, and the family's timeline. Server components only; the actions inside
// them are the existing action components. The models are src/lib/admin-family-page.ts.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Activity, Family, FamilyTest } from "@/lib/admin-dashboard";
import { EMAIL_LABEL, at, emailFailed, isUnsubscribe, nextReminderText, paymentText, since } from "@/lib/admin-dashboard";
import type { JourneyStep, NextStep, StepState } from "@/lib/admin-family-page";
import { STAGE_TEXT as BOOK_STAGE_TEXT, faceColor, shortWhen, type Book, type Stage as BookStage } from "@/lib/admin-production";
import { adminEmailPath, adminReportPath, adminTestPath, when } from "@/lib/admin-view";
import { gradeLabel } from "@/lib/assessment/grades";
import { Chip, StatusChip, type Tone } from "@/components/admin";
import { StageChip } from "@/components/admin-dashboard-parts";
import { BookAction } from "@/components/admin-production";
import { childPath } from "@/components/admin-records";
import "./admin-record.css";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const ICON_DONE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" /></svg>;
const STATE_WORDS: Record<StepState, string> = { done: "done", now: "now", todo: "not yet" };

/** A row of stages: done ones ticked, the current one filled, the rest open. Vertical in a narrow box. */
export function StepTrack({ label, steps }: { label: string; steps: { key: string; label: string; state: StepState; sub?: string | null }[] }) {
  return <ol className="rec-steps" aria-label={label} style={{ "--rec-n": steps.length } as CSSProperties}>
    {steps.map((s, i) => <li key={s.key} className={`rec-step is-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
      <span className="rec-node" aria-hidden="true">{s.state === "done" ? ICON_DONE : i + 1}</span>
      <span className="rec-step-text"><b>{s.label}</b><span className="adm-sr">: {STATE_WORDS[s.state]}</span>{s.sub && <span className="rec-step-sub">{s.sub}</span>}</span>
    </li>)}
  </ol>;
}

/** Where to act on a Needs you item on this page. */
const NEED_PLACE: Record<string, { href: string; text: string }> = {
  "Start a subscription": { href: "#cards", text: "Go to cards and plans" },
  "Payment failing": { href: "#cards", text: "Go to cards and plans" },
  "Email failed": { href: "#emails", text: "Go to the email log" },
  "Stuck in the test": { href: "#tests", text: "Go to the tests" },
};

/** The head card: the stage track, the next step for the team, and the contact. */
export function FamilyHead({ f, journey, next, now, contact }: {
  f: Family | null; journey: { steps: JourneyStep[]; off: string | null } | null; next: { needs: NextStep[]; calm: string } | null; now: string;
  contact: [string, ReactNode][];
}) {
  const needs = next?.needs ?? [];
  return <section className="rec-head" aria-labelledby="rec-where">
    <div className="rec-head-track">
      <h2 className="rec-kicker" id="rec-where">Where they are</h2>
      {f && <p className="rec-stage"><StageChip stage={f.stage} /> <span className="rec-quiet">since {at(f.stageAt)} ({since(f.stageAt, now)})</span></p>}
      {journey ? <>
        <StepTrack label="The family's stages" steps={journey.steps.map((s) => ({ ...s, sub: s.at ? at(s.at) : null }))} />
        {journey.off && <p className="rec-off"><Chip tone={journey.off === "Cancelled" ? "bad" : "muted"}>{journey.off}</Chip> {journey.off === "Cancelled" ? "The plan ended. The steps above are where the family got to." : "Not on the steps above: waiting for their curriculum."}</p>}
      </> : <p className="adm-note">The family&apos;s stage could not be worked out. Reload the page.</p>}
    </div>
    <div className={`rec-next${needs.length ? " is-you" : ""}`}>
      <h2 className="rec-kicker">{needs.length ? "Needs you" : "Next step"}</h2>
      {needs.length > 0 && <ul className="rec-needs">
        {needs.map((n) => <li key={n.title}>
          <b>{n.title}</b><span>{n.detail}.</span>
          {NEED_PLACE[n.title] && <a href={NEED_PLACE[n.title].href}>{NEED_PLACE[n.title].text}</a>}
        </li>)}
      </ul>}
      {next && <p className={needs.length ? "rec-calm is-after" : "rec-calm"}>{next.calm}</p>}
      {f?.unsubscribed && <p className="rec-warn">Reminders are off: this parent unsubscribed.</p>}
      {f && f.nextReminders.length > 0 && <p className="rec-quiet">Next email: {f.nextReminders.map((r) => nextReminderText(r, now)).join("; ")}</p>}
      {f && <p className="rec-quiet">{paymentText(f)}</p>}
    </div>
    <dl className="rec-contact">
      {contact.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  </section>;
}

const BOOK_TONE: Record<BookStage, Tone> = { none: "warn", review: "warn", making: "info", approved: "muted", printed: "muted", shipped: "muted", delivered: "ok" };

/** The book's chip and its one action; a child with no workbook yet is prepared on the child's own page. */
function BookLine({ book, runner, childId }: { book: Book | null; runner: "mac" | "server"; childId: string }) {
  if (!book) return <span className="rec-quiet">Not started: no card saved and no workbook.</span>;
  return <span className="rec-book">
    <span><Chip tone={BOOK_TONE[book.stage]}>{BOOK_STAGE_TEXT[book.stage]}</Chip> <span className="rec-quiet">Book {book.number}</span></span>
    <span className="rec-book-act">{book.stage === "none"
      ? <Link className="btn ghost adm-btn" href={childPath(childId)} prefetch={false}>Prepare on the child&apos;s page</Link>
      : <BookAction book={book} runner={runner} />}</span>
  </span>;
}

function TestLine({ test, now }: { test: FamilyTest | null; now: Date }) {
  if (!test) return <span className="rec-quiet">No test yet.</span>;
  return <span className="rec-test">
    <span><StatusChip status={test.status} /> <span className="rec-quiet">{pl(test.answered, "answer", "answers")}, {test.completedAt ? `finished ${shortWhen(test.completedAt, now)}` : `started ${shortWhen(test.startedAt, now)}`}</span></span>
    <span className="adm-row"><Link href={adminTestPath(test.id)}>Test</Link>{test.reportId && <Link href={adminReportPath(test.reportId)}>Report</Link>}</span>
  </span>;
}

export interface ChildCardData {
  id: string;
  parentId: string;
  name: string;
  grade: number;
  place: string;
  addedAt: string;
  test: FamilyTest | null;
  tests: number;
  plan: { tone: "ok" | "warn" | "muted"; text: string };
  book: Book | null;
  chat: string;
  /** The parent goals as label and value rows (D-325). */
  goals: [string, string][];
}

/** One child: the latest test, the current workbook with its action, the plan and Maya chat. */
export function ChildCard({ c, runner, now, isTest }: { c: ChildCardData; runner: "mac" | "server"; now: Date; isTest: boolean }) {
  return <article className="rec-child" aria-labelledby={`rec-child-${c.id}`}>
    <header className="rec-child-head">
      <span className={`adm-pd-face is-lg${isTest ? " is-test" : ""}`} style={{ background: faceColor(c.parentId, isTest) }} aria-hidden="true">{c.name.charAt(0).toUpperCase() || "?"}</span>
      <span className="rec-child-who">
        <b id={`rec-child-${c.id}`}><Link href={childPath(c.id)}>{c.name}</Link></b>
        <span>{gradeLabel(c.grade)}, {c.place} · added {when(c.addedAt)}</span>
      </span>
    </header>
    <dl className="rec-kv">
      <div><dt>Latest test</dt><dd><TestLine test={c.test} now={now} />{c.tests > 1 && <span className="rec-quiet">{pl(c.tests, "test", "tests")} in all</span>}</dd></div>
      <div><dt>Workbook</dt><dd><BookLine book={c.book} runner={runner} childId={c.id} /></dd></div>
      <div><dt>Card and plan</dt><dd><Chip tone={c.plan.tone}>{c.plan.text}</Chip></dd></div>
      {/* D-325: the parent's goals from signup, for the results call. */}
      <div><dt>Parent goals</dt><dd className="rec-goals">{c.goals.map(([k, v]) => <span key={k}><span className="rec-quiet">{k}:</span> {v}</span>)}</dd></div>
      <div><dt>Maya chat</dt><dd className="rec-quiet">{c.chat}</dd></div>
    </dl>
  </article>;
}

/** How many timeline items show before "Show earlier". */
export const TIMELINE_SHOWN = 12;

function TimelineItem({ a, now }: { a: Activity; now: Date }) {
  const e = a.email;
  return <li>
    <span className={`rec-tl-dot is-${a.kind}${e && emailFailed(e) ? " is-bad" : ""}`} aria-hidden="true" />
    <time dateTime={a.at}>{shortWhen(a.at, now)}</time>
    <span className="rec-tl-text">{e && !isUnsubscribe(e.kind) ? <><Link href={adminEmailPath(e.id)}>{EMAIL_LABEL[e.kind]}</Link>: &ldquo;{e.subject}&rdquo;{e.status === "failed" ? ` (failed after ${pl(e.attempts, "try", "tries")})` : e.status === "pending" ? " (waiting to send)" : ""}</> : a.text}</span>
  </li>;
}

/** The family's timeline, newest first; the earlier items in a closed fold. */
export function FamilyTimeline({ items, now }: { items: Activity[]; now: Date }) {
  if (items.length === 0) return <p className="adm-empty">Nothing has happened yet.</p>;
  const shown = items.slice(0, TIMELINE_SHOWN);
  const rest = items.slice(TIMELINE_SHOWN);
  return <>
    <ol className="rec-tl">{shown.map((a, i) => <TimelineItem key={`${a.kind}-${a.at}-${i}`} a={a} now={now} />)}</ol>
    {rest.length > 0 && <details className="rec-fold">
      <summary>Show {pl(rest.length, "earlier event", "earlier events")}</summary>
      <ol className="rec-tl">{rest.map((a, i) => <TimelineItem key={`${a.kind}-${a.at}-${i}`} a={a} now={now} />)}</ol>
    </details>}
  </>;
}

/** A section heading with its count and one quiet line. */
export function SectionHead({ id, title, count, hint, children }: { id: string; title: string; count?: number; hint?: string; children?: ReactNode }) {
  return <div className="rec-sec-head">
    <h2 id={id}>{title}</h2>
    {count !== undefined && <span className="rec-count">{count}</span>}
    {hint && <p>{hint}</p>}
    {children && <span className="rec-sec-act">{children}</span>}
  </div>;
}
