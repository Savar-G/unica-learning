import { monitorProduct, productAfter } from "@/lib/product-monitoring";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { storedPrintContract } from "@/lib/workbook-print-contract";
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
  // "Use this new photo instead" (scan edge sweep #4): the page's ready photo, not sent, that this new photo replaces.
  const replace = new URL(request.url).searchParams.get("replace");
  const start = await admin.rpc("start_scan_photo", { p_parent: parent, p_id: id });
  if (start.error) { monitorProduct("scan.upload_failed", { photoId: id }); return scanJson({ error: "unavailable" }, 503); }
  if (["pending", "saved"].includes(start.data)) return scanJson({ photo: await scanView(admin, parent, id) });
  if (start.data !== "started") return scanJson({ error: start.data }, 409);
  // The page a duplicate refusal names, and the photo it may replace (#4): the parent is told "Page 27 is already scanned".
  let duplicate: Awaited<ReturnType<typeof duplicateOf>> = null;
  try {
    const limits = await admin.from("scan_limits").select("input_bytes,output_bytes,decoded_pixels").single();
    if (limits.error) throw new Error("unavailable");
    const input = await readScanBody(request, limits.data.input_bytes);
    const normalized = await normalizeScanPhoto(input, { inputBytes: limits.data.input_bytes, pixels: limits.data.decoded_pixels, outputBytes: limits.data.output_bytes }, async (token) => {
      const { data } = await admin.from("workbook_pages").select("workbook_id,page_number,image_width,image_height,print_contract")
        .eq("parent_id", parent).eq("qr_token", token).maybeSingle();
      if (!data?.image_width || !data.image_height) return null;
      return storedPrintContract(data.print_contract, { workbookId: data.workbook_id, page: data.page_number,
        image: { width: data.image_width, height: data.image_height } });
    });
    // A photo of an open book (#915) has two pages: this photo takes the first one its own code binds, and the other
    // becomes a photo of its own below. A single page is one page, exactly as before.
    const pages: SpreadPage[] = normalized.spread ?? [{ bytes: normalized.bytes, token: normalized.token, width: normalized.width, height: normalized.height }];
    let mine = -1, refusal: string | null = null, refusedToken: string | null = null, replaces: string | null = null;
    for (const [i, page] of pages.entries()) {
      const identify = () => admin.rpc("identify_scan_photo", { p_parent: parent, p_id: id, p_token: page.token, p_width: page.width, p_height: page.height });
      let identified = await identify();
      // A new photo of a page whose photo needs another photo is its retake, however it was taken (F5). A ready photo,
      // not sent, goes only when the parent asked for this photo instead of it (#4).
      if (!identified.error && identified.data === "duplicate" && await replaceRefusedPhoto(admin, parent, page.token, session.childOpen, isUuid(replace) ? replace : null)) identified = await identify();
      if (identified.error) throw new Error("unavailable");
      if (identified.data === "identified") { mine = i; break; }
      // A page that looked unfinished: this photo replaces its photo once stored (below).
      if (identified.data === "duplicate" && (replaces = await unfinishedHeld(admin, parent, page.token, session.childOpen))) { mine = i; break; }
      if (refusal === null) { refusal = identified.data; refusedToken = page.token; }
      // Only a page that already has a photo, or is not this child's, lets the other page of a spread take this photo.
      if (!["duplicate", "page"].includes(identified.data)) break;
    }
    if (mine < 0 && refusal === "duplicate" && refusedToken) duplicate = await duplicateOf(admin, parent, refusedToken);
    if (mine < 0) throw new Error(refusal ?? "image");
    // A code may file the photo with a sibling's book (#915): that child's own plan must open scanning too, or the page
    // is refused as not this family's, before anything is stored.
    // (A replacement is not filed yet: its page's photo belongs to a child unfinishedHeld found open.)
    if (!replaces && !await filedChildOpen(admin, parent, id, session.childOpen)) throw new Error("page");
    const page = pages[mine];
    const uploaded = await admin.storage.from(SCAN_BUCKET).upload(scanPath(parent, id), page.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    // A lost Storage response is uncertain. Keep the reservation and reconcile on GET/retry/expiry.
    if (uploaded.error) { monitorProduct("scan.upload_failed", { photoId: id }); return scanJson({ error: "uncertain" }, 503); }
    // The unfinished page's photo goes only now, in the same transaction that binds and stores this one.
    const finished = replaces
      ? await admin.rpc("replace_unfinished_scan_photo", { p_parent: parent, p_id: id, p_token: page.token, p_width: page.width, p_height: page.height, p_bytes: page.bytes.length })
      : await admin.rpc("finish_scan_photo", { p_parent: parent, p_id: id, p_bytes: page.bytes.length });
    // A lost answer (of the swap too) is reconciled by the GET: a swap that ran left this photo pending; one that did not
    // leaves the old photo, and this one (never bound to the page) is refused.
    if (finished.error) { monitorProduct("scan.upload_failed", { photoId: id }); return scanJson({ error: "uncertain" }, 503); }
    if (finished.data !== "pending") throw new Error(finished.data);
    monitorProduct("scan.upload_committed", { photoId: id, count: 1 });
    if (replaces) await cleanupScanPhoto(admin, parent, replaces);
    // Speed (#915): the page check starts here, as soon as the photo is stored, instead of waiting for the page to save
    // the photo, list the stack again and ask. The job is the same one the preview route runs, under the same lease: a
    // later ask gets its result, a busy family slot leaves it to that ask, and any error leaves the photo as it was.
    // Only when most of this request's time is left: the job shares the upload's time limit (maxDuration), and a job
    // cut off mid-run would hold the family's check slot until its lease ends. Otherwise the page's ask runs it.
    if (Date.now() - received < UPLOAD_CHECK_BUDGET_MS) productAfter(after, async () => {
      try { if (await scanChecksAccess(admin, parent, process.env, { photo: id })) await runScanCrops(scanCropStore(admin), { parent, photo: id }, randomUUID()); }
      catch { monitorProduct("scan.check_failed", { photoId: id }); }
    }, "scan.check_failed", { photoId: id });
    const photo = await scanView(admin, parent, id);
    // The other page of a spread: only when this photo took the first page (a first page already scanned leaves nothing).
    let other = mine === 0 && pages.length === 2 && photo ? await spreadPhoto(admin, parent, photo.child_id, pages[1], received, session.childOpen) : null;
    // A second page not saved (other than one that already has a photo): name it, so the parent can photograph it alone.
    if (other && !["saved", "duplicate"].includes(other.state)) {
      const named = await admin.from("workbook_pages").select("page_number").eq("parent_id", parent).eq("qr_token", pages[1].token).maybeSingle();
      if (!named.error && named.data) other = { ...other, page: named.data.page_number };
    }
    return scanJson(other ? { photo, spread: other } : { photo });
  } catch (error) {
    if (!(error instanceof Error) || !["qr", "size", "page", "duplicate", "flat", "image", "expired", "refused", "deleted"].includes(error.message)) monitorProduct("scan.upload_failed", { photoId: id });
    await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "reject" });
    await cleanupScanPhoto(admin, parent, id);
    const code = error instanceof Error && ["qr", "size", "page", "duplicate", "flat"].includes(error.message) ? error.message : "image";
    // A duplicate names its page, and the photo the new one may replace (a ready photo not sent): never a problem (#4).
    return scanJson(code === "duplicate" && duplicate ? { error: code, ...duplicate } : { error: code }, 422);
  }
}

/** How often, and how far apart, the second page of a spread asks again for an upload slot the phone's own uploads fill. */
const SPREAD_ADMIT_TRIES = 4, SPREAD_ADMIT_WAIT_MS = 1000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A page's photo that the check refused, not sent, goes when a new photo of that page arrives (F5): the parent may retake
 * it with the retake button, which deletes it first, or with a plain Scan pages, which before this was refused as "already
 * has a photo" and left the parent with no way forward. Only a photo whose stored check refused it, as the stack shows it
 * (`stackCheck` in src/lib/scan-stack-server.ts: a finished check of the photo's own printing that is not ready), and that
 * was never sent. A photo still being checked and a sent photo stay: a new photo of those is a duplicate. A ready photo
 * stays too, unless `ready` names it: the parent pressed "Use this new photo instead" on the duplicate (#4).
 * True when it went, so the caller identifies the new photo again. Any failed read keeps the old photo.
 */
async function replaceRefusedPhoto(admin: SupabaseClient<Database>, parent: string, token: string, childOpen: (child: string) => Promise<boolean>, ready: string | null = null): Promise<boolean> {
  try {
    const page = await admin.from("workbook_pages").select("id").eq("parent_id", parent).eq("qr_token", token).maybeSingle();
    if (page.error || !page.data) return false;
    const held = await admin.from("scan_photos").select("id,child_id,printed_revision,sent_at").eq("parent_id", parent).eq("page_id", page.data.id).eq("state", "saved").maybeSingle();
    if (held.error || !held.data || held.data.sent_at) return false;
    // The new photo files with the same child: a child whose plan does not open scanning keeps the old photo, as the new
    // one would be refused (#977 review). Asked before anything is deleted.
    if (!await childOpen(held.data.child_id)) return false;
    const check = await admin.from("scan_calibrations").select("state,printed_revision").eq("parent_id", parent).eq("photo_id", held.data.id).maybeSingle();
    const c = check.data;
    if (check.error || !c || c.state === "running" || c.printed_revision !== held.data.printed_revision) return false;
    // A ready photo goes only when the parent chose this new photo instead of that one (#4).
    if (c.state === "ready" && held.data.id !== ready) return false;
    // The delete itself rechecks everything under the family lock (`replace_ready_scan_photo`): still saved, unsent,
    // active, with no marking job and a finished check of its own printing. A photo sent meanwhile is kept.
    const gone = await admin.rpc("replace_ready_scan_photo", { p_parent: parent, p_old: held.data.id, p_page: page.data.id });
    if (gone.error || gone.data !== "deleted") return false;
    await cleanupScanPhoto(admin, parent, held.data.id);
    return true;
  } catch { return false; }
}

/**
 * The page's sent photo whose marking found every answer blank (its job ended `unfinished`, nothing marked; scan edge
 * sweep, 2026-11-14), when its child has scanning open: a new photo of the page replaces it, but only once the new photo
 * is stored (`replace_unfinished_scan_photo`), so a refused or lost upload leaves it in place. Null otherwise.
 */
async function unfinishedHeld(admin: SupabaseClient<Database>, parent: string, token: string, childOpen: (child: string) => Promise<boolean>): Promise<string | null> {
  try {
    const page = await admin.from("workbook_pages").select("id").eq("parent_id", parent).eq("qr_token", token).maybeSingle();
    if (page.error || !page.data) return null;
    const held = await admin.from("scan_photos").select("id,child_id,printed_revision,sent_at").eq("parent_id", parent).eq("page_id", page.data.id).eq("state", "saved").maybeSingle();
    if (held.error || !held.data?.sent_at || !await childOpen(held.data.child_id)) return null;
    const job = await admin.from("scan_marking_jobs").select("state,blocked_reason").eq("parent_id", parent).eq("photo_id", held.data.id).maybeSingle();
    return !job.error && job.data?.state === "finished" && job.data.blocked_reason === "unfinished" ? held.data.id : null;
  } catch { return null; }
}

/**
 * The page a duplicate is of (#4): its printed number, and `replaceable`, the id of the page's photo when that photo is
 * ready and not sent, so the parent may use the new photo instead. Null on a failed read: a plain duplicate.
 */
async function duplicateOf(admin: SupabaseClient<Database>, parent: string, token: string): Promise<{ page: number; replaceable?: string } | null> {
  try {
    const page = await admin.from("workbook_pages").select("id,page_number").eq("parent_id", parent).eq("qr_token", token).maybeSingle();
    if (page.error || !page.data) return null;
    const held = await admin.from("scan_photos").select("id,printed_revision,sent_at").eq("parent_id", parent).eq("page_id", page.data.id).eq("state", "saved").maybeSingle();
    if (held.error || !held.data || held.data.sent_at) return { page: page.data.page_number };
    const check = await admin.from("scan_calibrations").select("state,printed_revision").eq("parent_id", parent).eq("photo_id", held.data.id).maybeSingle();
    const ready = !check.error && check.data?.state === "ready" && check.data.printed_revision === held.data.printed_revision;
    return ready ? { page: page.data.page_number, replaceable: held.data.id } : { page: page.data.page_number };
  } catch { return null; }
}

/** Whether the child a photo is filed with now has scanning open (#915 sibling filing). A failed read is closed. */
async function filedChildOpen(admin: SupabaseClient<Database>, parent: string, id: string, childOpen: (child: string) => Promise<boolean>) {
  const filed = await admin.from("scan_photos").select("child_id").eq("id", id).eq("parent_id", parent).maybeSingle();
  return !filed.error && !!filed.data && childOpen(filed.data.child_id);
}

/**
 * The second page of a spread (#915), as its own photo: admitted, bound by its own code, stored and saved like any upload,
 * then checked. Any refusal leaves the first page as it is and is answered as the second page's state, with its page
 * number when known, so the parent is told which page needs its own photo; a page that already has a photo is left
 * alone. Never thrown.
 */
async function spreadPhoto(admin: SupabaseClient<Database>, parent: string, child: string, page: SpreadPage, received: number, childOpen: (child: string) => Promise<boolean>): Promise<{ id: string; state: string; page?: number }> {
  const id = randomUUID();
  const fail = async (state: string) => {
    await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "reject" });
    await cleanupScanPhoto(admin, parent, id);
    return { id, state };
  };
  try {
    // The phone sends two photos at a time, and both count against the family's upload slots while they run: this page
    // asks again a few times, a second apart, instead of being dropped as busy (#965 review). Other refusals stand.
    let admitted = await admin.rpc("admit_scan_photo_v2", { p_parent: parent, p_child: child, p_id: id, p_bytes: page.bytes.length });
    for (let tries = 1; !admitted.error && admitted.data === "busy" && tries < SPREAD_ADMIT_TRIES && Date.now() - received < UPLOAD_CHECK_BUDGET_MS; tries++) {
      await pause(SPREAD_ADMIT_WAIT_MS);
      admitted = await admin.rpc("admit_scan_photo_v2", { p_parent: parent, p_child: child, p_id: id, p_bytes: page.bytes.length });
    }
    if (admitted.error || admitted.data !== "reserved") return { id, state: admitted.error ? "unavailable" : admitted.data };
    const started = await admin.rpc("start_scan_photo", { p_parent: parent, p_id: id });
    if (started.error || started.data !== "started") return fail(started.error ? "unavailable" : started.data);
    const identify = () => admin.rpc("identify_scan_photo", { p_parent: parent, p_id: id, p_token: page.token, p_width: page.width, p_height: page.height });
    let identified = await identify();
    if (!identified.error && identified.data === "duplicate" && await replaceRefusedPhoto(admin, parent, page.token, childOpen)) identified = await identify();
    if (identified.error || identified.data !== "identified") return fail(identified.error ? "unavailable" : identified.data);
    if (!await filedChildOpen(admin, parent, id, childOpen)) return fail("page");
    const uploaded = await admin.storage.from(SCAN_BUCKET).upload(scanPath(parent, id), page.bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    // A lost answer, from Storage or from the finish: the photo may be stored all the same. Nobody's page asks about this
    // photo later, so it is reconciled here, as the first photo's GET does (recover_scan_photo); still unknown, it expires.
    const finished = uploaded.error ? null : await admin.rpc("finish_scan_photo", { p_parent: parent, p_id: id, p_bytes: page.bytes.length });
    let state = finished && !finished.error ? finished.data : null;
    if (state === null) {
      const recovered = await admin.rpc("recover_scan_photo", { p_parent: parent, p_id: id });
      state = recovered.error ? null : recovered.data;
      if (state === null || state === "waiting") { monitorProduct("scan.upload_failed", { photoId: id }); return { id, state: "uncertain" }; }
    }
    if (state !== "pending") return fail(state);
    monitorProduct("scan.upload_committed", { photoId: id, count: 1 });
    // Nobody else saves this photo, so it is saved here, as the page saves the photo it uploaded.
    const saved = await admin.rpc("change_scan_photo", { p_parent: parent, p_id: id, p_action: "save" });
    if (saved.error || saved.data !== "saved") return { id, state: "pending" };
    if (Date.now() - received < UPLOAD_CHECK_BUDGET_MS) productAfter(after, async () => {
      try {
        if (!await scanChecksAccess(admin, parent, process.env, { photo: id })) return;
        if ((await runScanCrops(scanCropStore(admin), { parent, photo: id }, randomUUID())).status === "ready") await startPhotoCheck(admin, parent, id, (run) => run());
      } catch { monitorProduct("scan.check_failed", { photoId: id }); }
    }, "scan.check_failed", { photoId: id });
    return { id, state: "saved" };
  } catch { monitorProduct("scan.upload_failed", { photoId: id }); return fail("unavailable"); }
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
  productAfter(after, async () => {
    try {
      if (!await scanChecksAccess(admin, parent, process.env, { photo: id })) return;
      if ((await readScanPreview(scanCropStore(admin), { parent, photo: id })).status !== "ready") return;
      await startPhotoCheck(admin, parent, id, (run) => run());
    } catch { monitorProduct("scan.check_failed", { photoId: id }); }
  }, "scan.check_failed", { photoId: id });
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
