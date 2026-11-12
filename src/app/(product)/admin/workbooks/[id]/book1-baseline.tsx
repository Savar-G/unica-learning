// #870 The Book 1 starting record (the baseline) of the approved version, on the admin run page.
export type Book1BaselineStatus = { revision: number } & ({ state: "saved" | "not-yet" } | { state: "pending"; reason: string });

/** Plain words for a pending reason. */
export function book1PendingText(reason: string): string {
  if (reason === "planning-capture-missing") return "This run did not keep its plan input, so the site cannot save the record. Run the recovery script on the Mac (docs/workbook-worker.md).";
  if (reason === "curriculum-version-changed") return "The curriculum changed after this book was planned. Run the recovery script on the Mac: it uses the curriculum of the book's build (docs/workbook-worker.md).";
  if (reason === "activity-before-boundary") return "Pages of this book were marked before the record was saved. The record cannot be saved now.";
  if (reason === "revision-changed") return "The draft has a newer version than the approved one.";
  return `The save was refused (${reason}).`;
}

export function Book1Baseline({ status }: { status: Book1BaselineStatus | null }) {
  if (!status) return null;
  return <section aria-labelledby="book1-baseline-title">
    <h2 id="book1-baseline-title">Book 1 starting record</h2>
    {status.state === "saved" && <p>Saved for version {status.revision}. The next book is planned from it.</p>}
    {status.state === "not-yet" && <p>Not saved yet for version {status.revision}. The site tries again within 15 minutes.</p>}
    {status.state === "pending" && <p>Not saved for version {status.revision}. {book1PendingText(status.reason)}</p>}
  </section>;
}
