import Link from "next/link";
import { AdminFrame } from "@/components/admin";
import { ChatFamily } from "@/components/chat-family";
import { chatFamilyList } from "@/lib/admin-maya-chat";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH, when } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya-chat`, title: "Admin: Maya chat", description: "Admin area.", index: false });

// The Maya chat list (#530, D-241): chat opens one family at a time. Add a family from its admin page.
export default async function MayaChatPage() {
  const admin = await requireAdmin();
  const rows = await chatFamilyList(admin);
  const on = process.env.MAYA_CHAT_ENABLED === "on";
  return (
    <AdminFrame email={admin.email} section="maya-chat" title="Maya chat">
      <p className="adm-lead">
        Chat with Maya opens one family at a time. A family gets chat when it is on this list, the chat switch is on, and it
        has a running plan. Only children in Grade 3 and up can chat. Test families have chat without the list.
      </p>
      <p className="adm-note">Chat switch: {on ? "on" : "off, so no family on this list has chat yet"}.</p>
      <p className="adm-note">
        One test family on the list can be the rehearsal family. It receives the parent notes and weekly recaps that test
        families never get, so the first ones go to the team.
      </p>
      <p className="adm-note">To add a family, open it under Parents and choose &ldquo;Add to chat list&rdquo;.</p>
      {rows.length === 0 ? <p className="adm-note">No family is on the list.</p> : (
        <div className="adm-scroll" role="region" aria-label="Families on the chat list" tabIndex={0}><table className="adm-table">
          <thead><tr><th>Family</th><th>Email</th><th>Added (Pacific)</th><th>Kind</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.parentId}>
                <td><Link href={`${ADMIN_PATH}/parents/${r.parentId}`}>{r.name}</Link></td>
                <td>{r.email}</td>
                <td>{when(r.addedAt)}</td>
                <td>{r.rehearsal ? "Rehearsal (test family)" : r.test ? "Test family" : "Real family"}</td>
                <td><ChatFamily parentId={r.parentId} listed rehearsal={r.rehearsal} test={r.test} compact /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </AdminFrame>
  );
}
