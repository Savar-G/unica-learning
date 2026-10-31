import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin";
import { MayaCall } from "@/components/admin-maya";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { boardPlayback } from "@/lib/maya-call";
import { readCall } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya call", description: "Admin area.", index: false });

// One test call with Maya (#323): live, the conversation and the board; finished, the saved call with its outcome,
// learning event, versions and a board replay.
export default async function MayaCallPage({ params }: PageProps<"/admin/maya/[id]">) {
  const admin = await requireAdmin();
  const call = await readCall(admin, (await params).id);
  if (!call) notFound();
  return (
    <AdminFrame email={admin.email} section="maya" title={null} wide>
      <div className="adm-main">
        <MayaCall initial={call.view} board={boardPlayback(call.view.batches)} childName={call.childName} />
      </div>
    </AdminFrame>
  );
}
