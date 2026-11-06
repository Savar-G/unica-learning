import Link from "next/link";
import { workbookAnswersPath } from "@/lib/parent-workbook-answers";
import type { WorkbooksView, CurrentWorkbookView } from "@/lib/parent-view";
import { SupportPage } from "@/components/support-page";
import { formatCalendarDate } from "@/lib/family-time";
import "./parent-workbooks.css";

/** "November 16": a calendar day in family time, which the view already holds. */
const date = (day: string) => formatCalendarDate(day, { month: "long", day: "numeric" });

export function ParentWorkbooks({ child, current, next, books }: WorkbooksView) {
  const name = child.firstName;
  return (
    <SupportPage label="Workbooks" title={`${name}'s workbooks`}>
      <div className="pw-tiles">
        {current ? <CurrentTile book={current} /> : (
          <section className="pw-card" aria-labelledby="pw-current">
            <p className="pw-label" id="pw-current">First workbook</p>
            <p className="pw-value">Not sent yet</p>
            <p className="pw-sub">We will email you when {name}&apos;s first workbook is on its way.</p>
          </section>
        )}
        {next.kind === "range" && (
          <section className="pw-card" aria-labelledby="pw-next">
            <p className="pw-label" id="pw-next">Next workbook</p>
            <p className="pw-value">{date(next.earliest)} to {date(next.latest)}</p>
            <p className="pw-sub">An estimate. We will email you when it is on its way.</p>
          </section>
        )}
        {next.kind === "past_estimate" && (
          <section className="pw-card" aria-labelledby="pw-next">
            <p className="pw-label" id="pw-next">Next workbook</p>
            <p className="pw-value">Not sent yet</p>
            <p className="pw-sub">This is later than our estimate. We will email you when {name}&apos;s next workbook is on its way.</p>
          </section>
        )}
      </div>
      {current?.delivery?.method === "mail" && !current.deliveredOn && (
        <section className="pw-card pw-section" aria-labelledby="pw-track">
          <h2 id="pw-track">Tracking for workbook {current.number}</h2>
          <dl className="pw-track">
            <dt>Carrier</dt><dd>{current.delivery.carrier}</dd>
            <dt>Tracking number</dt><dd>{current.delivery.trackingNumber}</dd>
          </dl>
          {current.delivery.trackingUrl && <a className="btn ghost" href={current.delivery.trackingUrl} target="_blank" rel="noopener noreferrer">Track the package <span aria-hidden="true">↗</span></a>}
        </section>
      )}
      {books.length > 0 && (
        <section className="pw-card pw-section" aria-labelledby="pw-books">
          <h2 id="pw-books">Answer keys</h2>
          <p className="pw-sub">Each answer key opens after we confirm that workbook has arrived.</p>
          <ul className="pw-books">
            {books.map((b) => (
              <li key={b.id}>
                <span className="pw-book"><b>Workbook {b.number}</b>{b.shippedOn && <span>Sent {date(b.shippedOn)}</span>}</span>
                {b.deliveredOn ? <Link className="btn ghost" href={workbookAnswersPath(child.id, b.id)} prefetch={false} aria-label={`View the answer key for workbook ${b.number}`}>View answer key</Link> : <span className="pw-sub">Available after delivery</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </SupportPage>
  );
}

/** The newest shipped book: delivered, or on its way. */
function CurrentTile({ book }: { book: CurrentWorkbookView }) {
  const sub = book.deliveredOn ? `Delivered ${date(book.deliveredOn)}.`
    : book.delivery?.method === "hand" ? "We will contact you to arrange delivery by hand."
    : book.shippedOn ? `On its way. Sent ${date(book.shippedOn)}.` : "On its way.";
  return (
    <section className="pw-card" aria-labelledby="pw-current">
      <p className="pw-label" id="pw-current">This workbook</p>
      <p className="pw-value">Workbook {book.number}</p>
      <p className="pw-sub">{sub}</p>
    </section>
  );
}
