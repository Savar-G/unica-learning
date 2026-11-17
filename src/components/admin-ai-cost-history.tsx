import Link from "next/link";
import { Table } from "@/components/admin";
import { Empty, SectionHead, Tiles } from "@/components/admin-blocks";
import type { HistoryGroup, HistoryView } from "@/lib/ai-cost-history";

const amount = (r: HistoryGroup) => `USD ${r.known_cost_usd}${r.unknown_cost_count ? ` + ${r.unknown_cost_count} unknown` : ""}`;

/** Reuses the approved B report parts. Historical full snapshots never receive the page date range. */
export function AdminAiCostHistory({ view, range, selected }: { view: HistoryView | null; range: string; selected?: string }) {
  const s = view?.selected;
  return <details className="ai-disclosure">
    <summary>Historical exports</summary>
    <SectionHead title="Historical exports" line="Each export is a full snapshot. The page date filter does not apply. CSV date zones are unknown." />
    <p className="ai-note">Exports can overlap with each other, app records and provider receipts. These amounts are separate evidence. Do not add them to billed totals.</p>
    {!view ? <Empty>{selected !== undefined ? "The selected historical export is invalid or unavailable. No other export is shown." : "Historical exports are unavailable. The cost is unknown."}</Empty> : <>
      <nav className="ai-reports" aria-label="Historical export selection">
        {view.exports.map((e, i) => <Link key={e.export_id} href={`/admin/ai?${new URLSearchParams({ range, report: "records", historicalExport: e.export_id })}`}
          prefetch={false} scroll={false} aria-current={s?.export_id === e.export_id ? "page" : undefined}>
          Export {i + 1} · {e.rows.toLocaleString("en-CA")} generations
        </Link>)}
      </nav>
      <p className="ai-note">Up to 50 completed exports are listed, newest completion first.{view.omitted_exports > 0 ? ` ${view.omitted_exports} older exports are not listed.` : ""} One export is shown at a time.</p>
      {view.selection === "empty" && <Empty>No completed export is available. This does not establish zero historical cost.</Empty>}
      {view.selection === "missing" && <Empty>The selected export is missing or incomplete. No other export is shown.</Empty>}
      {s && <>
        <Tiles label="Historical source evidence" tiles={[
          { key: "csv", label: "Logs CSV known amount", value: `USD ${s.known_cost_usd}`, sub: `${s.rows.toLocaleString("en-CA")} generations; ${s.unknown_cost_count} unknown costs` },
          { key: "analytics", label: "Associated analytics snapshot", value: `USD ${s.analytics_total_usd}`, sub: "Separate source amount" },
          { key: "difference", label: "CSV minus analytics", value: `USD ${s.difference_usd}`, sub: "Difference unresolved; neither source is adjusted" },
        ]} />
        <p className="ai-note">{s.unknown_time_count} generations have an unknown event time zone. Capture time is unknown. Selection bounds do not establish row event times.</p>
        <p className="ai-note">{s.matched_rows} exact current app matches. {s.ambiguous_rows} ambiguous matches are suppressed. {s.unknown_family_rows} generations have no known family; {s.unknown_child_rows} have no known child. Key labels do not establish a feature or family.</p>
        {s.omitted_groups > 0 && <p className="ai-note">{s.omitted_groups} groups are not shown. Each breakdown shows at most 1,000 groups. Totals include every generation.</p>}
        <Table label="Historical models" head={["Source model", "Known source amount", "Generations"]} empty="No model groups.">
          {s.models.map((r, i) => <tr key={i}><td>{r.label ?? "Unknown model"}</td><td>{amount(r)}</td><td>{r.rows}</td></tr>)}
        </Table>
        <Table label="Historical key labels" head={["Source key label", "Known source amount", "Generations"]} empty="No key groups.">
          {s.keys.map((r, i) => <tr key={i}><td>{r.label ?? "Unknown key label"}</td><td>{amount(r)}</td><td>{r.rows}</td></tr>)}
        </Table>
        <Table label="Historical exact app ownership" head={["Current family", "Current child", "Matched feature", "Known source amount", "Generations"]} empty="No app groups.">
          {s.ownership.map((r, i) => <tr key={i}>
            <td>{r.parent_id ? <Link href={`/admin/parents/${r.parent_id}`} prefetch={false}>{r.parent_name ?? "Family"}</Link> : "Unknown family"}</td>
            <td>{r.child_id ? <Link href={`/admin/children/${r.child_id}`} prefetch={false}>{r.child_name ?? "Child"}</Link> : "Unknown child"}</td>
            <td>{r.feature ?? "Unknown feature"}</td><td>{amount(r)}</td><td>{r.rows}</td>
          </tr>)}
        </Table>
        <details className="ai-disclosure adm-tech"><summary>Technical details</summary>
          <p className="ai-note">Workspace basis: the controller recorded the export procedure. Rows do not provide workspace proof. The source file hash binds the CSV. The evidence hash binds retained fields. Original decimal text is retained. Component amounts are not added to the total.</p>
          <pre>{JSON.stringify(s.manifest, null, 2)}</pre>
          <p className="ai-note">The first 100 evidence rows are shown. {s.omitted_rows} rows are not shown. Original source dates have no verified zone.</p>
          <pre>{JSON.stringify(s.technical_rows, null, 2)}</pre>
        </details>
      </>}
    </>}
  </details>;
}
