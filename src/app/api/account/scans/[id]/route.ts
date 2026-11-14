import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { isUuid } from "@/lib/workbook-content";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { readScanPreview, runScanCrops } from "@/lib/scan-crops";
import { startPhotoCheck } from "@/lib/scan-photo-check-start";
import { scanCropStore } from "@/lib/scan-crops-store";
import { normalizeScanPhoto, readScanBody, type SpreadPage } from "@/lib/scan-photo-image";
import type { Database } from "@/lib/database";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    // A photo of an open book (#915) has two pages: this photo takes the first one its own code binds, and the other
    // becomes a photo of its own below. A single page is one page, exactly as before.
    const pages: SpreadPage[] = normalized.spread ?? [{ bytes: normalized.bytes, token: normalized.token, width: normalized.width, height: normalized.height }];
    let mine = -1, refusal: string | null = null;
    for (const [i, page] of pages.entries()) {
      const identified = await admin.rpc("identify_scan_photo", { p_parent: parent, p_id: id, p_token: page.token, p_width: page.width, p_height: page.height });
      if (identified.error) throw new Error("unavailable");
      if (identified.data === "identified") { mine = i; break; }
      refusal ??= identified.data;
      // Only a page that already has a photo, or is not this child's, lets the other page of a spread take this photo.
      if (!["duplicate", "page"].includes(identified.data)) break;
    }
    if (mine < 0) throw new Error(refusal ?? "image");
    const page = pages[mine];
    const uploaded = await admin.storage.from(SCAN_BUCKET).upload(scanPath(parent, id), page.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    // A lost Storage response is uncertain. Keep the reservation and reconcile on GET/retry/expiry.
    if (uploaded.error) return scanJson({ error: "uncertain" }, 503);
    const finished = await admin.rpc("finish_scan_photo", { p_parent: parent, p_id: id, p_bytes: page.bytes.length });
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
    const photo = await scanView(admin, parent, id);
    // The other page of a spread: only when this photo took the first page (a first page already scanned leaves nothing).
    let other = mine === 0 && pages.length === 2 && photo ? await spreadPhoto(admin, parent, photo.child_id, pages[1], received) : null;
    // A second page not saved (other than one that already has a photo): name it, so the parent can photograph it alone.
    if (other && !["saved", "duplicate"].includes(other.state)) {
      const named = await admin.from("workbook_pages").select("page_number").eq("parent_id", parent).eq("qr_token", pages[1].token).maybeSingle();
      if (!named.error && named.data) other = { ...other, page: named.data.page_number };
    }
    return scanJson(other ? { photo, spread: other } : { photo });
  } catch (error) {
    await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "reject" });
    await cleanupScanPhoto(admin, parent, id);
    const code = error instanceof Error && ["qr", "size", "page", "duplicate", "flat"].includes(error.message) ? error.message : "image";
    return scanJson({ error: code }, 422);
  }
}

/** How often, and how far apart, the second page of a spread asks again for an upload slot the phone's own uploads fill. */
const SPREAD_ADMIT_TRIES = 4, SPREAD_ADMIT_WAIT_MS = 1000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The second page of a spread (#915), as its own photo: admitted, bound by its own code, stored and saved like any upload,
 * then checked. Any refusal leaves the first page as it is and is answered as the second page's state, with its page
 * number when known, so the parent is told which page needs its own photo; a page that already has a photo is left
 * alone. Never thrown.
 */
async function spreadPhoto(admin: SupabaseClient<Database>, parent: string, child: string, page: SpreadPage, received: number): Promise<{ id: string; state: string; page?: number }> {
  const id = randomUUID();
  const fail = async (state: string) => {
    await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "reject" });
    await cleanupScanPhoto(admin, parent, id);
    return { id, state };
  };
  try {
    // The phone sends two photos at a time, and both count against the family's upload slots while they run: this page
    // asks again a few times, a second apart, instead of being dropped as busy (#965 review). Other refusals stand.
    let admitted = await admin.rpc("admit_scan_photo", { p_parent: parent, p_child: child, p_id: id, p_bytes: page.bytes.length });
    for (let tries = 1; !admitted.error && admitted.data === "busy" && tries < SPREAD_ADMIT_TRIES && Date.now() - received < UPLOAD_CHECK_BUDGET_MS; tries++) {
      await pause(SPREAD_ADMIT_WAIT_MS);
      admitted = await admin.rpc("admit_scan_photo", { p_parent: parent, p_child: child, p_id: id, p_bytes: page.bytes.length });
    }
    if (admitted.error || admitted.data !== "reserved") return { id, state: admitted.error ? "unavailable" : admitted.data };
    const started = await admin.rpc("start_scan_photo", { p_parent: parent, p_id: id });
    if (started.error || started.data !== "started") return fail(started.error ? "unavailable" : started.data);
    const identified = await admin.rpc("identify_scan_photo", { p_parent: parent, p_id: id, p_token: page.token, p_width: page.width, p_height: page.height });
    if (identified.error || identified.data !== "identified") return fail(identified.error ? "unavailable" : identified.data);
    const uploaded = await admin.storage.from(SCAN_BUCKET).upload(scanPath(parent, id), page.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    // A lost answer, from Storage or from the finish: the photo may be stored all the same. Nobody's page asks about this
    // photo later, so it is reconciled here, as the first photo's GET does (recover_scan_photo); still unknown, it expires.
    const finished = uploaded.error ? null : await admin.rpc("finish_scan_photo", { p_parent: parent, p_id: id, p_bytes: page.bytes.length });
    let state = finished && !finished.error ? finished.data : null;
    if (state === null) {
      const recovered = await admin.rpc("recover_scan_photo", { p_parent: parent, p_id: id });
      state = recovered.error ? null : recovered.data;
      if (state === null || state === "waiting") return { id, state: "uncertain" };
    }
    if (state !== "pending") return fail(state);
    // Nobody else saves this photo, so it is saved here, as the page saves the photo it uploaded.
    const saved = await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "save" });
    if (saved.error || saved.data !== "saved") return { id, state: "pending" };
    if (Date.now() - received < UPLOAD_CHECK_BUDGET_MS) after(async () => {
      try {
        if (!await scanChecksAccess(admin, parent, process.env, { photo: id })) return;
        if ((await runScanCrops(scanCropStore(admin), { parent, photo: id }, randomUUID())).status === "ready") await startPhotoCheck(admin, parent, id, (run) => run());
      } catch { /* the page asks again */ }
    });
    return { id, state: "saved" };
  } catch { return fail("unavailable"); }
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
