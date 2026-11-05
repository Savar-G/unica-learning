import { NextResponse } from "next/server";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { workbookPdfLink } from "@/lib/parent-workbook-pdf";
import { parentWorkbookPdfSource } from "@/lib/parent-workbook-pdf-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

// The Workbooks tab's PDF download (#558). Each click signs a fresh link that lives a minute, and sends the browser to
// it. Only the parent's own shipped workbooks, and only for families the dashboard is open to while its switch is off.
// A failure answers in plain words, since the parent opened the link in the browser.
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const say = (text: string, status: number) => new NextResponse(text, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
const NOT_FOUND = "We cannot find this workbook.";

export async function GET(request: Request, ctx: RouteContext<"/api/account/workbooks/[id]/pdf">) {
  const session = await sessionClient();
  const parent = await parentId(session);
  if (!parent) return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303, headers: NO_STORE });
  if (!(await parentDashboardAccess(parent))) return say(NOT_FOUND, 404);
  const { id } = await ctx.params;
  try {
    const link = await workbookPdfLink(parentWorkbookPdfSource(session), id);
    if (link.status === "ok") return NextResponse.redirect(link.url, { status: 303, headers: NO_STORE });
    if (link.status === "not_found") return say(NOT_FOUND, 404);
  } catch (error) {
    console.error("[workbooks] pdf link failed", error instanceof Error ? error.message : "failed");
  }
  return say("We cannot open this PDF right now. Try again in a moment.", 503);
}
