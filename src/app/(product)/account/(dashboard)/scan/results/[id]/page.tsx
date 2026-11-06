import Link from "next/link";
import { notFound } from "next/navigation";
import { scanSession } from "@/lib/scan-photo-server";
import { markingAccess, readScanMarking } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { ScanMarkingResults } from "@/components/scan-marking-results";
import { SupportPage } from "@/components/support-page";

export default async function ScanResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent)) notFound();
  const result = await readScanMarking(session.admin, session.parent, id);
  if (!result || !await session.active()) notFound();
  return <SupportPage label="Your account" title="Page results"><div className="scan-pages">
    <Link href="/account/scan">Back to Scan pages</Link>
    <ScanMarkingResults photo={id} result={result} showHeading={false} />
    <form action={`/account/scan/results/${id}`}><button type="submit" className="btn ghost scan-result-refresh">Refresh results</button></form>
  </div></SupportPage>;
}
