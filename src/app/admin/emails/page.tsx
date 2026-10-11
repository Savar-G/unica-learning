import { LIST_MAX, emailRows, requireAdmin } from "@/lib/admin-store";
import { listOffset } from "@/lib/admin-view";
import { AdminFrame, More } from "@/components/admin";
import { EmailTable } from "@/components/admin-records";

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const admin = await requireAdmin();
  const offset = listOffset(await searchParams, LIST_MAX);
  const { rows, more } = await emailRows(admin, undefined, offset);
  return <AdminFrame email={admin.email} section="emails" title="Emails and unsubscribes"><EmailTable emails={rows} /><More more={more} max={LIST_MAX} offset={offset} action="/admin/emails" /></AdminFrame>;
}
