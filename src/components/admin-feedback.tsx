// What parents wrote to us (D-313, D-315): one card per message, newest first, with the product, the family, the page
// they wrote from and the status; the product filter as pills. Safe in the browser too: the parent app preview renders
// it with sample rows.
import Link from "next/link";
import { TestTag } from "@/components/admin";
import { Empty, Pills } from "@/components/admin-blocks";
import { adminParentPath, when } from "@/lib/admin-view";
import { FEEDBACK_PRODUCTS, feedbackProduct, type FeedbackProduct, type FeedbackRow } from "@/lib/feedback";
import "./admin-pages.css";

const STATUS_TEXT: Record<string, string> = { new: "New", read: "Read", closed: "Closed" };

/** `isTest`: tag a test family's message (only while "Show test families" is on). */
export function AdminFeedbackList({ rows, product, page = 1, more = false, isTest }: { rows: FeedbackRow[]; product: FeedbackProduct | null; page?: number; more?: boolean; isTest?: (parentId: string) => boolean }) {
  const href = (p: number) => `/admin/feedback?${new URLSearchParams({ ...(product ? { product } : {}), page: String(p) })}`;
  const filter = (p: FeedbackProduct | null) => (p ? `/admin/feedback?${new URLSearchParams({ product: p })}` : "/admin/feedback");
  const label = (value: string) => FEEDBACK_PRODUCTS.find((p) => p.value === feedbackProduct(value))?.label ?? value;
  return <>
    <Pills label="Product" pills={[
      { key: "all", href: filter(null), label: "All products", current: !product },
      ...FEEDBACK_PRODUCTS.map((p) => ({ key: p.value, href: filter(p.value), label: p.label, current: product === p.value })),
    ]} />
    {rows.length === 0 ? <Empty>{product ? `No feedback about ${label(product)} yet.` : "No feedback yet. Parents write to us from Feedback in their account."}</Empty> : (
      <ul className="ap-notes" aria-label="Parent feedback">
        {rows.map((row) => (
          <li key={row.id} className={`ap-note${row.status === "new" ? " is-new" : ""}`}>
            <div className="ap-note-top">
              <span className="adm-chip is-info">{label(row.product)}</span>
              <time dateTime={row.created_at}>{when(row.created_at)}</time>
              <span className={`adm-chip ap-note-status ${row.status === "new" ? "is-warn" : "is-muted"}`}>{STATUS_TEXT[row.status] ?? row.status}</span>
            </div>
            <p className="ap-note-text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.text}</p>
            <div className="ap-note-foot">
              <span><Link href={adminParentPath(row.parent_id)}>Open the family</Link><TestTag test={isTest?.(row.parent_id)} /></span>
              <span>Written on {row.source}</span>
            </div>
          </li>
        ))}
      </ul>
    )}
    <nav className="adm-row ap-pager" aria-label="Feedback pages">
      <span className="adm-note">Page {page}. Up to 50 messages per page.</span>
      {page > 1 && <Link href={href(page - 1)}>Newer</Link>}
      {more && <Link href={href(page + 1)}>Older</Link>}
    </nav>
  </>;
}
