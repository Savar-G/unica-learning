import { cookies } from "next/headers";
import { DESK_COOKIE, deskGate } from "@/lib/desk";
import { sameOrigin } from "@/lib/desk-server";
import { sendFeedback, type FeedbackResult } from "@/lib/feedback";
import { feedbackStore } from "@/lib/feedback-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  const reply = (status: number, result: FeedbackResult) => Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return reply(403, { ok: false, error: "invalid" });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "invalid" });
  const parent = await parentId(await sessionClient());
  if (!parent) return reply(401, { ok: false, error: "signed_out" });
  if (deskGate("/api/account/feedback", (await cookies()).get(DESK_COOKIE)?.value, parent) !== "pass") return reply(423, { ok: false, error: "desk_open" });
  let body: unknown;
  try {
    // Bound the decoded request before parsing. This permits 5,000 escaped Unicode characters plus context.
    const raw = await request.text();
    if (raw.length > 70000) return reply(413, { ok: false, error: "too_long" });
    body = JSON.parse(raw);
  } catch { return reply(400, { ok: false, error: "invalid" }); }
  const service = adminClient();
  if (!service) return reply(503, { ok: false, error: "unavailable" });
  const result = await sendFeedback(feedbackStore(service), parent, body);
  const status = result.ok ? 200 : result.error === "unavailable" ? 503 : result.error === "rate_limited" ? 429 : result.error === "family_unavailable" ? 410 : result.error === "child_unavailable" ? 403 : result.error === "conflict" ? 409 : 400;
  return reply(status, result);
}
