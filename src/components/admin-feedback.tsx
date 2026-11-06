import Link from "next/link";
import { Table } from "@/components/admin";
import { adminParentPath, when } from "@/lib/admin-view";
import { FEEDBACK_PRODUCTS, feedbackProduct, type FeedbackProduct, type FeedbackRow } from "@/lib/feedback";

export function AdminFeedbackList({ rows, product, page = 1, more = false }: { rows: FeedbackRow[]; product: FeedbackProduct | null; page?: number; more?: boolean }) {
  const href = (p: number) => `/admin/feedback?${new URLSearchParams({ ...(product ? { product } : {}), page: String(p) })}`;
  return <>
    <form action="/admin/feedback" method="get" className="adm-filters">
      <label htmlFor="admin-feedback-product">Product
      <select id="admin-feedback-product" name="product" defaultValue={product ?? ""}>
        <option value="">All products</option>
        {FEEDBACK_PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select></label>
      <button className="btn" type="submit">Filter</button>
    </form>
    <Table label="Parent feedback" head={["Time (Pacific)", "Family", "Product", "Feedback", "Page", "Status"]} empty="No feedback found.">
      {rows.map(row => <tr key={row.id}>
        <td>{when(row.created_at)}</td>
        <td><Link href={adminParentPath(row.parent_id)}>View family</Link></td>
        <td>{FEEDBACK_PRODUCTS.find(p => p.value === feedbackProduct(row.product))?.label ?? row.product}</td>
        <td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: "16rem", maxWidth: "38rem" }}>{row.text}</td>
        <td>{row.source}</td><td>{row.status}</td>
      </tr>)}
    </Table>
    <nav className="adm-row" aria-label="Feedback pages">
      <span className="adm-note">Page {page}. Up to 50 messages per page.</span>
      {page > 1 && <Link href={href(page - 1)}>Newer</Link>}
      {more && <Link href={href(page + 1)}>Older</Link>}
    </nav>
  </>;
}
