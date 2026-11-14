import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { MayaCall } from "@/components/admin-maya";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { boardPlayback } from "@/lib/maya-call";
import { childScopeSummary, readCall } from "@/lib/maya-call-server";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: `${ADMIN_PATH}/maya`, title: "Admin: Maya call", description: "Admin area.", index: false });

// One call with Maya (#323): the question as the page's title; live, the conversation beside the board; finished, the
// outcome and the flag at the top, the conversation beside a board replay, and what was saved below.
export default async function MayaCallPage({ params }: PageProps<"/admin/maya/[id]">) {
  const admin = await requireAdmin();
  const call = await readCall(admin, (await params).id);
  if (!call) notFound();
  const scope = await childScopeSummary(admin, call.view.childId);
  const who = call.childName ?? "the child";
  return (
    <AdminFrame email={admin.email} title={call.view.questionText ?? "Maya call"}
      lead={call.view.kind === "chat" ? `A chat with ${who}.` : call.view.kind === "family" ? `A voice call from the desk with ${who}.` : `A test call, with the team speaking as ${who}.`}
      actions={<Link className="btn ghost adm-btn" href={`${ADMIN_PATH}/maya`} prefetch={false}>All calls</Link>}>
      <MayaCall initial={call.view} board={boardPlayback(call.view.batches)} childName={call.childName} />
      <p className="adm-note mc-scope-total">Workbook scope refusals for this child: {scope.count} across calls and chats.</p>
    </AdminFrame>
  );
}
