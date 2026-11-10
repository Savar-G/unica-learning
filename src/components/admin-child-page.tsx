// The child page's parts (D-313, D-315): the head card (the child's current workbook on Production's stages, with its
// one action), "How the child learns" as a card with the book mix as small bars, and the workbooks, the current one
// first. Server components only; the actions are the existing action components.
import Link from "next/link";
import type { ReactNode } from "react";
import { bookSteps } from "@/lib/admin-family-page";
import { STAGE_TEXT, shortWhen, type Book } from "@/lib/admin-production";
import { adminWorkbookPath, when } from "@/lib/admin-view";
import { LEARNING_STYLES, type BookMix } from "@/lib/learning-style";
import type { WorkbookSummary } from "@/lib/workbook-content";
import { Chip } from "@/components/admin";
import { StepTrack } from "@/components/admin-family-page";
import { BookAction } from "@/components/admin-production";
import { WorkbookStatusChip } from "@/components/admin-workbook";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import "./admin-record.css";

/** Where the child's current book is, in a sentence. */
function bookLine(book: Book, now: Date): string {
  const w = book.workbook;
  switch (book.stage) {
    case "none": return book.cardSavedAt ? `Card saved ${shortWhen(book.cardSavedAt, now)}. No workbook yet.` : book.planStarted ? "Plan started. No workbook yet." : "No card saved yet. No workbook yet.";
    case "making": return `Started ${shortWhen(book.run?.run.startedAt ?? book.run?.run.createdAt, now)}.`;
    case "review": return book.run ? `The draft is ready: made ${shortWhen(book.run.run.finishedAt ?? book.run.run.createdAt, now)}.` : "Taken back to draft for changes.";
    case "approved": return `Approved ${shortWhen(w?.approvedAt, now)}. Ready to print.`;
    case "printed": return `Printed ${shortWhen(w?.printedAt, now)}. Ready to ship.`;
    case "shipped": return `Shipped ${shortWhen(w?.shippedAt, now)}. Delivery not confirmed yet.`;
    case "delivered": return `Delivered ${shortWhen(book.deliveredAt, now)}.`;
  }
}

/**
 * The head card. `book`: the child's current book from Production's rules, or null for a child not on the workbook
 * journey yet (no card, plan, run or workbook): shown as "No workbook yet". `restart`: a paid restart waits.
 */
export function ChildHead({ book, childId, child, runner, now, restart, facts }: {
  book: Book | null; childId: string; child: string; runner: "mac" | "server"; now: Date; restart: ReactNode; facts: [string, ReactNode][];
}) {
  const stage = book?.stage ?? "none";
  const you = stage === "none" || stage === "review";
  return <section className="rec-head is-child" aria-labelledby="rec-book">
    <div className="rec-head-track">
      <h2 className="rec-kicker" id="rec-book">Workbook {book?.number ?? 1}</h2>
      <StepTrack label={`Workbook ${book?.number ?? 1} stages`} steps={bookSteps(stage).map((s) => ({ key: s.stage, label: s.label, state: s.state }))} />
    </div>
    <div className={`rec-next${you ? " is-you" : ""}`}>
      <h2 className="rec-kicker">{you ? "Needs you" : "Next step"}</h2>
      <p className="rec-calm"><b>{STAGE_TEXT[stage]}.</b> {book ? bookLine(book, now) : "No card saved and no workbook yet."}</p>
      {restart}
      <div className="rec-act">{book && book.stage !== "none" ? <BookAction book={book} runner={runner} /> : <PrepareWorkbook childId={childId} child={child} runner={runner} />}</div>
    </div>
    <dl className="rec-contact">
      {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  </section>;
}

/** The parent's answers and the book mix they give, the mix as one small bar per style. */
export function LearnsCard({ name, answers, answeredAt, mix, settings, profileHref }: {
  name: string; answers: [string, string][]; answeredAt: string; mix: BookMix; settings: string; profileHref: string;
}) {
  const label = LEARNING_STYLES.map((s) => `${s.label} ${mix.shares[s.id]}%`).join(", ");
  return <section className="rec-sec" aria-labelledby="rec-learns">
    <div className="rec-sec-head">
      <h2 id="rec-learns">How {name} learns</h2>
      <p>The parent&apos;s answers on the learning card. Answered {answeredAt}.</p>
      <span className="rec-sec-act"><Link href={profileHref}>Open the child&apos;s profile</Link></span>
    </div>
    <div className="rec-learns">
      <dl className="rec-kv is-grid">{answers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="rec-mix">
        <h3>Book mix{mix.isDefault && <> <Chip tone="muted">Default</Chip></>}</h3>
        <ul className="rec-bars" role="img" aria-label={`Book mix: ${label}`}>
          {LEARNING_STYLES.map((s) => <li key={s.id}>
            <span>{s.label}</span>
            <span className="rec-bar" aria-hidden="true"><i style={{ width: `${mix.shares[s.id]}%` }} /></span>
            <b>{mix.shares[s.id]}%</b>
          </li>)}
        </ul>
        <p className="rec-quiet">Story problem settings: {settings}</p>
      </div>
    </div>
  </section>;
}

/** One workbook as a row: its number, status, levels and date, then its scan progress when it was shipped. */
function WorkbookRow({ w, scan }: { w: WorkbookSummary; scan: ReactNode }) {
  return <li className="rec-book-row">
    <div className="rec-book-top">
      <b><Link href={adminWorkbookPath(w.id)}>Workbook {w.number}</Link></b>
      <WorkbookStatusChip status={w.status} />
      <span className="rec-quiet">Levels {w.levels.map((l) => `U${l}`).join(", ") || "-"} · made {when(w.createdAt)}</span>
    </div>
    {scan}
  </li>;
}

/** The workbooks, newest first: the current one open, the older ones in a closed fold. */
export function WorkbookList({ workbooks, scans }: { workbooks: WorkbookSummary[]; scans: Map<string, ReactNode> }) {
  if (workbooks.length === 0) return <p className="adm-empty">No workbooks yet.</p>;
  const [current, ...older] = workbooks;
  return <>
    <ul className="rec-books"><WorkbookRow w={current} scan={scans.get(current.id)} /></ul>
    {older.length > 0 && <details className="rec-fold">
      <summary>Show {older.length} older {older.length === 1 ? "workbook" : "workbooks"}</summary>
      <ul className="rec-books">{older.map((w) => <WorkbookRow key={w.id} w={w} scan={scans.get(w.id)} />)}</ul>
    </details>}
  </>;
}
