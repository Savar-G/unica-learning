import { isUuid } from "@/lib/assessment-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail } from "@/lib/test-api";
import { recordBreak, recordDevice } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";
import { isBreakEvent, isBreakLength, readDevice, type BreakRecord, type ContextResult, type TestDevice } from "@/lib/test-context";

// The test context (#185): the test screen sends the device when the test opens ({ device }), and the halfway break
// when it is shown ({ break: "shown" }) and at once when the child leaves it ({ break: "rested" | "skipped", lengthMs },
// the break's length as the browser measured it). One record per request. The test attempt module
// (src/lib/test-attempt.ts) saves each once per test; the break's times are this server's clock. The screen never waits
// for this route, so a failure here never stops the child. This route only translates.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/context">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return testFail("bad_json", 400);
  }
  const record = readRecord(body);
  if (!record) return testFail("invalid", 400);

  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const store = attemptStore(admin);
  const result = "device" in record ? await recordDevice(store, parent, id, record.device) : await recordBreak(store, parent, id, record.break, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true } satisfies ContextResult);
}

/**
 * The one record in the body: a device, or a break record (an end needs its length). Null for neither, both, or one
 * that does not fit.
 */
function readRecord(body: unknown): { device: TestDevice } | { break: BreakRecord } | null {
  const { device, break: event, lengthMs } = (body && typeof body === "object" ? body : {}) as { device?: unknown; break?: unknown; lengthMs?: unknown };
  if (device !== undefined && event === undefined) {
    const checked = readDevice(device);
    return checked ? { device: checked } : null;
  }
  if (event === undefined || device !== undefined || !isBreakEvent(event)) return null;
  if (event === "shown") return { break: { event } };
  return isBreakLength(lengthMs) ? { break: { event, lengthMs } } : null;
}
