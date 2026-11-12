// #870 The Book 1 starting record (the baseline) of the approved version, on the admin run page.
import { book1PendingText } from "@/lib/admin-book1-baselines";
export type Book1BaselineStatus = { revision: number } & ({ state: "saved" | "not-yet" } | { state: "pending"; reason: string });

export function Book1Baseline({ status }: { status: Book1BaselineStatus | null }) {
  if (!status) return null;
  return <section aria-labelledby="book1-baseline-title">
    <h2 id="book1-baseline-title">Book 1 starting record</h2>
    {status.state === "saved" && <p>Saved for version {status.revision}. The next book is planned from it.</p>}
    {status.state === "not-yet" && <p>Not saved yet for version {status.revision}. The site tries again within 15 minutes.</p>}
    {status.state === "pending" && <p>Not saved for version {status.revision}. {book1PendingText(status.reason)}</p>}
  </section>;
}
