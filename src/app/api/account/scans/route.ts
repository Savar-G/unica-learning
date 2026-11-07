import { markingAccess } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanStack } from "@/lib/scan-stack-server";

export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  try {
    const { id, child, bytes } = await request.json();
    if (!isUuid(id) || !isUuid(child) || !Number.isSafeInteger(bytes)) return scanJson({ error: "refused" }, 400);
    if (!await session.childOpen(child)) return scanJson({ error: "refused" }, 404);
    const { data, error } = await session.admin.rpc("admit_scan_photo", { p_parent: session.parent, p_child: child, p_id: id, p_bytes: bytes });
    if (error) return scanJson({ error: "unavailable" }, 503);
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
  const session = await scanSession();
  const child = new URL(request.url).searchParams.get("child");
  if (!child || !isUuid(child)) return scanJson({ error: "refused" }, 400);
  if (!await session.childOpen(child)) return scanJson({ error: "refused" }, 404);
  try {
    const checks = await scanChecksAccess(session.admin, session.parent, process.env, { child });
    return scanJson({ checks, marking: await markingAccess(session.admin, session.parent, process.env, { child }), ...await readScanStack(session.admin, session.parent, child, checks) });
  } catch { return scanJson({ error: "unavailable" }, 503); }
}
