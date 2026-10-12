import type { CardRequest, CardResult, NextStepError } from "@/lib/next-step";
import { startCard } from "@/lib/next-step-server";
import { isUuid } from "@/lib/assessment-store";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const fail = (error: NextStepError, status: number) => Response.json({ ok: false, error } satisfies CardResult, { status });

// A BC parent chose a plan on the report (#66). Answers with Stripe's page to save the card, or "later" when Stripe
// is off or failed. JSON only: a form on another site cannot send it with the parent's cookies.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  const id = await parentId(await sessionClient());
  if (!id) return fail("signed_out", 401);

  let body: Partial<CardRequest>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  if (typeof body.report !== "string" || !isUuid(body.report) || body.plan !== "one") return fail("invalid", 400);

  const result = await startCard(id, body.report, body.plan, body.src === "email" ? "email" : "account", new URL(request.url).origin);
  if (!result.ok) return fail(result.error, "status" in result ? result.status : 400);
  return Response.json(result satisfies CardResult);
}
