import type { NextStepError, WaitlistRequest, WaitlistResult } from "@/lib/next-step";
import { joinWaitlist } from "@/lib/next-step-server";
import { pilotOn } from "@/lib/pilot";
import { isUuid } from "@/lib/assessment-store";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const fail = (error: NextStepError, status: number) => Response.json({ ok: false, error } satisfies WaitlistResult, { status });

// A parent outside BC joins the waitlist from the report with one click (#66). Joining twice stores nothing new.
// JSON only: a form on another site cannot send it with the parent's cookies.
export async function POST(request: Request) {
  if (!pilotOn()) return fail("off", 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  const id = await parentId(await sessionClient());
  if (!id) return fail("signed_out", 401);

  let body: Partial<WaitlistRequest>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  if (typeof body.report !== "string" || !isUuid(body.report)) return fail("invalid", 400);

  const result = await joinWaitlist(id, body.report, new URL(request.url).origin);
  if (!result.ok) return fail(result.error, "status" in result ? result.status : 400);
  return Response.json(result satisfies WaitlistResult);
}
