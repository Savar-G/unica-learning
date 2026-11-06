import type { markingPageView } from "@/lib/scan-marking";
import "./scan-pages.css";

/** Minimal S4 results. Corrections and history screens follow only after their dependent slices merge. */
export function ScanMarkingResults({ result, showHeading = true }: { result: ReturnType<typeof markingPageView> & { photoAvailable: boolean; budgetHeld?: boolean }; showHeading?: boolean }) {
  return <section className="scan-preview scan-marking-results" aria-label="Page results">
    {showHeading && <h2>Page results</h2>}
    {result.budgetHeld && <p role="status">We cannot check more pages right now</p>}
    {!result.photoAvailable && <p>Photo no longer available</p>}
    {result.completion.total === 0 ? <p role="status">Your page is waiting to be checked.</p>
      : <>
        <p role="status">{result.completion.status === "complete" ? result.counts.scored === 0 ? "This page has no scored answers." : "This page has been checked." : "This page still needs a check."}</p>
        <ol>{result.items.map((item) => <li key={item.itemId}>
          <p><b>Question {item.number}</b>: {item.label}</p>
          {item.readAnswerText !== null && <p>We read: {item.readAnswerText === "" ? "Empty answer" : item.readAnswerText}</p>}
        </li>)}</ol>
      </>}
  </section>;
}
