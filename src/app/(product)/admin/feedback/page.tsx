import { AdminFrame } from "@/components/admin";
import { AdminFeedbackList } from "@/components/admin-feedback";
import { requireAdmin } from "@/lib/admin-store";
import { feedbackProduct } from "@/lib/feedback";
import { listFeedback } from "@/lib/feedback-store";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin/feedback", title: "Admin: feedback", description: "Admin area.", index: false });
export default async function FeedbackAdminPage({ searchParams }: PageProps<"/admin/feedback">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const product = feedbackProduct(query.product);
  const rawPage = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const page = Math.max(1, rawPage);
  const { rows, more } = await listFeedback(admin.db, product, page);
  return <AdminFrame email={admin.email} section="feedback" title="Feedback">
    <AdminFeedbackList rows={rows} product={product} page={page} more={more} />
  </AdminFrame>;
}
