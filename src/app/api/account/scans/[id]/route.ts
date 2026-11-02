import { isUuid } from "@/lib/workbook-content";
import { normalizeScanPhoto, readScanBody } from "@/lib/scan-photo-image";
import { scanSession, scanJson, scanView, scanPath, SCAN_BUCKET, cleanupScanPhoto } from "@/lib/scan-photo-server";

export const maxDuration = 60;

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const session = await scanSession();
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  await session.admin.rpc("recover_scan_photo", { p_parent: session.parent, p_id: id });
  const photo = await scanView(session.admin, session.parent, id);
  return photo ? scanJson({ photo }) : scanJson({ error: "refused" }, 404);
}

export async function PUT(request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  const { admin, parent } = session;
  const start = await admin.rpc("start_scan_photo", { p_parent: parent, p_id: id });
  if (start.error) return scanJson({ error: "unavailable" }, 503);
  if (["pending", "saved"].includes(start.data)) return scanJson({ photo: await scanView(admin, parent, id) });
  if (start.data !== "started") return scanJson({ error: start.data }, 409);
  try {
    const limits = await admin.from("scan_limits").select("input_bytes,output_bytes,decoded_pixels").single();
    if (limits.error) throw new Error("unavailable");
    const input = await readScanBody(request, limits.data.input_bytes);
    const normalized = await normalizeScanPhoto(input, { inputBytes: limits.data.input_bytes, pixels: limits.data.decoded_pixels, outputBytes: limits.data.output_bytes });
    const identified = await admin.rpc("identify_scan_photo", { p_parent: parent, p_id: id, p_token: normalized.token, p_width: normalized.width, p_height: normalized.height });
    if (identified.error) throw new Error("unavailable");
    if (identified.data !== "identified") throw new Error(identified.data);
    const uploaded = await admin.storage.from(SCAN_BUCKET).upload(scanPath(parent, id), normalized.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    // A lost Storage response is uncertain. Keep the reservation and reconcile on GET/retry/expiry.
    if (uploaded.error) return scanJson({ error: "uncertain" }, 503);
    const finished = await admin.rpc("finish_scan_photo", { p_parent: parent, p_id: id, p_bytes: normalized.bytes.length });
    if (finished.error) return scanJson({ error: "uncertain" }, 503);
    if (finished.data !== "pending") throw new Error(finished.data);
    return scanJson({ photo: await scanView(admin, parent, id) });
  } catch (error) {
    await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "reject" });
    await cleanupScanPhoto(admin, parent, id);
    const code = error instanceof Error && ["qr", "size", "page", "duplicate"].includes(error.message) ? error.message : "image";
    return scanJson({ error: code }, 422);
  }
}

export async function POST(request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  const result = await session.admin.rpc("change_scan_photo", { p_parent: session.parent, p_id: id, p_action: "save" });
  if (result.error || result.data !== "saved") return scanJson({ error: "refused" }, 409);
  return scanJson({ photo: await scanView(session.admin, session.parent, id) });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  const result = await session.admin.rpc("change_scan_photo", { p_parent: session.parent, p_id: id, p_action: "delete" });
  if (result.error || !["deleted", "expired", "rejected"].includes(result.data)) return scanJson({ error: "refused" }, 409);
  await cleanupScanPhoto(session.admin, session.parent, id);
  return scanJson({ state: result.data });
}
