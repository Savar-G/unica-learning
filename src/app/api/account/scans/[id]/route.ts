import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { isUuid } from "@/lib/workbook-content";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanPreview, runScanCrops } from "@/lib/scan-crops";
import { startPhotoCheck } from "@/lib/scan-photo-check-start";
import { scanCropStore } from "@/lib/scan-crops-store";
import { normalizeScanPhoto, readScanBody } from "@/lib/scan-photo-image";
import { scanSession, scanJson, scanView, scanPath, SCAN_BUCKET, cleanupScanPhoto } from "@/lib/scan-photo-server";

export const maxDuration = 60;
/** The most a request may have used before it starts the page check itself (#915 review: the check needs about 40 s). */
const UPLOAD_CHECK_BUDGET_MS = 15_000;

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const session = await scanSession();
  const { id } = await params;
  if (!isUuid(id) || !await session.photoOpen(id)) return scanJson({ error: "refused" }, 404);
  await session.admin.rpc("recover_scan_photo", { p_parent: session.parent, p_id: id });
  const photo = await scanView(session.admin, session.parent, id);
  return photo ? scanJson({ photo }) : scanJson({ error: "refused" }, 404);
}

export async function PUT(request: Request, { params }: RouteContext<"/api/account/scans/[id]">) {
  const received = Date.now();
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const { id } = await params;
  if (!isUuid(id) || !await session.photoOpen(id)) return scanJson({ error: "refused" }, 404);
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
    // Speed (#915): the page check starts here, as soon as the photo is stored, instead of waiting for the page to save
    // the photo, list the stack again and ask. The job is the same one the preview route runs, under the same lease: a
    // later ask gets its result, a busy family slot leaves it to that ask, and any error leaves the photo as it was.
    // Only when most of this request's time is left: the job shares the upload's time limit (maxDuration), and a job
    // cut off mid-run would hold the family's check slot until its lease ends. Otherwise the page's ask runs it.
    if (Date.now() - received < UPLOAD_CHECK_BUDGET_MS) after(async () => {
      try { if (await scanChecksAccess(admin, parent, process.env, { photo: id })) await runScanCrops(scanCropStore(admin), { parent, photo: id }, randomUUID()); }
      catch { /* the page asks again */ }
    });
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
  if (!isUuid(id) || !await session.photoOpen(id)) return scanJson({ error: "refused" }, 404);
  const result = await session.admin.rpc("change_scan_photo", { p_parent: session.parent, p_id: id, p_action: "save" });
  if (result.error || result.data !== "saved") return scanJson({ error: "refused" }, 409);
  // #915 (Savar's review): a page check that finished at upload, before the page first listed the photo, leaves the
  // page nothing to ask, so the photo check starts here once the photo is saved. A claim is taken once per photo.
  const { admin, parent } = session;
  after(async () => {
    try {
      if (!await scanChecksAccess(admin, parent, process.env, { photo: id })) return;
      if ((await readScanPreview(scanCropStore(admin), { parent, photo: id })).status !== "ready") return;
      await startPhotoCheck(admin, parent, id, (run) => run());
    } catch { /* the page's preview ask starts it */ }
  });
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
