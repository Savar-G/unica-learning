import { AdminFrame } from "@/components/admin";
import { MayaCallList, MayaPicker } from "@/components/admin-maya";
import { MayaWorkbookPicker } from "@/components/admin-maya-workbook";
import { getWorkbook, requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { demoChildren, listCalls, nextCallModel, voiceReady } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya calls", description: "Admin area.", index: false });

// Maya's test calls (#323): start a text call on a supported question of a test family's child, and the calls so far.
// Admins only; test families only (D-099), so no real family is touched.
export default async function MayaCallsPage({ searchParams }: PageProps<"/admin/maya">) {
  const admin = await requireAdmin();
  const { cursor, workbook, page, question } = await searchParams;
  const detail = typeof workbook === "string" ? await getWorkbook(admin, workbook) : null;
  const [children, calls] = await Promise.all([demoChildren(admin), listCalls(admin, 50, typeof cursor === "string" ? cursor : undefined)]);
  return (
    <AdminFrame email={admin.email} section="maya" title="Maya calls">
      {detail && <MayaWorkbookPicker key={detail.workbook.id} book={detail.workbook} images={detail.images} voice={voiceReady()}
        initialPage={typeof page === "string" ? Number(page) : undefined} initialQuestion={typeof question === "string" ? Number(question) : undefined} />}
      {workbook && !detail && <p role="alert" className="adm-note">This workbook is not available. Open a stored workbook and choose its question.</p>}
      {!workbook && <p className="adm-note">To try a workbook question, open the child&apos;s workbook in admin and choose a question on its page image.</p>}
      <p className="adm-note">Safety calls come first, with the most urgent first. Calls within each group are newest first. Test calls do not use the child&apos;s minutes.</p>
      <MayaCallList calls={calls.calls} older={calls.older} newer={calls.newer} />
      <h2>Try Maya</h2>
      <p className="adm-lead">
        Try Maya, the Unica Teaching Assistant, on a real question from a test child. Type or say what the child says and watch
        Maya answer and write on the board. Only test families can be used: no minutes are counted and no parents are
        emailed.
      </p>
      <MayaPicker model={nextCallModel()} voice={voiceReady()}>{children}</MayaPicker>
    </AdminFrame>
  );
}
