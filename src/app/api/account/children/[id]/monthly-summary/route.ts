import { cookies } from "next/headers";
import { DESK_COOKIE, deskGate } from "@/lib/desk";
import { renderSlots } from "@/lib/monthly-summary";
import { monthlySummaryResponse } from "@/lib/monthly-summary-server";
import { summaryQuota } from "@/lib/monthly-summary-store";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { parentViewReader } from "@/lib/parent-view-server";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The monthly summary PDF (#562): GET ?month=YYYY-MM gives the signed-in parent's own child's month as one page, made
// now with this function's Chromium and never stored (src/lib/monthly-summary-server.ts decides every answer). Only for
// families the dashboard is open to (PARENT_DASHBOARD_ENABLED, else test families and admins). The proxy already
// answers 423 while the child's desk is open on this device; the route checks it again. Chromium is heavy, so each
// function instance renders at most 2 at once, and a parent may try 5 times in 10 minutes, counted in the database so
// that every instance shares one count (public.monthly_summary_renders).
// A cold render takes about 4 s and a warm one about 1 s (docs/workbook-rendering.md); 60 s leaves room.
export const maxDuration = 60;

const slots = renderSlots();

export async function GET(request: Request, ctx: RouteContext<"/api/account/children/[id]/monthly-summary">) {
  const session = await sessionClient();
  const parent = await parentId(session);
  const url = new URL(request.url);
  const deskOpen = deskGate(url.pathname, (await cookies()).get(DESK_COOKIE)?.value, parent) !== "pass";
  return monthlySummaryResponse({
    deskOpen,
    parent,
    childId: (await ctx.params).id,
    month: url.searchParams.get("month"),
    now: Date.now(),
    access: (p) => parentDashboardAccess(p),
    reader: (p) => parentViewReader(session, p, adminClient()),
    engine: chromiumPrintEngine,
    fonts: fixedTemplateFonts,
    slots,
    quota: summaryQuota(adminClient()),
    signInUrl: new URL("/sign-in", request.url).toString(),
  });
}
