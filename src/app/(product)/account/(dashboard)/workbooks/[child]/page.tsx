import { notFound, redirect } from "next/navigation";
import { SupportPage } from "@/components/support-page";
import { formatCalendarDate } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { readWorkbooks, type CurrentWorkbookView } from "@/lib/parent-view";
import { signedInParentView } from "@/lib/parent-view-server";
import "@/components/parent-workbooks.css";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbooks", description: "Your child's workbooks.", index: false });

// The Workbooks tab (#558, spec #544, D-246): the current book and its tracking, a date range for the next book, and the
// PDF of each shipped book. Only for families the dashboard is open to; every other family gets the 404, as before.
// Pause (#559), page history and answers (#565) come later; Skip, See the full plan and the More / New / Less / Review
// list are not in the product.

/** "November 16": a calendar day in family time, which the view already holds. */
const date = (day: string) => formatCalendarDate(day, { month: "long", day: "numeric" });

/** The signed-in parent's child's Workbooks tab; a redirect or the 404 when there is none to show. */
async function load(childId: string) {
  const reader = await signedInParentView();
  if (!reader) redirect("/sign-in");
  if (!(await parentDashboard())) notFound();
  return (await readWorkbooks(reader, childId, Date.now())) ?? notFound();
}

export default async function Workbooks({ params }: PageProps<"/account/workbooks/[child]">) {
  const { child, current, next, books } = await load((await params).child);
  const name = child.firstName;
  return (
    <SupportPage label="Workbooks" title={`${name}'s workbooks`}>
      <div className="pw-tiles">
        {current ? <CurrentTile book={current} /> : (
          <section className="pw-card" aria-labelledby="pw-current">
            <p className="pw-label" id="pw-current">First workbook</p>
            <p className="pw-value">Being prepared</p>
            <p className="pw-sub">We are making {name}&apos;s first workbook. We will email you when it is on its way.</p>
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
          <h2 id="pw-books">Print a page again</h2>
          <ul className="pw-books">
            {books.map((b) => (
              <li key={b.id}>
                <span className="pw-book"><b>Workbook {b.number}</b>{b.shippedOn && <span>Sent {date(b.shippedOn)}</span>}</span>
                {b.hasPdf && <a className="btn ghost" href={`/api/account/workbooks/${b.id}/pdf`} aria-label={`Download the PDF of workbook ${b.number}`}>Download PDF</a>}
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
