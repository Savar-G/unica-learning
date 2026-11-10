import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { linkOrigin } from "@/lib/account-server";
import { isUuid } from "@/lib/assessment-store";
import { runReportJob } from "@/lib/report-job";
import { reportEmailAllowed } from "@/lib/report-retry-server";

// #771: one retry of a test's report job. The /api/reminders run calls it, with "Authorization: Bearer <CRON_SECRET>",
// after it counted the retry (src/lib/report-retry.ts). It answers at once (202) and runs the job after the response,
// with this function's 300 seconds. The job is safe to run twice: the report is stored once, and each email is claimed
// on the report row before it is sent. `email`: false builds the report with no email (a test finished more than 48
// hours ago, a test family or a team account); anything but true is false. The flag only narrows: even with `true`, the
// job asks the database again right before the email (reportEmailAllowed), so a caller cannot email a test the rule
// does not allow, and a retry claimed just before 48 hours sends nothing after them. A failed retry alerts no one: the
// run sends one alert after the last retry.

export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, ctx: RouteContext<"/api/report-jobs/[id]/retry">) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let email = false;
  try {
    email = ((await request.json()) as { email?: unknown } | null)?.email === true;
  } catch {
    // No body: no email.
  }
  // The links in the email, as the finish route makes them.
  const origin = linkOrigin(request);
  const assessmentId = id.toLowerCase();
  after(() => runReportJob(assessmentId, origin, { email, failureAlert: false, mayEmail: () => reportEmailAllowed(assessmentId) }));
  return new Response(null, { status: 202 });
}
