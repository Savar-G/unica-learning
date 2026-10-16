import { isUuid } from "@/lib/assessment-store";
import type { CardCheckResult, NextStepError } from "@/lib/next-step";
import { checkReportCard } from "@/lib/next-step-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const answer = (body: CardCheckResult | { error: NextStepError }, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// The report opened with no stored saved card (#66): is a card saved for this child in Stripe? Answers saved (with
// its plan), absent or unknown. JSON only: a form on another site cannot send it with the parent's cookies.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return answer({ error: "bad_json" }, 415);
  const id = await parentId(await sessionClient());
  if (!id) return answer({ error: "signed_out" }, 401);

  let body: { report?: unknown };
  try {
    body = await request.json();
  } catch {
    return answer({ error: "bad_json" }, 400);
  }
  if (typeof body?.report !== "string" || !isUuid(body.report)) return answer({ error: "invalid" }, 400);

  const result = await checkReportCard(id, body.report);
  if ("ok" in result) return answer({ error: result.error }, result.status);
  return answer(result);
}
