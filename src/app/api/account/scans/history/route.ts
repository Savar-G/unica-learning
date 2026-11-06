import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { markingAccess } from "@/lib/scan-marking-server";
import { scanHistoryStore } from "@/lib/scan-history-reader";
import { readScanHistory } from "@/lib/scan-history";
export async function GET(request: Request) {
  const session = await scanSession(), q = new URL(request.url).searchParams;
  const child = q.get("child"), workbook = q.get("workbook") || undefined, after = q.get("after") || undefined, status = q.get("status") || "all";
  if (!child || !isUuid(child) || (workbook && !isUuid(workbook)) || (after && !isUuid(after)) || !["all", "review", "failed"].includes(status)) return scanJson({ error: "invalid" }, 400);
  if (!await markingAccess(session.admin, session.parent)) return scanJson({ error: "refused" }, 404);
  try {
    const result = await readScanHistory(scanHistoryStore(session.admin, { parent: session.parent }), { child, workbook, after, status: status as "all" | "review" | "failed" }, Date.now());
    if (!result || !await session.active()) return scanJson({ error: "refused" }, 404);
    // Parent projection has no dispatch ledger, global budget, raw marks or answer text.
    return scanJson({ pages: result.pages, counts: result.counts, after: result.after });
  } catch { return scanJson({ error: "unavailable" }, 503); }
}
