import { formatCalendarDate, formatInZone, localDay } from "@/lib/family-time";
import { confirmPause, previewPause } from "@/lib/plan-pause";
import { livePauses } from "@/lib/plan-controls-server";
import { planControlFail as fail, planControlRequest } from "@/lib/plan-control-request";
export async function POST(request: Request) {
  const parsed = await planControlRequest(request);
  if (parsed instanceof Response) return parsed;
  const { parent, card, body } = parsed;
  if (typeof body.weeks !== "number" || !Number.isInteger(body.weeks) || body.weeks < 1 || body.weeks > 8) return fail("invalid_weeks", 400);
  const seams = livePauses();
  if (!seams) return fail("unavailable", 503);
  try {
    const now = Date.now();
    const result = body.action === "confirm" ? await confirmPause(parent, card, body.weeks, String(body.token), now, seams) : await previewPause(parent, card, body.weeks, now, seams);
    if (!result.ok) return fail(result.error, result.error === "not_found" ? 404 : 409);
    const context = await seams.store.context(parent, card, now);
    if (!context) return fail("not_found", 404);
    const q = result.quote, options = { month: "long", day: "numeric", year: "numeric" } as const;
    // The public response contains display facts only. Keep subscription ids and admission snapshots on the server.
    return Response.json({ ok: true, token: result.token, state: result.state, weeks: q.weeks, remaining: result.state === "applied" ? 8 - context.used : 8 - q.used - q.weeks, year: result.state === "applied" ? +localDay(now, context.zone).slice(0, 4) : q.year,
      late: q.late, targetNumber: q.targetNumber,
      charge: formatInZone(q.chargeAt, context.zone, options),
      earliest: q.earliest ? formatCalendarDate(q.earliest, options) : null,
      latest: q.latest ? formatCalendarDate(q.latest, options) : null });
  } catch (error) {
    console.error("[plan] pause failed", error instanceof Error ? error.message : "failed");
    return fail("pending", 502);
  }
}
