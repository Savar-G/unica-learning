// The audit log of the admin Workbooks area (#312, #314): who did what and when to a run, a draft or a workbook, in
// plain words. A server component.
import type { AuditEntry } from "@/lib/admin-store";
import { when } from "@/lib/admin-view";
import { Table } from "@/components/admin";

const ACTION: Record<string, string> = {
  "run-started": "Started preparing", "run-retried": "Tried again after an error", "run-failed": "Failed", "run-stopped": "Stopped a run with no progress",
  "draft-stored": "Saved the draft", "run-resumed": "Picked up again after a stop", "run-routed": "Set where the run is made",
  "workbook-approved": "Approved for print", "workbook-printed": "Marked printed", "workbook-shipped": "Marked shipped",
};

/** An audit entry's details in plain words; the raw keys and values stay in the tooltip. */
function auditDetail(detail: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (k === "number" && typeof v === "number") lines.push(`Workbook ${v}`);
    else if (k === "attempt" && typeof v === "number") lines.push(`After try ${v}`);
    else if (k === "error" && typeof v === "string") lines.push(v);
    else if (k === "pages" && typeof v === "number") lines.push(`${v} ${v === 1 ? "page" : "pages"} already written`);
    else if (k === "after" && typeof v === "string") lines.push(v === "handover" ? "Another job had let it go" : "It had made no progress");
    else if (k === "rendered" && typeof v === "boolean") lines.push(v ? "PDF made" : "No PDF");
    else if (k === "renderProblems" && typeof v === "number" && v > 0) lines.push(`${v} ${v === 1 ? "problem" : "problems"} drawing the pages`);
    else if (k === "revision" && typeof v === "number") lines.push(`Version ${v}`);
    else if (k === "firstShipped" && v === true) lines.push("First shipped workbook");
  }
  return lines.join(" · ");
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  return <Table label="Audit log" head={["When (Pacific)", "Who", "What", "Details"]} empty="Nothing logged yet.">
    {entries.map((e) => <tr key={e.id}>
      <td className="adm-nowrap">{when(e.at)}</td>
      <td>{e.actor_email ?? <span className="adm-sub">The job</span>}</td>
      <td>{ACTION[e.action] ?? e.action}</td>
      <td className="adm-sub" title={Object.entries(e.detail).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n") || undefined}>{auditDetail(e.detail)}</td>
    </tr>)}
  </Table>;
}
