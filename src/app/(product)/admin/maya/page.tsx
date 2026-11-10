import { AdminFrame } from "@/components/admin-frame";
import { MayaCallList, MayaPicker } from "@/components/admin-maya";
import { MayaWorkbookPicker } from "@/components/admin-maya-workbook";
import { getWorkbook, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { ADMIN_PATH } from "@/lib/admin-view";
import { demoChildren, listCalls, nextCallModel, voiceReady } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya calls", description: "Admin area.", index: false });

// Maya's calls (#323): the calls so far, and a test call on a supported question of a test family's child. Admins
// only; test calls use test families only (D-099), so no real family is touched. The list follows the "Show test
// families" switch (D-313); test calls are calls of test families, so they show only while it is on.
export default async function MayaCallsPage({ searchParams }: PageProps<"/admin/maya">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const { cursor, workbook, page, question } = query;
  const detail = typeof workbook === "string" ? await getWorkbook(admin, workbook) : null;
  const view = await loadTestFamilies(admin);
  const [children, calls] = await Promise.all([demoChildren(admin), listCalls(admin, 50, typeof cursor === "string" ? cursor : undefined, view.hidden)]);
  return (
    <AdminFrame email={admin.email} title="Calls" lead="Maya's calls with children, and test calls." testNote={view.show}>
      {detail && <MayaWorkbookPicker key={detail.workbook.id} book={detail.workbook} images={detail.images} voice={voiceReady()}
        initialPage={typeof page === "string" ? Number(page) : undefined} initialQuestion={typeof question === "string" ? Number(question) : undefined} />}
      {workbook && !detail && <p role="alert" className="adm-note">This workbook is not available. Open a stored workbook and choose its question.</p>}
      {!workbook && <p className="adm-note">To try a workbook question, open the child&apos;s workbook in admin and choose a question on its page image.</p>}
      <p className="adm-note">Safety calls come first, with the most urgent first. Calls within each group are newest first. Test calls do not use the child&apos;s minutes.</p>
      {!view.show && <p className="adm-note">Test calls are calls of test families, so they are hidden. Turn on Show test families, at the bottom of the menu, to see them.</p>}
      <MayaCallList calls={calls.calls} older={calls.older} newer={calls.newer} testParents={view.show ? view.ids : []} />
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
