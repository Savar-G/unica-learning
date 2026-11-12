import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { changeScanMarking, markingAccess, readScanMarking } from "@/lib/scan-marking-server";
import { parentMarkChoice } from "@/lib/scan-marking-store";

/** An explicit parent judgment changes one current canonical version. It never restarts marking. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent, process.env, { photo: id }) || !await session.active()) return scanJson({ error: "refused" }, 404);
  const text = await request.text();
  if (text.length > 2048) return scanJson({ error: "invalid" }, 400);
  let choice;
  try { choice = parentMarkChoice(JSON.parse(text)); } catch { return scanJson({ error: "invalid" }, 400); }
  if (!choice) return scanJson({ error: "invalid" }, 400);
  try {
    const changed = await changeScanMarking(session.admin, session.parent, id, choice);
    if (changed.status === "refused" || !await session.active()) return scanJson({ error: "refused" }, 404);
    const result = await readScanMarking(session.admin, session.parent, id);
    if (!result || !await session.active()) return scanJson({ error: "refused" }, 404);
    return scanJson({ status: changed.status, recoveryPending: changed.recoveryPending,
      result: { completion: result.completion, counts: result.counts, budgetHeld: result.budgetHeld,
        solutionsAvailable: result.solutionsAvailable, items: result.items, photoAvailable: result.photoAvailable } }, changed.status === "conflict" ? 409 : 200);
  } catch { return scanJson({ error: "unavailable" }, 503); }
}
