import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanPreview, runScanCrops, type ScanCropStore } from "@/lib/scan-crops";
import { scanCropStore } from "@/lib/scan-crops-store";
import { claimPhotoCheck, runPhotoCheck } from "@/lib/scan-photo-check";
import { photoCheckClient, photoCheckStore, readPhotoCheckView } from "@/lib/scan-photo-check-store";
import type { Database } from "@/lib/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/** The preview follows `scanChecksAccess` (test families and admins; in families mode a running plan), whatever the Scan pages switch says (D-236). RLS scopes the photo. */
async function previewOf(id: string): Promise<{ store: ScanCropStore; parent: string; admin: SupabaseClient<Database> } | null> {
  const session = await scanSession();
  if (!isUuid(id) || !await scanChecksAccess(session.admin, session.parent, process.env, { photo: id })) return null;
  const { data: photo } = await session.db.from("scan_photos").select("parent_id").eq("id", id).maybeSingle();
  return photo ? { store: scanCropStore(session.admin), parent: photo.parent_id, admin: session.admin } : null;
}

/**
 * The photo check (#855): when the page is ready, claim the check (test families and admins only, and only with the
 * decision key set) so this answer already says "pending", and run it after the answer is sent. It never delays or fails
 * the preview: any error here leaves the check as it is.
 */
async function startPhotoCheck(admin: SupabaseClient<Database>, parent: string, photo: string) {
  try {
    const client = photoCheckClient();
    if (!client) return;
    const store = photoCheckStore(admin), token = randomUUID();
    if (!await claimPhotoCheck(store, { parent, photo }, { client, token })) return;
    after(() => runPhotoCheck(store, { parent, photo }, { client, token }).then(() => undefined, () => undefined));
  } catch { /* the check is optional: the preview stands */ }
}

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview">) {
  const { id } = await params;
  const preview = await previewOf(id);
  if (!preview) return scanJson({ error: "refused" }, 404);
  try {
    const answer = await readScanPreview(preview.store, { parent: preview.parent, photo: id });
    return scanJson({ preview: answer, photoCheck: answer.status === "ready" ? await readPhotoCheckView(preview.admin, preview.parent, id) : null });
  }
  catch { return scanJson({ error: "unavailable" }, 503); }
}

/** Makes the straightened page and crops once. A repeated call gets the first call's work. */
export async function POST(request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview">) {
  const { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const preview = await previewOf(id);
  if (!preview) return scanJson({ error: "refused" }, 404);
  try {
    const answer = await runScanCrops(preview.store, { parent: preview.parent, photo: id }, randomUUID());
    if (answer.status !== "ready") return scanJson({ preview: answer, photoCheck: null });
    await startPhotoCheck(preview.admin, preview.parent, id);
    return scanJson({ preview: answer, photoCheck: await readPhotoCheckView(preview.admin, preview.parent, id) });
  }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
