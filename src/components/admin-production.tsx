// Workbooks > Production (D-313, D-315): the stage tracker, which filters the page, then each child's current book in
// four groups (Needs you, In progress, Out the door, Done). The stages come from src/lib/admin-production.ts. Each card
// has one action, at the place where that action is done; "Prepare workbook" is the child page's own control. A server
// component; the refresh while a book is being made and the prepare button are the only client parts.
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkerStatus } from "@/lib/admin-store";
import {
  NEEDS_YOU, STAGE_TEXT, checkLines, faceColor, groupBooks, makingView, shortWhen, stageCounts, type Book, type Stage,
} from "@/lib/admin-production";
import { ADMIN_WORKBOOKS_PATH, adminParentPath, adminWorkbookPath, adminWorkbookRunPath } from "@/lib/admin-view";
import { Chip, TestTag, type Tone } from "@/components/admin";
import { childPath } from "@/components/admin-records";
import { RunRefresh } from "@/components/admin-run-refresh";
import { waitingLine } from "@/components/admin-workbook-runs";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import "./admin-production.css";

/** How often the page reads again while a book is being made. Light: only the current runs' checks are read. */
const REFRESH_SECONDS = 15;

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const stageHref = (stage: Stage | null, older = false) => {
  const q = new URLSearchParams();
  if (stage) q.set("stage", stage);
  if (older) q.set("older", "1");
  const s = q.toString();
  return s ? `${ADMIN_WORKBOOKS_PATH}?${s}` : ADMIN_WORKBOOKS_PATH;
};

export function Face({ book, large = false }: { book: Book; large?: boolean }) {
  return <span className={`adm-pd-face${large ? " is-lg" : ""}${book.test ? " is-test" : ""}`} style={{ background: faceColor(book.parentId, book.test) }} aria-hidden="true">
    {book.child.charAt(0).toUpperCase() || "?"}
  </span>;
}

const ICON_OK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const ICON_WARN = <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16h.01" /></svg>;

function Checks({ book }: { book: Book }) {
  const lines = book.stage === "review" && book.run ? checkLines(book.run.counts, book.run.notRendered, book.run.oldFormat) : [];
  if (!lines.length) return null;
  return <ul className="adm-pd-checks">
    {lines.map((l) => <li key={l.text} className={`is-${l.tone}`}>{l.tone === "ok" ? ICON_OK : ICON_WARN}<span>{l.text}</span></li>)}
  </ul>;
}

/** What the card says about where the book is. */
function Detail({ book, now, worker }: { book: Book; now: Date; worker?: WorkerStatus | null }): ReactNode {
  const w = book.workbook;
  switch (book.stage) {
    case "none":
      return <p className="adm-pd-text">{book.cardSavedAt ? `Card saved ${shortWhen(book.cardSavedAt, now)}.` : book.planStarted ? "Plan started." : "No card saved yet."} No workbook yet.</p>;
    case "making": {
      const run = book.run!.run;
      const v = makingView(run, book.run!.activity, now);
      if (v.waiting) return <div className="adm-pd-run"><span className="adm-pd-run-top"><b>Waiting to start</b></span>
        <span className="adm-pd-sub">{run.runner === "mac" ? waitingLine(run, worker) : v.line}</span>
        {v.warn && <span className="adm-pd-warn" role="status">{v.warn}</span>}</div>;
      return <div className="adm-pd-run">
        <span className="adm-pd-run-top">{!v.warn && <span className="adm-pd-pulse" aria-hidden="true" />}<b>{v.percent === null ? "Started" : `${v.percent}% done`}</b>{v.timeLeft && <span className="adm-pd-left">{v.timeLeft}</span>}</span>
        {v.percent !== null && <span className="adm-pd-meter" role="progressbar" aria-label={`${book.child}, Book ${book.number}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.percent}><i style={{ width: `${v.percent}%` }} /></span>}
        <span className="adm-pd-sub">{v.line}. Started {shortWhen(run.startedAt ?? run.createdAt, now)}.</span>
        {v.warn && <span className="adm-pd-warn" role="status">{v.warn}</span>}
      </div>;
    }
    case "review": {
      if (!book.run) return <p className="adm-pd-text">Taken back to draft for changes.</p>;
      const c = book.run.counts;
      return <p className="adm-pd-text">{c ? `${pl(c.pages, "page", "pages")}, ${pl(c.questions, "question", "questions")}.` : "The draft is ready."}</p>;
    }
    case "approved": return <p className="adm-pd-text">Approved {shortWhen(w?.approvedAt, now)}. Ready to print.</p>;
    case "printed": return <p className="adm-pd-text">Printed {shortWhen(w?.printedAt, now)}. Ready to ship.</p>;
    case "shipped": return <p className="adm-pd-text">Shipped {shortWhen(w?.shippedAt, now)}. Delivery not confirmed yet.</p>;
    case "delivered": return <p className="adm-pd-text">Delivered {shortWhen(book.deliveredAt, now)}.</p>;
  }
}

/** The card's one action, at the place where it is done. Home's production panel shows the same action. */
export function BookAction({ book, runner }: { book: Book; runner: "mac" | "server" }): ReactNode {
  const go = (href: string, text: string, primary: boolean) => <Link className={`btn adm-btn${primary ? "" : " ghost"}`} href={href} prefetch={false}>{text}</Link>;
  const w = book.workbook;
  switch (book.stage) {
    case "none": return <PrepareWorkbook childId={book.childId} child={book.child} runner={runner} label="Prepare workbook" />;
    case "making": return go(adminWorkbookRunPath(book.run!.run.id), "Open run", false);
    case "review": return book.run ? go(adminWorkbookRunPath(book.run.run.id), "Review draft", true)
      : book.draftRunId ? go(adminWorkbookRunPath(book.draftRunId), "Review draft", true) : w ? go(adminWorkbookPath(w.id), "Open workbook", true) : null;
    case "approved": return w ? go(`${adminWorkbookPath(w.id)}#print-and-ship`, "Mark printed", false) : null;
    case "printed": return w ? go(`${adminWorkbookPath(w.id)}#print-and-ship`, "Mark shipped", false) : null;
    case "shipped": return w ? go(`${adminWorkbookPath(w.id)}#workbook-delivery`, "Confirm delivery", false) : null;
    case "delivered": return w ? go(adminWorkbookPath(w.id), "Open workbook", false) : null;
  }
}

const TONE: Record<Stage, Tone> = { none: "warn", review: "warn", making: "info", approved: "muted", printed: "muted", shipped: "muted", delivered: "ok" };

function BookCard({ book, now, worker, runner }: { book: Book; now: Date; worker?: WorkerStatus | null; runner: "mac" | "server" }) {
  const you = NEEDS_YOU.includes(book.stage);
  const when = book.stage === "review" && book.run ? `Made ${shortWhen(book.run.run.finishedAt ?? book.run.run.createdAt, now)}` : "";
  return <article className={`adm-pd-book${you ? " is-you" : ""}${book.test ? " is-test" : ""}`} aria-label={`${book.child}, Book ${book.number}: ${STAGE_TEXT[book.stage]}`}>
    <div className="adm-pd-top">
      <Face book={book} large />
      <span className="adm-pd-who">
        <b><Link href={childPath(book.childId)}>{book.child}</Link> · Book {book.number}<TestTag test={book.test} /></b>
        {book.family && <span><Link href={adminParentPath(book.parentId)}>{book.family}</Link></span>}
      </span>
      <Chip tone={TONE[book.stage]}>{STAGE_TEXT[book.stage]}</Chip>
    </div>
    <Detail book={book} now={now} worker={worker} />
    <Checks book={book} />
    {book.tries.length > 0 && <details className="adm-pd-tries">
      <summary>{pl(book.tries.length, "earlier try", "earlier tries")}</summary>
      <ul>{book.tries.map((t) => <li key={t.runId}>
        <Link href={adminWorkbookRunPath(t.runId)}>{t.number !== book.number ? `Book ${t.number}, ` : ""}{shortWhen(t.at, now)}</Link>: {t.text}
      </li>)}</ul>
    </details>}
    <div className="adm-pd-foot">{when && <span className="adm-pd-when">{when}</span>}<span className="adm-pd-act"><BookAction book={book} runner={runner} /></span></div>
  </article>;
}

/** The stage tracker: each stage with its count and faces; each one a link that shows only its books. */
function Tracker({ books, stage }: { books: Book[]; stage: Stage | null }) {
  const total = stageCounts(books).reduce((n, s) => n + s.count, 0);
  return <section className="adm-pd-lead" aria-labelledby="pd-stages">
    <div className="adm-pd-lead-head">
      <h2 className="eyebrow" id="pd-stages">{pl(total, "book", "books")} by stage</h2>
      <span className="adm-pd-hint">Pick a stage to show only its books.</span>
      {stage && <Link className="adm-pd-clear" href={stageHref(null)}>Show all</Link>}
    </div>
    <StageTrack books={books} stage={stage} />
  </section>;
}

/**
 * The tracker's stages, each a link to Production showing only that stage. Vertical in a narrow box, a row of seven
 * in a wide one. Home shows it too, in its production panel. `stage`: the stage the page shows now.
 */
export function StageTrack({ books, stage = null }: { books: readonly Book[]; stage?: Stage | null }) {
  const stages = stageCounts(books);
  return <ol className="adm-pd-stages">
    {stages.map((s) => {
      const on = stage === s.stage;
      const cls = ["adm-pd-stage", s.count ? "" : "is-zero", s.needsYou ? "is-you" : "", s.stage === "delivered" && s.count ? "is-done" : "", on ? "is-on" : ""].filter(Boolean).join(" ");
      return <li key={s.stage} className={cls}>
        <Link href={stageHref(on ? null : s.stage)} aria-current={on ? "true" : undefined}
          aria-label={`${STAGE_TEXT[s.stage]}: ${pl(s.count, "book", "books")}${s.needsYou ? ", needs you" : ""}. ${on ? "Show all stages." : "Show only these."}`}>
          <span className="adm-pd-node">{s.count}</span>
          <span className="adm-pd-stage-text"><b>{STAGE_TEXT[s.stage]}</b>{s.needsYou && <span className="adm-pd-you">Needs you</span>}</span>
          <span className="adm-pd-faces">{s.faces.map((b) => <Face key={b.childId} book={b} />)}</span>
        </Link>
      </li>;
    })}
  </ol>;
}

/**
 * The Production board. `stage`: show only this stage (?stage=). `showOlder`: Done shows every delivered book
 * (?older=1). `runner`: where a prepared workbook is made, for the prepare button's words.
 */
export function ProductionBoard({ books, now, stage = null, showOlder = false, worker, runner, incomplete = false }: {
  books: Book[]; now: Date; stage?: Stage | null; showOlder?: boolean; worker?: WorkerStatus | null; runner: "mac" | "server"; incomplete?: boolean;
}) {
  const groups = groupBooks(books, now, { stage, showOlder: showOlder || stage === "delivered" });
  const shown = stage ? groups.filter((g) => g.books.length > 0 || g.older + g.olderTests > 0) : groups;
  const making = groups.some((g) => g.books.some((b) => b.stage === "making"));
  return <div className="adm-pd">
    {making && <RunRefresh seconds={REFRESH_SECONDS} />}
    <Tracker books={books} stage={stage} />
    {shown.map((g) => <section key={g.key} className="adm-pd-group" aria-labelledby={`pd-${g.key}`}>
      <div className="adm-pd-group-head">
        <h2 id={`pd-${g.key}`}>{g.title}</h2>
        <span className="adm-pd-count" aria-label={pl(g.count, "book", "books")}>{g.count}</span>
        <p>{g.hint}</p>
      </div>
      {g.books.length
        ? <div className="adm-pd-cards">{g.books.map((b) => <BookCard key={b.childId} book={b} now={now} worker={worker} runner={runner} />)}</div>
        : <p className="adm-pd-empty">{g.older + g.olderTests > 0 ? "No books delivered in the last 30 days." : "Nothing here right now."}</p>}
      {g.older + g.olderTests > 0 && <p className="adm-pd-more"><Link href={stageHref(stage, true)}>{g.older > 0 ? `Show older (${g.older})` : "Show older"}</Link></p>}
    </section>)}
    {stage && shown.length === 0 && <p className="adm-pd-empty">No books at this stage right now. <Link href={stageHref(null)}>Show all</Link></p>}
    {incomplete && <p className="adm-note" role="status">Some books could not be loaded. Showing the first {books.filter((b) => !b.test).length}.</p>}
  </div>;
}
