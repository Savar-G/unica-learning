import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";

// #312: the next job call of a "Prepare next workbook" run. The job calls it near the function's time limit, after it
// let go of the run, with "Authorization: Bearer <CRON_SECRET>". It answers at once (202) and runs the job after the
// response; the job takes the run up again only when no one holds it (or its holder made no progress for 6 minutes),
// so a repeated call does nothing.

export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, ctx: RouteContext<"/api/workbook-runs/[id]/resume">) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin;
  after(() => runWorkbookJobNow(id.toLowerCase(), { origin, resume: true }));
  return new Response(null, { status: 202 });
}
