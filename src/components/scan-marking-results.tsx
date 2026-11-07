import type { ReactNode } from "react";
import type { markingPageView } from "@/lib/scan-marking";
import "./scan-pages.css";
import { ScanMarkChange } from "./scan-mark-change";

/** Page results and parent review share the canonical effective projection. */
export function ScanMarkingResults({ result, showHeading = true, photo, parent, itemExplanation }: { parent?: string; photo?: string; result: ReturnType<typeof markingPageView> & { photoAvailable: boolean; budgetHeld?: boolean }; showHeading?: boolean; itemExplanation?: (item: ReturnType<typeof markingPageView>["items"][number]) => ReactNode }) {
  return <section className="scan-preview scan-marking-results" aria-label="Page results">
    {showHeading && <h2>Page results</h2>}
    {result.budgetHeld && <p role="status">We cannot check more pages right now</p>}
    {!result.photoAvailable && <p>Photo no longer available</p>}
    {result.completion.total === 0 ? <p role="status">Your page is not marked yet.</p>
      : <>
        <p role="status">{result.completion.status === "complete" ? result.counts.scored === 0 ? "This page has no scored answers." : "This page has been marked."
          : result.counts.teamChecks > 0 ? "Our team is checking some answers on this page." : "This page is not marked yet."}</p>
        <ol>{result.items.map((item) => <li key={item.itemId}>
          <p><b>Question {item.number}</b>: {item.label}</p>
          {item.readAnswerText !== null && <p>We read: {item.readAnswerText === "" ? "Empty answer" : item.readAnswerText}</p>}
          {item.result !== null && <p className="small">{item.actor === "parent" ? "Parent" : item.actor === "admin" ? "Our team" : "Automatic check"} · {item.at}</p>}
          {result.solutionsAvailable && itemExplanation?.(item)}
          {photo && item.canChange && <ScanMarkChange key={`${parent}:${photo}:${item.itemId}`} photo={photo} item={item} parent={parent} complete={result.completion.status === "complete"} />}
        </li>)}</ol>
      </>}
  </section>;
}
