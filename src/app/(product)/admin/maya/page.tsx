import { AdminFrame } from "@/components/admin";
import { MayaCallList, MayaPicker } from "@/components/admin-maya";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { demoChildren, listCalls, nextCallModel } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya calls", description: "Admin area.", index: false });

// Maya's test calls (#323): start a text call on a supported question of a test family's child, and the calls so far.
// Admins only; test families only (D-099), so no real family is touched.
export default async function MayaCallsPage() {
  const admin = await requireAdmin();
  const [children, calls] = await Promise.all([demoChildren(admin), listCalls(admin)]);
  return (
    <AdminFrame email={admin.email} section="maya" title="Maya calls">
      <p className="adm-lead">
        Try Maya, the Unica Teaching Assistant, on a real test question. Pick a question a test child was given, type
        what the child says, and watch Maya answer and write on the board. Each call is saved with its transcript, board,
        outcome and versions, and writes one learning event for that child. Only test families can be used: their
        minutes and emails are never touched.
      </p>
      <MayaPicker model={nextCallModel()}>{children}</MayaPicker>
      <h2>Test calls</h2>
      <MayaCallList calls={calls} />
    </AdminFrame>
  );
}
