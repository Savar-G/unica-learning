import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { runFirstPagesNow } from "@/lib/first-pages-server";

// The first pages of Workbook 1 on the server (docs/first-pages.md, WORKBOOK_RUNNER "server"): one job call of a set,
// started by the queue and by the /api/reminders run for a set that stopped, with "Authorization: Bearer <CRON_SECRET>".
// It answers at once (202) and runs after the response; the job takes the set only when it is queued or no one holds it,
// so a repeated call does nothing.

export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, ctx: RouteContext<"/api/first-pages/[id]/run">) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  after(() => runFirstPagesNow(id.toLowerCase()));
  return new Response(null, { status: 202 });
}
