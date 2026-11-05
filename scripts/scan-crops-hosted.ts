// Synthetic S2b evidence on the hosted database and Storage: the real fence, the real restrictive policy, the real image
// routes and the real retention worker key. It changes only this script's freshly made test families. Real Chromium prints
// the pages; the "written answers" are drawn digits, so this proves geometry and access, not reading handwriting.
//
// Run: see docs/scan-pages.md. Phases: prepare, seed, check, deletion, cleanup.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import sharp from "sharp";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Database, Json } from "@/lib/database";
import { runFamilyDeletion } from "@/lib/family-deletion-store";
import { isFenceRefusal } from "@/lib/scan-crops";
import { scanCropStore } from "@/lib/scan-crops-store";
import { cleanupScanPhoto } from "@/lib/scan-photo-server";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import { cropPlan, type CropItem } from "@/lib/scan-calibration";
import { cropCut, drawDigit, fillBox, greyRaster, photoJpeg, photographed, readDigit } from "@/lib/scan-synthetic";
import { workbookProblem, type WorkbookInput } from "@/lib/workbook-content";
import { printedRevision, SCAN_MANIFEST_VERSION } from "@/lib/workbook-print-contract";
import { renderWorkbook, type DraftPage } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((x) => /^[A-Z_]+=/.test(x)).map((x) => {
  const at = x.indexOf("=");
  return [x.slice(0, at), x.slice(at + 1).replace(/^"|"$/g, "")];
}));
const URL_ = "https://cdjobwsyzndtltzfpyqa.supabase.co";
const PUB = "sb_publishable_QkL33gGZ-E1gOVdnLJsUEg_RgrRyqUs";
const base = process.env.SCAN_BASE ?? "http://localhost:3455";
const fixtureFile = process.env.SCAN_FIXTURE!;
const evidence = ".design/experiments/r455";
const admin = createClient<Database>(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = <R extends { data: unknown; error: { message: string } | null }>(r: R): NonNullable<R["data"]> => { if (r.error) throw new Error(r.error.message); return r.data as NonNullable<R["data"]>; };

interface Family { role: string; id: string; child: string; email: string; password: string }
interface PrintedPage { number: number; token: string; imagePath: string; crops: CropItem[]; notSupported: number[] }
interface Fixture { families: Family[]; book: string; pages: PrintedPage[]; legacyToken: string; revision: string; photos: Record<string, string>; lease?: string }

const digitOf = (i: number) => (i * 3 + 1) % 10;
const save = (f: Fixture) => writeFileSync(fixtureFile, JSON.stringify(f), { mode: 0o600 });
const load = (): Fixture => JSON.parse(readFileSync(fixtureFile, "utf8"));

async function prepare() {
  const families: Family[] = [];
  for (const role of ["owner", "other", "admin"]) {
    const email = `scan455-${role}-${randomUUID()}@example.test`, password = `${randomUUID()}aA!7`;
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user!;
    const child = randomUUID();
    ok(await admin.from("parents").insert({ id: user.id, email, name: "Scan QA", source: { qa: "455" }, time_zone: "America/Vancouver" }));
    ok(await admin.from("test_accounts").insert({ parent_id: user.id, marked_by: user.id }));
    ok(await admin.from("children").insert({ id: child, parent_id: user.id, first_name: "Alex", grade: 3, province: "BC" }));
    if (role === "admin") ok(await admin.from("admin_users").insert({ user_id: user.id, email, name: "Scan QA Admin" }));
    families.push({ role, id: user.id, child, email, password });
  }
  const owner = families[0];
  const book = randomUUID();
  // Saved now, so `cleanup` can remove the families even if a later step fails.
  save({ families, book, pages: [], legacyToken: "", revision: "", photos: {} });
  const { draft } = sampleBook({ level: "U16", workbookId: book, childId: owner.child, child: "Alex", number: 1 });
  const render = async () => {
    const pages = draft.pages.filter((p: DraftPage) => p.dayLabel === "Day 1" && p.questions.length > 0)
      .map((p: DraftPage) => ({ ...p, qrToken: `scan455${randomUUID().replaceAll("-", "")}` }));
    return renderWorkbook({ draft: { ...draft, pages }, parentId: owner.id, template: workbookTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine(), fileKey: "qa455" });
  };
  // (The renderer refuses a printed QR code that it cannot read back. New random tokens print a different code.)
  let result = await render();
  for (let tries = 0; result.status !== "rendered" && tries < 3; tries++) result = await render();
  if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
  for (const f of result.files) ok(await admin.storage.from("workbook-pages").upload(f.path, f.bytes, { contentType: f.contentType }));
  const w = result.workbook as unknown as WorkbookInput;
  const manifest = { version: SCAN_MANIFEST_VERSION, curriculum: { key: "bc", version: "qa455" }, testWorkbook: false, snapshotDay: 7, days: [{ day: 1, pages: w.pages.map((p) => p.number) }], levelTest: null };
  const input: WorkbookInput = { ...w, printManifest: manifest };
  const revision = printedRevision({ id: input.id, pdfPath: input.pdfPath, pdfSha256: input.pdfSha256, printManifest: manifest, pages: input.pages })!;
  assert(revision, "the book has a printed revision");
  input.printedRevision = revision;
  assert.equal(workbookProblem(input), null);
  const written = ok(await admin.rpc("write_workbook", { p_workbook: input as unknown as Json, p_schema_version: QUESTION_PACKAGE_VERSION })) as { status: string; reason?: string };
  assert.equal(written.status, "written", written.reason);
  const now = new Date().toISOString();
  for (const update of [{ status: "approved", approved_at: now }, { status: "printed", printed_at: now }, { status: "shipped", shipped_at: now }] as const) ok(await admin.from("workbooks").update(update).eq("id", book));

  const legacyBook = randomUUID(), legacyToken = `scan455${randomUUID().replaceAll("-", "")}`;
  ok(await admin.from("workbooks").insert({ id: legacyBook, parent_id: owner.id, child_id: owner.child, number: 2, levels: [16], status: "draft", approved_at: now, printed_at: now, shipped_at: now }));
  ok(await admin.from("workbook_pages").insert({ id: randomUUID(), parent_id: owner.id, workbook_id: legacyBook, page_number: 3, day_label: "Day 1", page_type: "practice", qr_token: legacyToken }));
  ok(await admin.from("workbooks").update({ status: "shipped" }).eq("id", legacyBook));

  const printed: PrintedPage[] = w.pages.map((p) => {
    const plan = cropPlan(p.questions.map((q) => ({ number: q.number, package: q.package, regions: q.regions ?? null })));
    return { number: p.number, token: p.qrToken, imagePath: p.image!.path, crops: plan.crops, notSupported: plan.notSupported };
  }).filter((p) => p.crops.length > 0);
  assert(printed.length >= 5, `pages with crops: ${printed.length}`);
  save({ families, book, pages: printed, legacyToken, revision, photos: {} });
  console.log(`Prepared 3 test families and a shipped book of ${w.pages.length} real pages, ${printed.length} with crops.`);
}

async function session(f: Family) {
  const cookies = new Map<string, string>();
  const db = createServerClient<Database>(URL_, PUB, { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => cookies.set(c.name, c.value)) } });
  ok(await db.auth.signInWithPassword({ email: f.email, password: f.password }));
  return { db, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
}
type Session = Awaited<ReturnType<typeof session>>;

const SIZE = { width: 2000, height: 2600 };
const CORNERS = [{ x: 180, y: 90 }, { x: 1830, y: 150 }, { x: 1920, y: 2500 }, { x: 90, y: 2470 }];

/** A photo of a printed page, with drawn answers; `cover` paints over one scan mark. */
async function photoOf(page: PrintedPage, o: { cover?: boolean } = {}) {
  const { data, error } = await admin.storage.from("workbook-pages").download(page.imagePath);
  if (error) throw new Error(error.message);
  const r = await greyRaster(new Uint8Array(await data.arrayBuffer()));
  page.crops.forEach((c, i) => drawDigit(r, c.box, digitOf(i), 20));
  if (o.cover) fillBox(r, 20, 20, 90, 90, 248);
  return photoJpeg(photographed(r, SIZE, CORNERS, { background: 110, shade: 0.15 }));
}

const call = (who: Session | null, path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { Cookie: who?.cookie ?? "", Origin: base, ...init.headers } });

async function upload(owner: Session, child: string, bytes: Uint8Array, save_ = true) {
  const id = randomUUID();
  const admit = await call(owner, "/api/account/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, child, bytes: bytes.length }) });
  assert.equal(admit.status, 200, await admit.clone().text());
  const put = await call(owner, `/api/account/scans/${id}`, { method: "PUT", body: bytes as BodyInit });
  assert.equal(put.status, 200, await put.clone().text());
  if (save_) assert.equal((await call(owner, `/api/account/scans/${id}`, { method: "POST" })).status, 200);
  return id;
}

const previewOf = async (who: Session | null, id: string, method = "POST") => {
  const r = await call(who, `/api/account/scans/${id}/preview`, { method });
  return { status: r.status, body: await r.json() as { preview?: { status: string; reason?: string; crops?: { part: string; number: number }[]; notSupported?: number[] } } };
};

async function seed() {
  const f = load();
  const owner = await session(f.families[0]);
  const child = f.families[0].child;
  const most = [...f.pages].sort((a, b) => b.crops.length - a.crops.length);
  f.photos.ready = await upload(owner, child, await photoOf(most[0]));
  f.photos.refused = await upload(owner, child, await photoOf(most[1], { cover: true }));
  const qr = await QRCode.toBuffer(`https://unicalearning.com/tutor/p/${f.legacyToken}`, { width: 500, margin: 4 });
  f.photos.legacy = await upload(owner, child, await sharp({ create: { width: 1200, height: 1600, channels: 3, background: "#ffffff" } }).composite([{ input: qr, left: 600, top: 1000 }]).jpeg().toBuffer());
  save(f);
  console.log("Seeded three synthetic photos: ready, refused and legacy.");
}

async function check() {
  const f = load();
  const [ownerF, otherF, adminF] = f.families;
  const [owner, other, adm] = await Promise.all(f.families.map(session));
  const anon = createClient<Database>(URL_, PUB, { auth: { persistSession: false } });
  const checks: string[] = [];
  const pass = (line: string) => { checks.push(line); console.log(`ok - ${line}`); };
  const bucket = admin.storage.from("scan-photos");
  const page = [...f.pages].sort((a, b) => b.crops.length - a.crops.length)[0];

  // 1. Real pipeline: the routes make crops; each crop read through the image route holds its own digit.
  const ready = f.photos.ready;
  const first = await previewOf(owner, ready);
  assert.equal(first.status, 200);
  assert.equal(first.body.preview?.status, "ready", JSON.stringify(first.body));
  assert.deepEqual(first.body.preview!.crops!.map((c) => c.number), page.crops.map((c) => c.number));
  for (const [i, c] of page.crops.entries()) {
    const r = await call(owner, `/api/account/scans/${ready}/preview/crop-${c.number}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control") ?? "", /private, no-store/);
    const crop = await greyRaster(new Uint8Array(await r.arrayBuffer()));
    assert.equal(readDigit(crop, cropCut(c.box), c.box), digitOf(i), `crop ${c.number}`);
  }
  pass(`real page, routes and Storage: ${page.crops.length} crops read back as their own drawn digits; ${first.body.preview!.notSupported!.length} questions not supported`);
  const row = ok(await admin.from("scan_calibrations").select("state,lease_token,printed_revision,result").eq("photo_id", ready).single());
  assert.equal(row.printed_revision, f.revision);
  assert.equal(row.result?.calibration?.revision, f.revision);
  const again = await previewOf(owner, ready);
  assert.equal(again.body.preview?.status, "ready");
  assert.equal(ok(await admin.from("scan_calibrations").select("lease_token").eq("photo_id", ready).single()).lease_token, row.lease_token);
  pass("a repeated POST reuses the stored work under the same lease");

  // 2. Refusal and legacy.
  const refused = await previewOf(owner, f.photos.refused);
  assert.deepEqual(refused.body.preview, { status: "refused", reason: "marks-missing" });
  assert.equal(ok(await bucket.list(`${ownerF.id}/${f.photos.refused}`)).filter((o) => o.name !== "photo.jpg").length, 0);
  assert.equal((await call(owner, `/api/account/scans/${f.photos.refused}/image`)).status, 200);
  pass("a photo with a mark covered is refused: no derived file, and its photo is still served");
  const legacy = await previewOf(owner, f.photos.legacy);
  assert.deepEqual(legacy.body.preview, { status: "unavailable", reason: "no-contract" });
  assert.equal(ok(await bucket.list(`${ownerF.id}/${f.photos.legacy}`)).filter((o) => o.name !== "photo.jpg").length, 0);
  assert.equal((await call(owner, `/api/account/scans/${f.photos.legacy}/image`)).status, 200);
  assert.equal(ok(await admin.from("scan_calibrations").select("photo_id").eq("photo_id", f.photos.legacy)).length, 0);
  pass("a legacy shipped page keeps its photo, with no calibration row and no derived file");

  // 3. Browser Storage access, through the real policy, on objects a server-only probe proves exist.
  const paths = (ok(await bucket.list(`${ownerF.id}/${ready}`)).map((o) => `${ownerF.id}/${ready}/${o.name}`));
  const crop = paths.find((p) => p.includes("-crop-"))!, straight = paths.find((p) => p.endsWith("-straight.jpg"))!;
  assert(crop && straight && paths.some((p) => p.endsWith("/photo.jpg")));
  async function denied(label: string, db: SupabaseClient<Database>) {
    const b = db.storage.from("scan-photos");
    for (const path of [crop, straight, `${ownerF.id}/${ready}/photo.jpg`]) {
      assert(ok(await bucket.download(path)), `${path} exists for the server`);
      const download = await b.download(path);
      assert(download.error && !download.data, `${label}: download`);
      assert(!(await b.createSignedUrl(path, 60)).data?.signedUrl, `${label}: signed URL`);
      assert(!(await b.createSignedUrls([path], 60)).data?.some((x) => x.signedUrl), `${label}: batch signed URLs`);
    }
    assert(!(await b.list(`${ownerF.id}/${ready}`)).data?.length, `${label}: list`);
    assert((await b.upload(`${ownerF.id}/${ready}/${row.lease_token}-crop-901.jpg`, new Uint8Array([1]), { contentType: "image/jpeg" })).error, `${label}: insert`);
    const removed = await b.remove([crop]);
    assert(!removed.data?.length, `${label}: remove`);
    assert(ok(await bucket.download(crop)), `${label}: the crop is still there after the refused remove`);
  }
  for (const [label, db] of [["owner", owner.db], ["admin", adm.db], ["anonymous", anon]] as const) await denied(label, db);
  pass("owner, admin and anonymous: download, signed URL, batch signed URLs, list, insert and remove denied for crop, straightened page and photo, with each object present");

  // 4. The image route both ways.
  for (const who of [owner, adm]) {
    for (const part of [`preview/crop-${page.crops[0].number}`, "preview/straight", "image"]) {
      const r = await call(who, `/api/account/scans/${ready}/${part}`);
      assert.equal(r.status, 200, part);
      assert((await r.arrayBuffer()).byteLength > 500);
    }
  }
  for (const who of [other, null]) {
    for (const part of [`preview/crop-${page.crops[0].number}`, "preview/straight", "image", "preview"]) assert.notEqual((await call(who, `/api/account/scans/${ready}/${part}`)).status, 200, part);
  }
  assert.notEqual((await previewOf(other, ready)).status, 200);
  pass("the image route serves owner and admin, and refuses another family and anonymous for crop, straightened page and preview");

  // 5. Tables and functions.
  assert.equal(ok(await owner.db.from("scan_calibrations").select("photo_id").eq("photo_id", ready)).length, 0);
  assert.equal(ok(await other.db.from("scan_calibrations").select("photo_id").eq("photo_id", ready)).length, 0);
  assert.equal(ok(await adm.db.from("scan_calibrations").select("photo_id").eq("photo_id", ready)).length, 1);
  assert((await owner.db.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: ready, p_token: randomUUID() })).error);
  assert((await owner.db.rpc("finish_scan_calibration", { p_parent: ownerF.id, p_id: ready, p_token: row.lease_token, p_state: "refused", p_result: { reason: "failed" }, p_bytes: 0 })).error);
  assert((await owner.db.from("scan_calibrations").update({ state: "refused" }).eq("photo_id", ready)).error || ok(await admin.from("scan_calibrations").select("state").eq("photo_id", ready).single()).state === "ready");
  pass("job rows: owner and another family read none, admin reads them; browser sessions cannot call begin or finish, or change a row");

  // 6. Names the fence refuses, and the lease.
  // The two pages with the most crops hold the ready and refused photos. One photo per page, so each case takes its own.
  const free = [...f.pages].sort((a, b) => b.crops.length - a.crops.length).slice(2);
  const take = () => free.shift()!;
  const stale = await upload(owner, ownerF.child, await photoOf(take()));
  const t1 = randomUUID(), t2 = randomUUID();
  assert.equal((ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: stale, p_token: t1 })) as { status: string }).status, "started");
  assert.equal((ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: stale, p_token: randomUUID() })) as { status: string }).status, "busy");
  const put = (id: string, name: string) => bucket.upload(`${ownerF.id}/${id}/${name}`, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg" });
  assert.equal((await put(stale, `${t1}-crop-1.jpg`)).error, null);
  for (const name of ["late.jpg", `${t1}-crop-1.png`, `${t2}-crop-1.jpg`, `${t1}-crop-1000.jpg`, `${t1}-other.jpg`, "photo.jpg"]) assert((await put(stale, name)).error, name);
  ok(await admin.from("scan_calibrations").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("photo_id", stale));
  const taken = ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: stale, p_token: t2 })) as { status: string; previous: string };
  assert.deepEqual(taken, { status: "started", previous: t1 });
  assert((await put(stale, `${t1}-crop-2.jpg`)).error, "the old lease writes nothing");
  assert.equal(ok(await admin.rpc("finish_scan_calibration", { p_parent: ownerF.id, p_id: stale, p_token: t1, p_state: "refused", p_result: { reason: "failed" }, p_bytes: 0 })), "stale");
  assert.equal((await put(stale, `${t2}-crop-2.jpg`)).error, null, "positive control: the current lease writes");
  const store = scanCropStore(admin);
  assert.equal(await store.put({ parent: ownerF.id, photo: stale, token: t1, part: "crop-3", bytes: new Uint8Array([255, 216, 255]) }), false, "the store reads the fence's refusal");
  assert.equal(await store.put({ parent: ownerF.id, photo: stale, token: t2, part: "crop-3", bytes: new Uint8Array([255, 216, 255]) }), true, "positive control through the store");
  await assert.rejects(store.put({ parent: ownerF.id, photo: stale, token: t2, part: "crop-3", bytes: new Uint8Array([255, 216, 255]) }), "a duplicate is not a fence refusal");
  assert.equal(ok(await admin.rpc("finish_scan_calibration", { p_parent: ownerF.id, p_id: stale, p_token: t2, p_state: "ready", p_result: { parts: ["crop-9"] }, p_bytes: 10 })), "missing");
  f.photos.stale = stale; f.lease = t2; save(f);
  pass("the fence refuses other names and a lost lease, even with the secret key; a stale finish changes nothing; finish refuses a file that does not exist");

  // 7. Two callers at once, through the routes.
  const both = await upload(owner, ownerF.child, await photoOf(take()));
  const answers = await Promise.all([previewOf(owner, both), previewOf(owner, both)]);
  assert.deepEqual(answers.map((a) => a.body.preview?.status).sort(), ["busy", "ready"]);
  assert.equal(new Set(ok(await bucket.list(`${ownerF.id}/${both}`)).filter((o) => o.name !== "photo.jpg").map((o) => o.name.slice(0, 36))).size, 1);
  pass("two POSTs at once: one works, one waits, and one set of files exists");

  // 8. Deletion: terminal first, objects still present, late writes refused, then repeatable cleanup.
  const del = await upload(owner, ownerF.child, await photoOf(take()));
  const delToken = randomUUID();
  assert.equal((ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: del, p_token: delToken })) as { status: string }).status, "started");
  assert.equal((await put(del, `${delToken}-crop-1.jpg`)).error, null);
  assert.equal(ok(await admin.rpc("change_scan_photo", { p_parent: ownerF.id, p_id: del, p_action: "delete" })), "deleted");
  const delCrop = `${ownerF.id}/${del}/${delToken}-crop-1.jpg`;
  assert(ok(await bucket.download(delCrop)), "the crop's bytes are still in Storage");
  for (const [label, s] of [["owner", owner], ["admin", adm]] as const) {
    const b = s.db.storage.from("scan-photos");
    assert((await b.download(delCrop)).error, label);
    assert(!(await b.createSignedUrl(delCrop, 60)).data?.signedUrl, label);
    assert(!(await b.createSignedUrls([delCrop], 60)).data?.some((x) => x.signedUrl), label);
    assert.equal((await call(s, `/api/account/scans/${del}/preview/crop-1`)).status, 404, label);
    assert.equal((await call(s, `/api/account/scans/${del}/image`)).status, 404, label);
  }
  assert((await put(del, `${delToken}-crop-2.jpg`)).error, "a late crop after deletion");
  assert.equal(ok(await admin.rpc("finish_scan_calibration", { p_parent: ownerF.id, p_id: del, p_token: delToken, p_state: "refused", p_result: { reason: "failed" }, p_bytes: 0 })), "terminal");
  assert.deepEqual(ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: del, p_token: randomUUID() })), { status: "terminal" });
  assert.deepEqual((await previewOf(owner, del)).body.preview, { status: "unavailable", reason: "photo-ended" });
  const cleanup = (id: string) => cleanupScanPhoto(admin, ownerF.id, id);
  assert.equal(await cleanup(del), true);
  assert.equal(ok(await bucket.list(`${ownerF.id}/${del}`)).length, 0, "the photo and every derived file are gone");
  assert.equal(await cleanup(del), true, "repeated cleanup");
  const after = ok(await admin.from("scan_photos").select("state,stored_bytes,terminal_at").eq("id", del).single());
  assert.equal(after.state, "deleted"); assert.equal(after.stored_bytes, 0); assert(after.terminal_at);
  pass("deletion: with the crop's bytes present, every direct call and the routes fail; late crop, finish and retry are refused; repeated cleanup keeps the terminal state");

  // 9. Clock expiry, with no terminal row recorded.
  const exp = await upload(owner, ownerF.child, await photoOf(take()));
  const expToken = randomUUID();
  assert.equal((ok(await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: exp, p_token: expToken })) as { status: string }).status, "started");
  assert.equal((await put(exp, `${expToken}-crop-1.jpg`)).error, null);
  ok(await admin.from("scan_photos").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", exp));
  assert.equal(ok(await admin.from("scan_photos").select("state").eq("id", exp).single()).state, "saved", "no terminal row yet");
  assert((await put(exp, `${expToken}-crop-2.jpg`)).error, "a late crop after the clock passed");
  for (const s of [owner, adm]) assert.equal((await call(s, `/api/account/scans/${exp}/preview/crop-1`)).status, 404);
  assert.equal(ok(await admin.rpc("finish_scan_calibration", { p_parent: ownerF.id, p_id: exp, p_token: expToken, p_state: "refused", p_result: { reason: "failed" }, p_bytes: 0 })), "terminal");
  ok(await admin.rpc("expire_scan_photos"));
  assert.equal(ok(await admin.from("scan_photos").select("state").eq("id", exp).single()).state, "expired");
  assert((await put(exp, `${expToken}-crop-3.jpg`)).error, "still refused after the terminal row");
  assert.equal(await cleanup(exp), true);
  assert.equal(ok(await bucket.list(`${ownerF.id}/${exp}`)).length, 0);
  assert.equal(ok(await admin.from("scan_photos").select("stored_bytes").eq("id", exp).single()).stored_bytes, 0);
  pass("expiry by the clock alone, before any terminal row: late crop and finish refused, routes refuse, with the crop's bytes present; the scheduled expiry function then records it and cleanup removes every file");

  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/hosted-security.json`, `${JSON.stringify({ fixture: "synthetic drawn digits on real Chromium pages", checks, admin: adminF.role, other: otherF.role, proofLimit: "No real handwriting, no real camera, no curled page. Hosted database and Storage, local Next dev server." }, null, 2)}\n`);
}

async function workerClient() {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const r = await fetch("https://api.supabase.com/v1/projects/cdjobwsyzndtltzfpyqa/api-keys?reveal=true", { headers: { Authorization: `Bearer ${token}` } });
  const keys = await r.json() as { name: string; api_key: string }[];
  const key = keys.find((k) => k.name === "retention_worker")?.api_key;
  assert(key, "the retention worker's key");
  return createClient<Database>(URL_, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function deletion() {
  const f = load();
  const [ownerF, , adminF] = f.families;
  const adm = await session(adminF);
  const owner = await session(ownerF);
  const worker = await workerClient();
  const bucket = admin.storage.from("scan-photos");
  const before = ok(await admin.from("scan_calibrations").select("photo_id").eq("parent_id", ownerF.id)).length;
  assert(before >= 1);
  const stored = (await Promise.all(ok(await admin.from("scan_photos").select("id").eq("parent_id", ownerF.id)).map(async (p) => ok(await bucket.list(`${ownerF.id}/${p.id}`)).length))).reduce((a, b) => a + b, 0);
  assert(stored >= 3, `files before deletion: ${stored}`);

  // A live lease, frozen by the deletion request: the same write succeeds before the freeze and is refused after it.
  const open = f.photos.stale, lease = f.lease!;
  ok(await admin.from("scan_calibrations").update({ lease_until: new Date(Date.now() + 300_000).toISOString() }).eq("photo_id", open));
  const write = (n: number) => bucket.upload(`${ownerF.id}/${open}/${lease}-crop-${n}.jpg`, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg" });
  assert.equal((await write(30)).error, null, "positive control: the live lease writes before the freeze");
  const fence = await bucket.upload(`${ownerF.id}/${open}/${randomUUID()}-crop-1.jpg`, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg" });
  assert(fence.error && isFenceRefusal(fence.error.message), fence.error?.message);
  assert.equal(ok(await adm.db.rpc("request_family_deletion", { p: ownerF.id, confirmation: ownerF.email })), "requested");
  const late = await write(31);
  assert(late.error, "a late crop in a frozen family");
  assert(isFenceRefusal(late.error.message), late.error.message);
  assert.equal(await scanCropStore(admin).put({ parent: ownerF.id, photo: open, token: lease, part: "crop-32", bytes: new Uint8Array([255, 216, 255]) }), false, "the store reads the frozen family's refusal");
  assert((await admin.rpc("begin_scan_calibration", { p_parent: ownerF.id, p_id: open, p_token: randomUUID() })).error, "a new job in a frozen family");
  assert.deepEqual(await scanCropStore(admin).begin({ parent: ownerF.id, photo: open, token: randomUUID() }), { status: "terminal" }, "the store reads the frozen family's refusal");
  const result = await runFamilyDeletion(worker, ownerF.id, worker, Date.now() + 45_000);
  assert.equal(result.state, "deleted", JSON.stringify(result));
  assert(result.state === "deleted" && result.images >= stored, JSON.stringify(result));
  assert.equal(ok(await worker.storage.from("scan-photos").list(ownerF.id)).length, 0);
  assert.equal(ok(await worker.from("scan_calibrations").select("photo_id").eq("parent_id", ownerF.id)).length, 0);
  assert.equal(ok(await worker.from("scan_photos").select("id").eq("parent_id", ownerF.id)).length, 0);
  assert((await worker.auth.admin.getUserById(ownerF.id)).error);
  assert.equal((await call(owner, `/api/account/scans/${f.photos.ready}/preview/straight`)).ok, false);
  const out = { credential: "Dedicated retention_worker key", result, beforeFiles: stored, checks: ["Freeze refuses a late crop and a new job", "Worker removes the photos, straightened pages and crops before Auth", "Calibration and photo rows cascade", "Auth user absent", "Family scan folder empty", "Old image route refused"] };
  writeFileSync(`${evidence}/hosted-family-deletion.json`, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out));
}

async function cleanup() {
  const f = load();
  const worker = await workerClient();
  const adminF = f.families.find((x) => x.role === "admin")!;
  const adm = await session(adminF);
  const left = ok(await admin.from("parents").select("id,email").contains("source", { qa: "455" }));
  for (const a of left) {
    assert(a.email?.startsWith("scan455-") && a.email.endsWith("@example.test"));
    if (a.id === adminF.id) continue;
    assert.equal(ok(await adm.db.rpc("request_family_deletion", { p: a.id, confirmation: a.email })), "requested");
    const result = await runFamilyDeletion(worker, a.id, worker, Date.now() + 45_000);
    assert.equal(result.state, "deleted");
  }
  ok(await admin.from("admin_users").delete().eq("user_id", adminF.id));
  ok(await admin.from("parents").delete().eq("id", adminF.id));
  ok(await admin.auth.admin.deleteUser(adminF.id));
  assert.equal(ok(await admin.from("parents").select("id").contains("source", { qa: "455" })).length, 0);
  console.log("All synthetic families and the temporary admin grant removed.");
}

const phases: Record<string, () => Promise<void>> = { prepare, seed, check, deletion, cleanup };
await phases[process.argv[2]]();
process.exit(0);
