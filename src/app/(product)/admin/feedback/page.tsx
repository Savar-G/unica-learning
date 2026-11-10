import { AdminFrame } from "@/components/admin-frame";
import { AdminFeedbackList } from "@/components/admin-feedback";
import { requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { feedbackProduct } from "@/lib/feedback";
import { listFeedback } from "@/lib/feedback-store";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin/feedback", title: "Admin: feedback", description: "Admin area.", index: false });

// What parents wrote to us. Test families follow the "Show test families" switch (D-313).
export default async function FeedbackAdminPage({ searchParams }: PageProps<"/admin/feedback">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const product = feedbackProduct(query.product);
  const rawPage = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const page = Math.max(1, rawPage);
  const view = await loadTestFamilies(admin, query);
  const { rows, more } = await listFeedback(admin.db, product, page, view.hidden);
  return <AdminFrame email={admin.email} title="Feedback" lead="What parents wrote to us." testNote={view.show}>
    <AdminFeedbackList rows={rows} product={product} page={page} more={more} isTest={view.show ? view.isTest : undefined} />
  </AdminFrame>;
}
