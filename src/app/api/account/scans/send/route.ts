import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { markedFamily } from "@/lib/scan-pages-access";

/**
 * "Send N pages for marking" (D-270). Records the child's ready pages as sent; the database leaves every page that is not
 * ready (refused, still being checked, already sent) as it is. Marking itself (S4) is not built: nothing is marked and
 * no AI runs. Like the checks, Send is for test families and admins only until marking ships (D-252).
 */
export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  let child: unknown, ids: unknown;
  try { ({ child, ids } = await request.json()); } catch { return scanJson({ error: "refused" }, 400); }
  if (!isUuid(child) || !Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(isUuid)) return scanJson({ error: "refused" }, 400);
  if (!await markedFamily(session.parent, session.admin)) return scanJson({ error: "refused" }, 404);
  const { data, error } = await session.admin.rpc("send_scan_photos", { p_parent: session.parent, p_child: child as string, p_ids: [...new Set(ids as string[])] });
  if (error) return scanJson({ error: "unavailable" }, 503);
  return scanJson({ sent: data });
}
