import Link from "next/link";
import { AdminFrame } from "@/components/admin-frame";
import { ChatFamily } from "@/components/chat-family";
import { chatFamilyList, chatSwitchText } from "@/lib/admin-maya-chat";
import { requireAdmin } from "@/lib/admin-store";
import { keepRows } from "@/lib/admin-test-families";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { TestTag } from "@/components/admin";
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
  return (
    <AdminFrame email={admin.email} title="Maya chat list" lead="Every family on the Maya chat list. Add or remove a family on its own page." testNote={view.show}>
      <p>{chatSwitchText()}</p>
      <p className="adm-lead">
        A child with an open plan has chat without the list. Only children in Grade 3 and up can chat, after a parent agrees to
        the Maya notice. Test families have chat without the list.
      </p>
      <p className="adm-note">
        One test family on the list can be the rehearsal family. It receives the parent notes and weekly recaps that test
        families never get, so the first ones go to the team.
      </p>
      {rows.length === 0 && list.length > 0 ? <p className="adm-empty">Only test families are on the list. Turn on Show test families to see them.</p>
        : rows.length === 0 ? <p className="adm-empty">No family is on the list. To add one, open it under <Link href={`${ADMIN_PATH}/parents`}>Families</Link>.</p> : (
        <div className="adm-scroll" role="region" aria-label="Families on the chat list" tabIndex={0}><table className="adm-table">
          <thead><tr><th>Family</th><th>Email</th><th>Added (Pacific)</th><th>Kind</th><th><span className="adm-sr">Change</span></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.parentId}>
                <td><Link href={`${ADMIN_PATH}/parents/${r.parentId}`}>{r.name}</Link><TestTag test={view.show && view.isTest(r.parentId)} /></td>
                <td>{r.email}</td>
                <td>{when(r.addedAt)}</td>
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
