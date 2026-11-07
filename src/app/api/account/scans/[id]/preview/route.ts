import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanPreview, runScanCrops, type ScanCropStore } from "@/lib/scan-crops";
import { scanCropStore } from "@/lib/scan-crops-store";

export const maxDuration = 60;

/** The preview follows `scanChecksAccess` (test families and admins; in families mode a running plan), whatever the Scan pages switch says (D-236). RLS scopes the photo. */
async function previewOf(id: string): Promise<{ store: ScanCropStore; parent: string } | null> {
  const session = await scanSession();
  if (!isUuid(id) || !await scanChecksAccess(session.admin, session.parent, process.env, { photo: id })) return null;
  const { data: photo } = await session.db.from("scan_photos").select("parent_id").eq("id", id).maybeSingle();
  return photo ? { store: scanCropStore(session.admin), parent: photo.parent_id } : null;
}

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview">) {
  const { id } = await params;
  const preview = await previewOf(id);
  if (!preview) return scanJson({ error: "refused" }, 404);
  try { return scanJson({ preview: await readScanPreview(preview.store, { parent: preview.parent, photo: id }) }); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}

/** Makes the straightened page and crops once. A repeated call gets the first call's work. */
export async function POST(request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview">) {
  const { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const preview = await previewOf(id);
  if (!preview) return scanJson({ error: "refused" }, 404);
  try { return scanJson({ preview: await runScanCrops(preview.store, { parent: preview.parent, photo: id }, randomUUID()) }); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
