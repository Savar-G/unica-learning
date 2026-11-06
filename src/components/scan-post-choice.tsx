"use client";
import { scanEventTicket } from "@/lib/scan-track";
import { useScanContext } from "@/lib/use-scan-context";
/** S9 and #337 are not released. This slice cannot start Maya. */
export function ScanPostChoice({ parent, photo }: { parent: string; photo: string }) {
  const begin = useScanContext(parent, photo);
  return <section className="scan-post-choice" aria-label="After this page">
    <h2>What would you like to do?</h2>
    <button type="button" className="btn ghost" disabled aria-describedby="maya-scan-unavailable">Fix mistakes with Maya</button>
    <p id="maya-scan-unavailable">Fixing these mistakes with Maya is not available here yet.</p>
    <a className="btn" href="#page-results" onClick={() => scanEventTicket(begin())("scan_post_scan_choice", "results_only")}>Just show results</a>
  </section>;
}
