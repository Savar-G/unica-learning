import Link from "next/link";
import { notFound } from "next/navigation";
import { draftSamplePages, getChild, getParent, requireAdmin, type AdminSession } from "@/lib/admin-store";
import { loadReportView } from "@/lib/report-loading";
import { adminReportReader } from "@/lib/report-loading-server";
import { resultsDeck, type DeckInput } from "@/lib/results-deck";
import { ResultsDeckView } from "@/components/results-deck";
import type { TestRow } from "@/lib/admin-store";

// The deck for a results call: this report's child first, then each sibling's latest finished report, read with the
// admin's session. Real pages show when a workbook was prepared for that child.
async function deckInputs(admin: AdminSession, id: string) {
  const reader = adminReportReader(admin);
  const first = await loadReportView(reader, id);
  if (!first) return null;
  const record = await getChild(admin, first.childId);
  const family = record ? await getParent(admin, record.child.parent_id) : null;
  const latest = new Map<string, TestRow>();
  for (const test of family?.tests ?? []) {
    if (test.child_id !== first.childId && test.reportId && test.status === "completed" && !latest.has(test.child_id)) latest.set(test.child_id, test);
  }
  const siblings = await Promise.all([...latest.values()].map((t) => loadReportView(reader, t.reportId!)));
  const loaded = [first, ...siblings.flatMap((s) => (s ? [s] : []))];
  const children: DeckInput[] = await Promise.all(loaded.map(async (r) => ({ view: r.view, pages: await draftSamplePages(admin, r.childId).catch(() => []) })));
  return { parentName: family?.parent.name ?? "", children };
}

export default async function ResultsDeckPage({ params }: PageProps<"/admin/reports/[id]/deck">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const inputs = await deckInputs(admin, id);
  if (!inputs) notFound();
  const month = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "America/Vancouver" }).format(new Date());
  return <>
    <p className="dk-bar-admin"><Link href={`/admin/reports/${id}`}>Back to the report</Link><span>Type the goals on slide 2. Cmd+P saves the deck as a PDF. Typed goals are not saved.</span></p>
    <ResultsDeckView deck={resultsDeck({ parentName: inputs.parentName, month, children: inputs.children })} />
  </>;
}
