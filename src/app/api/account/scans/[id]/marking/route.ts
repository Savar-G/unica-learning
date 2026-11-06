import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { markingAccess, processScanMarking, readScanMarking } from "@/lib/scan-marking-server";

export const maxDuration = 180;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent)) return scanJson({ error: "refused" }, 404);
  const result = await readScanMarking(session.admin, session.parent, id);
  if (!result || !await session.active()) return scanJson({ error: "refused" }, 404);
  // Parent projection contains no raw events, job internals, keys, answers or solutions.
  return scanJson({ completion: result.completion, counts: result.counts, budgetHeld: result.budgetHeld, items: result.items, photoAvailable: result.photoAvailable });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await scanSession(), { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  if (!isUuid(id) || !await markingAccess(session.admin, session.parent)) return scanJson({ error: "refused" }, 404);
  try { return scanJson({ status: await processScanMarking(session.admin, session.parent, id) }); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
