import { monitorProduct, productAfter } from "@/lib/product-monitoring";
import { after } from "next/server";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { markSentPhotos, sendMarkingStart, SEND_MARKING_MAX_PHOTOS } from "@/lib/scan-send-marking";
import { sendFamilyPhotos } from "@/lib/scan-send";

/** Shares the time limit with the marking `after()` starts: 300 s is the Vercel Hobby maximum (src/lib/scan-send-marking.ts). */
export const maxDuration = 300;

/**
 * "Send N pages for marking" (D-270). Records the family's ready pages as sent; the database leaves every page that is not
 * ready (refused, still being checked, already sent) as it is. A scan can hold pages of several children, as each page's
 * code files it with its own child (#915), so the ids are grouped by the child each photo is filed with
 * (src/lib/scan-send.ts), and each child's pages go only when Send's rule opens for that child: `scanChecksAccess`, test
 * families and admins, and in families mode also a real family for a child whose plan is running (D-252). A sibling whose
 * plan is closed has none of its pages sent. `child` (the child the screen shows) is no longer needed; older pages still
 * send it. After the answer, marking starts on the sent pages (up to a cap) when the marking rule is open for the
 * family; `marking` is how many. The cron marks the rest.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  let child: unknown, ids: unknown;
  try { ({ child, ids } = await request.json()); } catch { return scanJson({ error: "refused" }, 400); }
  if ((child !== undefined && !isUuid(child)) || !Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(isUuid)) return scanJson({ error: "refused" }, 400);
  const { admin, parent } = session;
  let result;
  try {
    result = await sendFamilyPhotos(admin, parent, ids as string[], process.env,
      async (p, c) => ({ open: await scanChecksAccess(admin, p, process.env, { child: c }), reason: "send" }));
  } catch { monitorProduct("scan.send_failed"); return scanJson({ error: "unavailable" }, 503); }
  if (!result.open) return scanJson({ error: "refused" }, 404);
  let start: string[] = [];
  for (const c of result.byChild) start.push(...await sendMarkingStart(admin, parent, c.child, c.sent));
  start = start.slice(0, SEND_MARKING_MAX_PHOTOS);
  if (start.length) {
    const photos = start;
    if (!productAfter(after, () => markSentPhotos(parent, photos, startedAt), "scan.recovery_failed", { step: "marking" })) start = [];
  }
  return scanJson({ sent: result.sent, marking: start.length });
}
