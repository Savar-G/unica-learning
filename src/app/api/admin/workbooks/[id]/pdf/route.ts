import { adminSession, workbookPdfUrl } from "@/lib/admin-store";

// The PDF of a stored workbook, for admins: a redirect to a fresh short-lived signed URL, so a link on a page opened
// long ago still works. Everyone else, and a workbook with no PDF, gets 404.
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/workbooks/[id]/pdf">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  const url = await workbookPdfUrl(admin, (await ctx.params).id);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 307, headers: { location: url, "cache-control": "no-store" } });
}
