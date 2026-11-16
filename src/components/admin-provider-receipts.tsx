import Link from "next/link";
import { Table } from "@/components/admin";
import { Empty, Pills, SectionHead, Tiles, type Pill } from "@/components/admin-blocks";
import type { ProviderReceiptView, ReceiptGroup } from "@/lib/openrouter-provider-receipts";

const usd = (n: number) => `USD ${n > 0 && n < 1e-8 ? n.toString() : n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const amount = (row: ReceiptGroup) => `${usd(row.known_cost_usd)}${row.unknown_cost_receipts ? ` + ${row.unknown_cost_receipts} unknown` : ""}`;

/** Mount beside the application subtotal after #1129. Parent supplies period links and the server read result. */
export function AdminProviderReceipts({ view, periodLabel, ranges }: {
  view: ProviderReceiptView | null;
  periodLabel: string;
  ranges: Pill[];
}) {
  return <section aria-label="OpenRouter provider receipts">
    <SectionHead title="OpenRouter provider receipts" line={`${periodLabel}. All keys and all test and production costs are included.`} />
    <Pills label="Provider receipt period" pills={ranges} />
    <p>This provider subtotal is separate from the app subtotal. They can cover the same calls. Do not add them together. The account total comes from OpenRouter credits.</p>
    {view === null ? <Empty>Provider receipts are unavailable. The cost is unknown.</Empty> : <>
      <Tiles label="Provider receipt totals" tiles={[
        { key: "cost", label: "Recorded provider charges", value: usd(view.totals.known_cost_usd), sub: `${view.totals.unknown_cost_receipts} receipts have an unknown cost` },
        { key: "coverage", label: "App matches", value: `${view.totals.matched_receipts} / ${view.totals.receipts}`, sub: view.totals.receipts ? `${(100 * view.totals.matched_receipts / view.totals.receipts).toFixed(1)}% of received generations` : "No receipts in this period" },
        { key: "unknown", label: "Unmatched provider charges", value: usd(view.totals.unmatched_known_cost_usd), sub: `${view.totals.unmatched_receipts} receipts; ${view.totals.unmatched_unknown_cost_receipts} have an unknown cost` },
      ]} />
      <p>Coverage measures app matches within received generations. It does not prove that OpenRouter delivered every charge. Missing feature and child records stay unknown.</p>
      <p>First generation: {view.totals.first_receipt_at ?? "None"}. Last generation: {view.totals.last_receipt_at ?? "None"}. Last stored receipt: {view.totals.last_received_at ?? "None"}.</p>
      {view.omitted_groups > 0 && <p>{view.omitted_groups} detail groups are not shown. Totals include them.</p>}
      <Table label="Provider charges by model" head={["Model", "Recorded charges", "Generations"]} empty="No model records.">
        {view.models.map((r) => <tr key={r.label ?? "unknown"}><td>{r.label ?? "Unknown"}</td><td>{amount(r)}</td><td>{r.receipts}</td></tr>)}
      </Table>
      <Table label="Provider charges by API key" head={["Workspace / key ID", "Recorded charges", "Generations"]} empty="No key records.">
        {view.keys.map((r) => <tr key={`${r.workspace_id}/${r.api_key_id}`}><td>{r.workspace_id} / {r.api_key_id ?? "Unknown key"}</td><td>{amount(r)}</td><td>{r.receipts}</td></tr>)}
      </Table>
      <Table label="Provider charges by matched feature" head={["Feature", "Recorded charges", "Generations"]} empty="No feature records.">
        {view.features.map((r) => <tr key={r.label ?? "unknown"}><td>{r.label ?? "Unknown (no app match)"}</td><td>{amount(r)}</td><td>{r.receipts}</td></tr>)}
      </Table>
      <Table label="Provider charges with child attribution" head={["Child", "Feature", "Model", "Key ID", "Family", "Recorded charges", "Generations"]} empty="No child costs have an exact app match.">
        {view.children.map((r) => <tr key={`${r.child_id}/${r.feature}/${r.model}/${r.workspace_id}/${r.api_key_id}`}>
          <td><Link href={`/admin/children/${r.child_id}`} prefetch={false}>{r.child_id}</Link></td><td>{r.feature}</td><td>{r.model}</td>
          <td>{r.workspace_id} / {r.api_key_id ?? "Unknown key"}</td><td>{r.test_family ? "Test / team" : "Customer"}</td><td>{amount(r)}</td><td>{r.receipts}</td>
        </tr>)}
      </Table>
    </>}
  </section>;
}
