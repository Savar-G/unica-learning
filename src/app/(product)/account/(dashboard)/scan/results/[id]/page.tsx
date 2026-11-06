import Link from "next/link";
import { notFound } from "next/navigation";
import { scanSession } from "@/lib/scan-photo-server";
import { markingAccess, readScanMarking } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { markingCommand, scanMarkChanges } from "@/lib/scan-marking-store";
import { ScanPostChoice } from "@/components/scan-post-choice";
import { ScanMarkingResults } from "@/components/scan-marking-results";
import { SupportPage } from "@/components/support-page";

export default async function ScanResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ historyAfter?: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent)) notFound();
  const result = await readScanMarking(session.admin, session.parent, id);
  if (!result || !await session.active()) notFound();
  const after = (await searchParams).historyAfter ?? "0";
  if (!/^\d{1,15}$/.test(after)) notFound();
  const changes = await scanMarkChanges(markingCommand(session.admin), session.parent, id, Number(after));
  if (!await session.active()) notFound();
  return <SupportPage label="Your account" title="Page results"><div className="scan-pages">
    <Link href="/account/scan">Back to Scan pages</Link>
    {result.completion.status === "complete" && <ScanPostChoice parent={session.parent} photo={id} />}
    <div id="page-results"><ScanMarkingResults photo={id} parent={session.parent} result={result} showHeading={false} /></div>
    <details><summary>Parent mark changes</summary>
      {!changes.length ? <p>No more changes.</p> : <ol>{changes.map((c) => <li key={c.id}>Question {c.previous.expected.number}: {c.previous.observation.result ?? "Waiting for a check"} to {c.current.result}. Parent · {c.at}. We read: {c.previous.observation.readAnswerText ?? "Not read"}.</li>)}</ol>}
      {changes.length > 0 && <Link className="scan-link" href={`/account/scan/results/${id}?historyAfter=${changes[changes.length - 1].id}`}>More changes</Link>}
      {Number(after) > 0 && <Link className="scan-link" href={`/account/scan/results/${id}`}>First changes</Link>}
    </details>
    <form action={`/account/scan/results/${id}`}><button type="submit" className="btn ghost scan-result-refresh">Refresh results</button></form>
  </div></SupportPage>;
}
