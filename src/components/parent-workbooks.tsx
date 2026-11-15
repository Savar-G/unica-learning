import Link from "next/link";
import type { ReactNode } from "react";
import { SupportPage } from "@/components/support-page";
import { formatCalendarDate } from "@/lib/family-time";
import { workbookAnswersPath } from "@/lib/parent-workbook-answers";
import { workbookPath, workbooksPath } from "@/lib/parent-shell";
import { scanPagePath } from "@/lib/scan-tab";
import type { CurrentWorkbookView, ShippedBookView, WorkbooksView } from "@/lib/parent-view";
import { mainBook, minutesLine, pageList, type BookDays } from "@/lib/workbook-days";
import "./parent-option-a.css";
import "./parent-workbooks.css";

// The Workbooks tab (#558, #1031, Option A look): the current book as a cover card with its 10 days beneath it (the days
// come from the book's printed plan and replace the old Schedule page), then the next workbook, answer keys and the older
// books. Home's "Today" row opens it at today's day. The cards, circles and the orange Scan button are Home's.

const shortDate = (day: string) => formatCalendarDate(day, { month: "short", day: "numeric" });

/** The Unica 3×3 mark on the cover tile. */
function Mark() {
  return (
    <svg className="wb-mark" viewBox="0 0 1000 1000" aria-hidden="true">
      <rect width="1000" height="1000" fill="#111" />
      <rect x="36" y="36" width="286" height="286" fill="#FFD23F" /><rect x="357" y="36" width="286" height="286" fill="#fff" /><rect x="679" y="36" width="286" height="286" fill="#3366F0" />
      <rect x="36" y="357" width="286" height="286" fill="#fff" /><rect x="357" y="357" width="286" height="286" fill="#FF6430" /><rect x="679" y="357" width="286" height="286" fill="#fff" />
      <rect x="36" y="679" width="286" height="286" fill="#16A06A" /><rect x="357" y="679" width="286" height="286" fill="#fff" /><rect x="679" y="679" width="286" height="286" fill="#B8B3AA" />
    </svg>
  );
}

/** The cover tile: the mark over "Book N". */
const Tile = ({ number, small = false }: { number: number; small?: boolean }) => (
  <div className={small ? "wb-tile is-small" : "wb-tile"} aria-hidden="true"><Mark /><b>Book {number}</b></div>
);

/** What the cover says under the book's name. */
function coverSub(book: ShippedBookView, days: BookDays | null, showDay: boolean, delivery: CurrentWorkbookView | null): string {
  if (book.deliveredOn && days && showDay) return `Day ${days.day} of ${days.rows.length}${days.topic ? ` · ${days.topic}` : ""}`;
  if (book.deliveredOn) return `Delivered ${shortDate(book.deliveredOn)}`;
  if (delivery?.delivery?.method === "hand") return "We will contact you to arrange delivery by hand.";
  return book.shippedOn ? `On its way. Sent ${shortDate(book.shippedOn)}.` : "On its way.";
}

/**
 * One book: its cover card, the quiet line of facts, the orange row of a day with pages still to scan, the days and "How to
 * follow the 10 days". `days` null: the printed plan could not be read, so only the cover shows. `showDay`: the cover says
 * which day the child is on (the current book only).
 */
export function BookPanel({ book, days, list, showDay, delivery = null, scanOpen, below }: {
  book: ShippedBookView; days: BookDays | null; list: ReactNode; showDay: boolean; delivery?: CurrentWorkbookView | null; scanOpen: boolean; below?: ReactNode;
}) {
  const delivered = book.deliveredOn !== null;
  return (
    <>
      <section className="pa-card wb-cover" aria-label={`Workbook ${book.number}`}>
        <Tile number={book.number} />
        <div className="wb-cover-text">
          <h2>Workbook {book.number}</h2>
          <p className="wb-sub">{coverSub(book, days, showDay, delivery)}</p>
          {days && delivered && <>
            <div className="wb-bar" role="progressbar" aria-label={`Workbook ${book.number} pages scanned`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={days.percent}><i style={{ width: `${days.percent}%` }} /></div>
            <p className="wb-sub">{days.scanned} of {days.total} pages scanned</p>
          </>}
        </div>
      </section>
      {days && <p className="wb-facts">{minutesLine(days.minutes)} · 5 days a week · Days 1–{days.rows.length} in order</p>}
      {below}
      {days && delivered && scanOpen && days.gaps.map(gap => (
        <div className="pa-card wb-scan" key={gap.day}>
          <div><b>Day {gap.day} still to scan</b><span>Pages {pageList(gap.pages)}</span></div>
          <Link className="pa-scanbtn" href={scanPagePath(book.id, gap.pages[0])} aria-label={`Scan Day ${gap.day}`}>Scan</Link>
        </div>
      ))}
      {days && list}
      {days && (
        <details className="pa-card wb-guide">
          <summary><b>How to follow the {days.rows.length} days</b><span className="wb-chev" aria-hidden="true">›</span></summary>
          <p>Pick 5 days a week that work for your family, for example Monday to Friday, and do the days in order. The days off are for rest. Extra practice is optional.</p>
        </details>
      )}
    </>
  );
}

export function ParentWorkbooks({ view, days, list, scanOpen }: { view: WorkbooksView; days: BookDays | null; list: ReactNode; scanOpen: boolean }) {
  const { child, current, next, books } = view;
  const name = child.firstName;
  const main = mainBook(books);
  const others = books.filter(b => b.id !== main?.id);
  return (
    <SupportPage label="Workbooks" title={`${name}'s workbooks`} wide>
      <div className="pa-wrap"><div className="pa wb">
        <div className="wb-col">
          {main ? <BookPanel book={main} days={days} list={list} showDay scanOpen={scanOpen} delivery={current?.id === main.id ? current : null}
            below={<>
              {next.kind === "range" && <p className="wb-facts">Next workbook: about {shortDate(next.earliest)} – {shortDate(next.latest)}</p>}
              {next.kind === "past_estimate" && <p className="wb-facts">Next workbook: later than our estimate. We will email you when it is on its way.</p>}
            </>} /> : (
            <section className="pa-card wb-cover" aria-label="First workbook">
              <Tile number={1} />
              <div className="wb-cover-text">
                <h2>First workbook</h2>
                <p className="wb-sub">Not sent yet</p>
                <p className="wb-sub">We will email you when {name}&apos;s first workbook is on its way.</p>
              </div>
            </section>
          )}
          {current?.delivery?.method === "mail" && !current.deliveredOn && (
            <section className="pa-card wb-track" aria-labelledby="wb-track">
              <h2 id="wb-track">Tracking for workbook {current.number}</h2>
              <dl>
                <dt>Carrier</dt><dd>{current.delivery.carrier}</dd>
                <dt>Tracking number</dt><dd>{current.delivery.trackingNumber}</dd>
              </dl>
              {current.delivery.trackingUrl && <a className="wb-view" href={current.delivery.trackingUrl} target="_blank" rel="noopener noreferrer">Track the package <span aria-hidden="true">↗</span></a>}
            </section>
          )}
        </div>
        {books.length > 0 && (
          <div className="wb-col">
            <section className="pa-card wb-keys" aria-labelledby="wb-keys">
              <h2 id="wb-keys">Answer keys</h2>
              <p className="wb-note">Each answer key opens after we confirm that workbook has arrived.</p>
              <ul>
                {books.map(b => (
                  <li key={b.id}>
                    <b>Workbook {b.number}</b>
                    {b.deliveredOn
                      ? <Link className="wb-view" href={workbookAnswersPath(child.id, b.id)} prefetch={false} aria-label={`View the answer key for workbook ${b.number}`}>View</Link>
                      : <span className="wb-note">Available after delivery</span>}
                  </li>
                ))}
              </ul>
            </section>
            {others.length > 0 && (
              <section aria-labelledby="wb-older">
                <h3 className="wb-label" id="wb-older">Older workbooks</h3>
                <ul className="pa-card wb-older">
                  {others.map(b => (
                    <li key={b.id}>
                      <Link href={workbookPath(child.id, b.id)} prefetch={false}>
                        <Tile number={b.number} small />
                        <span className="wb-older-t"><b>Workbook {b.number}</b><span>{b.deliveredOn ? `Delivered ${shortDate(b.deliveredOn)}` : "On its way"}</span></span>
                        <span className="wb-chev" aria-hidden="true">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div></div>
    </SupportPage>
  );
}

/** One book's own page: the same cover, scan row, days and guide, with a way back to the tab. */
export function ParentWorkbookBook({ child, book, days, list, scanOpen, current }: { child: WorkbooksView["child"]; book: ShippedBookView; days: BookDays | null; list: ReactNode; scanOpen: boolean; current: boolean }) {
  return (
    <SupportPage label="Workbooks" title={`${child.firstName}'s workbooks`} wide>
      <div className="pa-wrap"><div className="pa wb">
        <div className="wb-col">
          <Link className="wb-back" href={workbooksPath(child.id)}><span aria-hidden="true">‹</span> Workbooks</Link>
          <BookPanel book={book} days={days} list={list} showDay={current} scanOpen={scanOpen} />
        </div>
      </div></div>
    </SupportPage>
  );
}
