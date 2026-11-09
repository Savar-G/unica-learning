import type { ReactNode } from "react";
import type { markingPageView } from "@/lib/scan-marking";
import { familyMoment, PACIFIC_ZONE, type FamilyZone } from "@/lib/family-time";
import "./scan-pages.css";
import { ScanMarkChange } from "./scan-mark-change";

/** Page results and parent review share the canonical effective projection. */
/**
 * The page line agrees with its answers (#715). Our team checking an answer wins over an unmarked answer: it is the
 * thing happening now, and it does not claim the other answers are marked.
 */
export function pageLine(result: Pick<ReturnType<typeof markingPageView>, "completion" | "counts">): string {
  if (result.completion.status === "complete") return result.counts.scored === 0 ? "This page has no scored answers." : "This page has been marked.";
  if (result.counts.teamChecks > 0) return "Our team is checking some answers on this page.";
  return result.counts.scored > 0 ? "Some answers on this page are not marked yet." : "This page is not marked yet.";
}
/** `zone`: the family's time zone (src/lib/family-time.ts), resolved on the server; Pacific when none is given. */
export function ScanMarkingResults({ result, showHeading = true, photo, parent, itemExplanation, zone = PACIFIC_ZONE }: { zone?: FamilyZone; parent?: string; photo?: string; result: ReturnType<typeof markingPageView> & { photoAvailable: boolean; budgetHeld?: boolean }; showHeading?: boolean; itemExplanation?: (item: ReturnType<typeof markingPageView>["items"][number]) => ReactNode }) {
  return <section className="scan-preview scan-marking-results" aria-label="Page results">
    {showHeading && <h2>Page results</h2>}
    {result.budgetHeld && <p role="status">We cannot check more pages right now</p>}
    {!result.photoAvailable && <p>Photo no longer available</p>}
    {result.completion.total === 0 ? <p role="status">Your page is not marked yet.</p>
      : <>
        <p role="status">{pageLine(result)}</p>
        <ol>{result.items.map((item) => <li key={item.itemId}>
          <p><b>Question {item.number}</b>: {item.label}</p>
          {item.readAnswerText !== null && <p>We read: {item.readAnswerText === "" ? "Empty answer" : item.readAnswerText}</p>}
          {item.result !== null && <p className="small">{item.actor === "parent" ? "Parent" : item.actor === "admin" ? "Our team" : "Automatic check"}{Number.isFinite(Date.parse(item.at)) && <> · {familyMoment(item.at, zone)}</>}</p>}
          {result.solutionsAvailable && itemExplanation?.(item)}
          {photo && item.canChange && <ScanMarkChange key={`${parent}:${photo}:${item.itemId}`} photo={photo} item={item} parent={parent} complete={result.completion.status === "complete"} />}
        </li>)}</ol>
      </>}
  </section>;
}
