import { restartFamilyPlan } from "@/lib/plan-controls-server";
import { planControlFail as fail, planControlRequest } from "@/lib/plan-control-request";
export async function POST(request: Request) {
  const parsed = await planControlRequest(request);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await restartFamilyPlan(parsed.parent, parsed.card, parsed.body.action === "confirm" ? String(parsed.body.token) : undefined);
    if (!result.ok) return fail(result.error, result.error === "not_found" ? 404 : result.error === "unavailable" ? 503 : 409);
    return Response.json(result);
  } catch (error) {
    console.error("[plan] restart failed", error instanceof Error ? error.message : "failed");
    return fail("pending", 502);
  }
}
