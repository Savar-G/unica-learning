import "server-only";
import { isUuid } from "@/lib/assessment-store";
import { planManagementAccess } from "@/lib/parent-dashboard-access";
import { parentId, sessionClient } from "@/lib/supabase-auth";
export const planControlFail = (error: string, status: number) => Response.json({ ok: false, error }, { status });
export async function planControlRequest(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return planControlFail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return planControlFail("bad_json", 415);
  const parent = await parentId(await sessionClient());
  if (!parent) return planControlFail("signed_out", 401);
  if (!(await planManagementAccess(parent))) return planControlFail("not_found", 404);
  let body: { card?: unknown; weeks?: unknown; token?: unknown; action?: unknown } | null;
  try { body = await request.json(); } catch { return planControlFail("bad_json", 400); }
  if (typeof body?.card !== "string" || !isUuid(body.card)) return planControlFail("invalid", 400);
  if (body.action !== "preview" && body.action !== "confirm") return planControlFail("invalid", 400);
  if (body.action === "confirm" && (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))) return planControlFail("invalid", 400);
  return { parent, card: body.card.toLowerCase(), body };
}
