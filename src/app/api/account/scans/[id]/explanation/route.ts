import { cookies } from "next/headers";
import { DESK_COOKIE, deskGate } from "@/lib/desk";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { markingAccess } from "@/lib/scan-marking-server";
import { explanationPlanOpen, parentProblemExplanation } from "@/lib/parent-problem-explanation-server";

export const maxDuration = 30;
/** Browser supplies references only. Session identity, question, key, context and cost are server-owned. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ status: "refused" }, 403);
  const session = await scanSession(), { id } = await params;
  if (deskGate(new URL(request.url).pathname, (await cookies()).get(DESK_COOKIE)?.value, session.parent) !== "pass") return scanJson({ status: "refused" }, 423);
  if (!isUuid(id) || !(await markingAccess(session.admin, session.parent, process.env, { photo: id }) || await explanationPlanOpen(session.admin, session.parent, id)) || !await session.active()) return scanJson({ status: "refused" }, 404);
  const text = await request.text();
  if (text.length > 1024) return scanJson({ status: "refused" }, 400);
  let data;
  try { data = JSON.parse(text); } catch { return scanJson({ status: "refused" }, 400); }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).sort().join() !== "itemId,version"
    || typeof data.itemId !== "string" || !data.itemId || data.itemId.length > 200 || !Number.isSafeInteger(data.version) || data.version < 1 || data.version > 999_999_999) return scanJson({ status: "refused" }, 400);
  try {
    const result = await parentProblemExplanation(session.admin, { parent: session.parent, photo: id, itemId: data.itemId, version: data.version }, session.active, request.signal);
    if (!await session.active() || request.signal.aborted) return scanJson({ status: "refused" }, 404);
    return scanJson(result, result.status === "refused" ? 409 : 200);
  } catch { return scanJson({ status: "retry" }, 503); }
}
