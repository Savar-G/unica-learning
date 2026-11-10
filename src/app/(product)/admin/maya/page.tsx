import { AdminFrame } from "@/components/admin-frame";
import { SectionHead, Tiles } from "@/components/admin-blocks";
import { MayaCallList, MayaPicker } from "@/components/admin-maya";
import { MayaWorkbookPicker } from "@/components/admin-maya-workbook";
import { callFlagged, callSummary } from "@/lib/admin-pages";
import { getWorkbook, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { ADMIN_PATH } from "@/lib/admin-view";
import { callStats, demoChildren, listCalls, nextCallModel, voiceReady } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya calls", description: "Admin area.", index: false });

const WEEK_DAYS = 7;

// Maya's calls (#323): the calls so far, and a test call on a supported question of a test family's child. Admins
// only; test calls use test families only (D-099), so no real family is touched. The list follows the "Show test
// families" switch (D-313); test calls are calls of test families, so they show only while it is on. The tiles count
// the real families' calls of the last 7 days only, whatever the switch says.
export default async function MayaCallsPage({ searchParams }: PageProps<"/admin/maya">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const { cursor, workbook, page, question } = query;
  const detail = typeof workbook === "string" ? await getWorkbook(admin, workbook) : null;
  const view = await loadTestFamilies(admin);
  const now = new Date();
  const [children, calls, stats] = await Promise.all([
    demoChildren(admin),
    listCalls(admin, 50, typeof cursor === "string" ? cursor : undefined, view.hidden),
    callStats(admin, new Date(now.getTime() - WEEK_DAYS * 86_400_000), view.ids),
  ]);
  const week = callSummary(stats.rows, now, view.isTest, WEEK_DAYS);
  const more = stats.capped ? " or more" : "";
  // The flagged calls on this page of the list (safety calls come first), real families only.
  const flagged = calls.calls.filter((c) => !view.isTest(c.parentId) && callFlagged({ flag: c.flag, safety_severity: c.safetySeverity, safety_flag: c.safetyFlag }));
  return (
    <AdminFrame email={admin.email} title="Calls" lead="Maya's calls and chats with children, and the team's test calls." testNote={view.show}
      actions={<a className="btn ghost adm-btn" href="#try-maya">Try Maya</a>}>
      {detail && <MayaWorkbookPicker key={detail.workbook.id} book={detail.workbook} images={detail.images} voice={voiceReady()}
        initialPage={typeof page === "string" ? Number(page) : undefined} initialQuestion={typeof question === "string" ? Number(question) : undefined} />}
      {workbook && !detail && <p role="alert" className="adm-note">This workbook is not available. Open a stored workbook and choose its question.</p>}

      {flagged.length > 0 && (
        <p className="ab-needs" role="status">
          <b>Needs you:</b> {flagged.length === 1 ? "1 call on this page is flagged for safety." : `${flagged.length} calls on this page are flagged for safety.`} They are at the top of the list. Open each one and read the conversation.
        </p>
      )}
      <Tiles label={`Calls in the last ${WEEK_DAYS} days`} tiles={[
        { key: "calls", label: "Calls this week", value: `${week.calls}${more}`, sub: `Last ${WEEK_DAYS} days, real families` },
        { key: "minutes", label: "Call minutes", value: `${week.minutes}${more}`, sub: "Saved call time, last 7 days" },
        { key: "flagged", label: "Flagged calls", value: `${week.flagged}${more}`, sub: stats.capped ? "Counted from the newest calls only. Open the list to check every flag." : week.flagged ? "With a safety flag, last 7 days" : "No safety flag in 7 days", tone: week.flagged ? "bad" : null },
      ]} />

      <SectionHead id="mc-list" title="Every call" line={<>Safety calls come first, the most urgent first. Calls within each group are newest first. Test calls do not use the child&apos;s minutes.{!view.show && " Test calls are calls of test families, so they are hidden. Turn on Show test families, at the bottom of the menu, to see them."}</>} />
      <MayaCallList calls={calls.calls} older={calls.older} newer={calls.newer} testParents={view.show ? view.ids : []} />

      <section className="mc-try" id="try-maya" aria-labelledby="try-maya-title">
        <SectionHead id="try-maya-title" title="Try Maya" line="Try Maya, the Unica Teaching Assistant, on a real question from a test child. Only test families can be used: no minutes are counted and no parents are emailed." />
        {!workbook && <p className="adm-note">To try a workbook question, open the child&apos;s workbook in admin and choose a question on its page image.</p>}
        <MayaPicker model={nextCallModel()} voice={voiceReady()}>{children}</MayaPicker>
      </section>
    </AdminFrame>
  );
}
