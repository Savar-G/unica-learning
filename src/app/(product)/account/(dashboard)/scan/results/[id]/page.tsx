import Link from "next/link";
import { notFound } from "next/navigation";
import { scanSession } from "@/lib/scan-photo-server";
import { markingAccess, readScanMarking } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { ScanPostChoice } from "@/components/scan-post-choice";
import { ScanMarkingResults } from "@/components/scan-marking-results";
import { SupportPage } from "@/components/support-page";
import { loadFamilyZone } from "@/lib/family-time-server";

// No "Mark changes" history for parents (2026-11-14): only our team changes a mark; admins see the history on /admin/scans/<id>.
export default async function ScanResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent, process.env, { photo: id })) notFound();
  const result = await readScanMarking(session.admin, session.parent, id);
  if (!result || !await session.active()) notFound();
  const zone = await loadFamilyZone(session.admin, session.parent);
  if (!await session.active()) notFound();
  return <SupportPage label="Your account" title="Page results"><div className="scan-pages">
    <Link href="/account/scan">Back to Scan pages</Link>
    {result.completion.status === "complete" && <ScanPostChoice parent={session.parent} photo={id} />}
    <div id="page-results"><ScanMarkingResults photo={id} parent={session.parent} result={result} showHeading={false} zone={zone} /></div>
    {/* No parent changes a mark (2026-11-14); a new photo of the page is the parent's way to have it read again. */}
    <p><Link className="scan-link" href="/account/scan">Take another photo</Link></p>
    <form action={`/account/scan/results/${id}`}><button type="submit" className="btn ghost scan-result-refresh">Refresh results</button></form>
  </div></SupportPage>;
}
