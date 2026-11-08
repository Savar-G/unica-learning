import { after } from "next/server";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { markSentPhotos, sendMarkingStart } from "@/lib/scan-send-marking";

/** Shares the time limit with the marking `after()` starts: 300 s is the Vercel Hobby maximum (src/lib/scan-send-marking.ts). */
export const maxDuration = 300;

/**
 * "Send N pages for marking" (D-270). Records the child's ready pages as sent; the database leaves every page that is not
 * ready (refused, still being checked, already sent) as it is. Like the checks, Send follows `scanChecksAccess`: test
 * families and admins, and in families mode also a real family for a child whose plan is running (D-252).
 * After the answer, marking starts on the sent pages (up to a cap) when the marking rule is open for the family;
 * `marking` is how many. The cron marks the rest.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  let child: unknown, ids: unknown;
  try { ({ child, ids } = await request.json()); } catch { return scanJson({ error: "refused" }, 400); }
  if (!isUuid(child) || !Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(isUuid)) return scanJson({ error: "refused" }, 400);
  if (!await scanChecksAccess(session.admin, session.parent, process.env, { child: child as string })) return scanJson({ error: "refused" }, 404);
  const { data, error } = await session.admin.rpc("send_scan_photos", { p_parent: session.parent, p_child: child as string, p_ids: [...new Set(ids as string[])] });
  if (error) return scanJson({ error: "unavailable" }, 503);
  const sent = Array.isArray(data) ? data : [];
  let start = await sendMarkingStart(session.admin, session.parent, child as string, sent);
  if (start.length) {
    const parent = session.parent, photos = start;
    try { after(() => markSentPhotos(parent, photos, startedAt).then(() => undefined, () => undefined)); }
    catch { start = []; }
  }
  return scanJson({ sent: data, marking: start.length });
}
