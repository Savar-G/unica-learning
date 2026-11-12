import Link from "next/link";
import { AdminFrame } from "@/components/admin-frame";
import { ChatFamily } from "@/components/chat-family";
import { chatFamilyList, chatSwitchText } from "@/lib/admin-maya-chat";
import { requireAdmin } from "@/lib/admin-store";
import { keepRows } from "@/lib/admin-test-families";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { TestTag } from "@/components/admin";
import { Empty, SectionHead } from "@/components/admin-blocks";
import "@/components/admin-pages.css";
import { ADMIN_PATH, when } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya-chat`, title: "Admin: Maya chat list", description: "Admin area.", index: false });

// The Maya chat list (#530, D-241): chat opens one family at a time. Since D-313 a family's chat access is set on its
// own page; this page stays as the one overview of the list, linked from that card, not from the sidebar. Test and team
// families follow the "Show test families" switch (D-313): left out while it is off, listed with a test tag while on.
export default async function MayaChatPage() {
  const admin = await requireAdmin();
  const [list, view] = await Promise.all([chatFamilyList(admin), loadTestFamilies(admin)]);
  const rows = keepRows(list, view, (r) => r.parentId);
  const real = rows.filter((r) => !view.isTest(r.parentId)).length;
  return (
    <AdminFrame email={admin.email} title="Maya chat list" lead="Every family on the Maya chat list. Add or remove a family on its own page." testNote={view.show}>
      <p className="ap-verdict" role="status"><b>Chat now:</b> {chatSwitchText()}</p>
      <details className="adm-tech">
        <summary>Who can chat</summary>
        <p>A child with an open plan has chat without the list. Only children in Grade 3 and up can chat, after a parent agrees to the Maya notice. Test families have chat without the list.</p>
        <p>One test family on the list can be the rehearsal family. It receives the parent notes and weekly recaps that test families never get, so the first ones go to the team.</p>
      </details>
      <SectionHead id="ap-chat-list" title="On the list" count={`${real} ${real === 1 ? "family" : "families"}`} line="Newest first. Test and team families are not counted." />
      {rows.length === 0 && list.length > 0 ? <Empty>Only test families are on the list. Turn on Show test families to see them.</Empty>
        : rows.length === 0 ? <Empty>No family is on the list. To add one, open it under <Link href={`${ADMIN_PATH}/parents`}>Families</Link>.</Empty> : (
        <div className="adm-scroll" role="region" aria-label="Families on the chat list" tabIndex={0}><table className="adm-table">
          <thead><tr><th scope="col">Family</th><th scope="col">Added (Pacific)</th><th scope="col">Kind</th><th scope="col"><span className="adm-sr">Change</span></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.parentId}>
                <td><Link href={`${ADMIN_PATH}/parents/${r.parentId}`}><b>{r.name}</b></Link><TestTag test={view.show && view.isTest(r.parentId)} /><span className="adm-sub">{r.email}</span></td>
                <td className="adm-nowrap">{when(r.addedAt)}</td>
                <td>{r.rehearsal ? "Rehearsal (test family)" : r.test ? "Test family" : view.isTest(r.parentId) ? "Team family" : "Real family"}</td>
                <td><ChatFamily parentId={r.parentId} listed rehearsal={r.rehearsal} test={r.test} compact /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </AdminFrame>
  );
}
