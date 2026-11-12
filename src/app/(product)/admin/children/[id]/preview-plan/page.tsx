import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdmin } from "@/lib/admin-store";
import { WhyThisBook } from "../../../workbooks/[id]/why-this-book";
import { InstructionsUsed } from "../../../workbooks/[id]/instructions-used";
import { loadPreviewPlan } from "./load";

export default async function PreviewPlanPage({ params }: PageProps<"/admin/children/[id]/preview-plan">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const detail = await loadPreviewPlan(admin, id);
  if (!detail) notFound();
  return <AdminFrame email={admin.email} title={`Preview plan for ${detail.child.first_name}`}>
    <p><Link href={`/admin/children/${id}`}>Back to the child</Link></p>
    <p>This preview uses the current test and learning card. It does not save a profile, start a workbook run or call AI.</p>
    {detail.preview.ok ? <><InstructionsUsed trace={detail.preview.plan.instructions} /><WhyThisBook why={detail.preview.why} /></> : <p role="status">{detail.preview.reason}</p>}
  </AdminFrame>;
}
