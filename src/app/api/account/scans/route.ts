import { monitorProduct, productAfter } from "@/lib/product-monitoring";
import { markingAccess } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanStack } from "@/lib/scan-stack-server";
import { after } from "next/server";
import { sendDuePhotos } from "@/lib/scan-send";
import { markSentPhotos, sendMarkingStart, SEND_MARKING_MAX_PHOTOS } from "@/lib/scan-send-marking";

/**
 * The first load of Scan pages (`due=1`) sends the family's held pages whose Undo passed while nobody was on the page
 * (scan edge sweep #3): the parent left during the Undo. Then marking starts on them, as Send starts it. Never throws.
 */
async function sendDue(session: Awaited<ReturnType<typeof scanSession>>, startedAt: number) {
  try {
    const due = await sendDuePhotos(session.admin, { parent: session.parent });
    let start: string[] = [];
    for (const c of due.flatMap((d) => d.byChild)) start.push(...await sendMarkingStart(session.admin, session.parent, c.child, c.sent));
    start = start.slice(0, SEND_MARKING_MAX_PHOTOS);
    const parent = session.parent;
    if (start.length) productAfter(after, () => markSentPhotos(parent, start, startedAt), "scan.recovery_failed", { step: "marking" });
  } catch { monitorProduct("scan.recovery_failed", { step: "send" }); }
}

export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  try {
    const { id, child, bytes } = await request.json();
    if (!isUuid(id) || !isUuid(child) || !Number.isSafeInteger(bytes)) return scanJson({ error: "refused" }, 400);
    if (!await session.childOpen(child)) return scanJson({ error: "refused" }, 404);
    // v2 tells the 10-minute limit (`frequency`) from the day's (`daily`); the old function answers `frequency` for both.
    const { data, error } = await session.admin.rpc("admit_scan_photo_v2", { p_parent: session.parent, p_child: child, p_id: id, p_bytes: bytes });
    if (error) { monitorProduct("scan.upload_failed"); return scanJson({ error: "unavailable" }, 503); }
    if (!["reserved", "processing", "pending", "saved"].includes(data)) return scanJson({ error: data }, 429);
    return scanJson({ state: data, id });
  } catch { return scanJson({ error: "refused" }, 400); }
}

/**
 * The child's stack (round r565): active photos with their check and whether they were sent, and the printed pages of
 * their days. Checks follow `scanChecksAccess` (test families and admins; in families mode a child whose plan is running),
 * whatever the Scan pages switch says (D-252).
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  // The page polls this every few seconds: the family's marked and plan answers are read once for this request and reused
  // by the four checks below (shareReads), never kept for the next request.
  const session = await scanSession({ shareReads: true });
  const query = new URL(request.url).searchParams, child = query.get("child");
  if (!child || !isUuid(child)) return scanJson({ error: "refused" }, 400);
  if (!await session.childOpen(child)) return scanJson({ error: "refused" }, 404);
  if (query.get("due") === "1") await sendDue(session, startedAt);
  try {
    const checks = await scanChecksAccess(session.admin, session.parent, process.env, { child }, undefined, session.reads);
    return scanJson({ checks, marking: await markingAccess(session.admin, session.parent, process.env, { child }, undefined, session.reads), ...await readScanStack(session.admin, session.parent, child, checks) });
  } catch { monitorProduct("dashboard.request_failed", { step: "stack" }); return scanJson({ error: "unavailable" }, 503); }
}
