import { setProductObserver } from "@/lib/product-monitoring";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ start: "started", identify: "identified" as string | string[], normalize: true, uploads: 0, calls: [] as string[], spread: false, unsplit: false, admit: "reserved" as string | string[], tokens: [] as string[], saved: [] as string[], refuse: "qr", storageFails: 0, recover: "pending", filed: "child", closed: [] as string[],
  // F5: the page's photo a new photo of it may replace, and that photo's stored check; the photos deleted.
  held: null as null | { id: string; printed_revision: string; sent_at: string | null }, keep: false, calibration: null as null | { state: string; printed_revision: string }, deleted: [] as string[],
  // The held photo's marking job (scan edge sweep, 2026-11-14).
  job: null as null | { state: string; blocked_reason: string | null }, swap: "pending" as string, cleaned: [] as string[] }));
const ai = vi.hoisted(() => vi.fn(() => { throw new Error("S1 must not dispatch AI"); }));
vi.mock("@/lib/ai-client", () => ({ aiClient: ai }));
// #915: the page check starts after the answer, for a family that gets checks.
const later = vi.hoisted(() => ({ tasks: [] as (() => Promise<void>)[], checks: true, crops: [] as string[], fail: false, preview: "ready", photoChecks: [] as string[] }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => { later.tasks.push(task); } }));
vi.mock("@/lib/scan-marking-access", () => ({ scanChecksAccess: async () => later.checks }));
vi.mock("@/lib/scan-crops-store", () => ({ scanCropStore: () => ({}) }));
vi.mock("@/lib/scan-photo-check-start", () => ({ startPhotoCheck: async (_a: unknown, _p: string, photo: string) => { later.photoChecks.push(photo); } }));
vi.mock("@/lib/scan-crops", () => ({ readScanPreview: async () => ({ status: later.preview }), runScanCrops: async (_s: unknown, ref: { photo: string }) => { if (later.fail) throw new Error("storage"); later.crops.push(ref.photo); return { status: "ready" }; } }));
vi.mock("@/lib/scan-photo-image", () => ({
  readScanBody: async () => new Uint8Array([1]),
  normalizeScanPhoto: async () => {
    if (!f.normalize) throw new Error(f.refuse);
    const one = (token: string) => ({ token, bytes: new Uint8Array([1]), width: 10, height: 20 });
    return { ...one("qrTokenLeft000000000"), spread: f.spread ? [one("qrTokenLeft000000000"), one("qrTokenRight00000000")] : null,
      alternateToken: f.unsplit ? "qrTokenRight00000000" : undefined };
  },
}));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanPath: () => "family/photo/photo.jpg", SCAN_BUCKET: "scan-photos",
  scanView: async () => ({ id: "photo", child_id: "child", state: "pending" }),
  cleanupScanPhoto: async (_a: unknown, _p: string, photo: string) => { f.cleaned.push(photo); return true; },
  scanSession: async () => ({ parent: "family", photoOpen: async () => true, childOpen: async (child: string) => !f.closed.includes(child), admin: {
    from: (table: string) => ({ select: (columns = "") => {
      const chain = { single: async () => ({ data: { input_bytes: 100, output_bytes: 100, decoded_pixels: 100 } }), eq: () => chain,
        maybeSingle: async () => ({ data: table === "workbook_pages" ? { id: "page", page_number: 24 } : table === "scan_photos" ? columns.includes("sent_at") ? f.held : { child_id: f.filed } : table === "scan_calibrations" ? f.calibration : table === "scan_marking_jobs" ? f.job : null, error: null }) };
      return chain;
    } }),
    rpc: async (name: string, args: { p_token?: string; p_id?: string; p_action?: string }) => {
      f.calls.push(name);
      if (name === "identify_scan_photo") {
        f.tokens.push(args.p_token!);
        const answer = Array.isArray(f.identify) ? f.identify.shift() ?? "identified" : f.identify;
        return { data: answer };
      }
      if (name === "change_scan_photo" && args.p_action === "save") f.saved.push(args.p_id!);
      if (name === "change_scan_photo" && args.p_action === "delete") { f.deleted.push(args.p_id!); return { data: "deleted" }; }
      // The swap rechecks under the family lock; `keep` is its answer for a photo sent or marked meanwhile.
      if (name === "replace_ready_scan_photo") { const old = (args as { p_old?: string }).p_old!; if (f.keep) return { data: "kept" }; f.deleted.push(old); return { data: "deleted" }; }
      if (name === "admit_scan_photo_v2") return { data: Array.isArray(f.admit) ? f.admit.shift() ?? "reserved" : f.admit };
      if (name === "recover_scan_photo") return { data: f.recover };
      if (name === "replace_unfinished_scan_photo") return { data: f.swap };
      return { data: name === "start_scan_photo" ? f.start : name === "change_scan_photo" ? "saved" : "pending" };
    },
    storage: { from: () => ({ upload: async () => { f.uploads++; return f.uploads > 1 && f.storageFails-- > 0 ? { error: new Error("lost") } : {}; } }) },
  } }),
}));
import { POST, PUT } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const put = () => PUT(new Request(`https://unicalearning.com/api/account/scans/${id}`, { method: "PUT", headers: { Origin: "https://unicalearning.com" }, body: new Uint8Array([1]) }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); setProductObserver(null); later.tasks = []; later.checks = true; later.crops = []; later.fail = false; later.preview = "ready"; later.photoChecks = []; f.start = "started"; f.identify = "identified"; f.normalize = true; f.uploads = 0; f.calls = []; f.spread = false; f.unsplit = false; f.admit = "reserved"; f.tokens = []; f.saved = []; f.refuse = "qr"; f.storageFails = 0; f.recover = "pending"; f.filed = "child"; f.closed = []; f.held = null; f.calibration = null; f.deleted = []; f.job = null; f.swap = "pending"; f.cleaned = []; f.keep = false; ai.mockClear(); vi.stubEnv("OPENROUTER_API_KEY", "synthetic-configured-key"); });
afterEach(() => { setProductObserver(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("stores one normalized photo with zero AI dispatches when a key is configured", async () => {
  expect((await put()).status).toBe(200); expect(f.uploads).toBe(1);
  expect(f.calls).toEqual(["start_scan_photo", "identify_scan_photo", "finish_scan_photo"]);
  expect(ai).not.toHaveBeenCalled();
});
it("does not create an object for a refused family admission, unreadable QR or wrong page", async () => {
  f.start = "busy"; expect((await put()).status).toBe(409); expect(f.uploads).toBe(0);
  f.start = "started"; f.normalize = false; expect((await put()).status).toBe(422); expect(f.uploads).toBe(0);
  f.normalize = true; f.identify = "page"; expect((await put()).status).toBe(422); expect(f.uploads).toBe(0);
  expect(ai).not.toHaveBeenCalled();
});
it("returns the original pending photo on a repeated PUT without another object", async () => {
  f.start = "pending"; expect((await put()).status).toBe(200); expect(f.uploads).toBe(0);
  expect(f.calls).toEqual(["start_scan_photo"]);
});
it("starts the page check right after the photo is stored, only for a family that gets checks (#915)", async () => {
  expect((await put()).status).toBe(200);
  expect(later.tasks).toHaveLength(1);
  await later.tasks[0](); expect(later.crops).toEqual([id]);
  later.tasks = []; later.crops = []; later.checks = false;
  expect((await put()).status).toBe(200); await later.tasks[0](); expect(later.crops).toEqual([]);
  // A failed background check leaves the photo stored: the page asks again.
  later.tasks = []; later.checks = true; later.fail = true;
  expect((await put()).status).toBe(200); await expect(later.tasks[0]()).resolves.toBeUndefined();
  // A refused photo starts no check.
  later.tasks = []; f.identify = "page"; expect((await put()).status).toBe(422); expect(later.tasks).toHaveLength(0);
  expect(ai).not.toHaveBeenCalled();
});
it("starts the photo check when a photo is saved after its page check already finished (#915 review)", async () => {
  const save = () => POST(new Request(`https://unicalearning.com/api/account/scans/${id}`, { method: "POST", headers: { Origin: "https://unicalearning.com" } }), { params: Promise.resolve({ id }) });
  // The upload-time check finished first: saving starts the photo check, which the page has no reason to ask for.
  expect((await save()).status).toBe(200);
  expect(later.tasks).toHaveLength(1); await later.tasks[0](); expect(later.photoChecks).toEqual([id]);
  // Not ready yet: the page's own preview ask starts it later.
  later.tasks = []; later.photoChecks = []; later.preview = "busy";
  expect((await save()).status).toBe(200); await later.tasks[0](); expect(later.photoChecks).toEqual([]);
  // No checks for this family: nothing starts.
  later.tasks = []; later.preview = "ready"; later.checks = false;
  expect((await save()).status).toBe(200); await later.tasks[0](); expect(later.photoChecks).toEqual([]);
});
it("stores the two pages of an open book as two photos, each bound by its own code (#915)", async () => {
  f.spread = true;
  const answer = await (await put()).json();
  // This photo takes the left page; the right page becomes a new photo, admitted, bound, stored and saved.
  expect(f.tokens).toEqual(["qrTokenLeft000000000", "qrTokenRight00000000"]);
  expect(f.uploads).toBe(2);
  expect(f.calls.filter((c) => c === "admit_scan_photo_v2")).toHaveLength(1);
  expect(answer.spread).toMatchObject({ state: "saved" });
  expect(f.saved).toEqual([answer.spread.id]);
  expect(answer.spread.id).not.toBe(id);
});
it.each([false, true])("stores one unsplit photo with an alternate code when the first is a duplicate (%s)", async (duplicate) => {
  f.unsplit = true;
  if (duplicate) f.identify = ["duplicate", "identified"];
  const response = await put();
  expect(response.status).toBe(200);
  expect(f.tokens).toEqual(duplicate ? ["qrTokenLeft000000000", "qrTokenRight00000000"] : ["qrTokenLeft000000000"]);
  expect(f.uploads).toBe(1);
  expect((await response.json()).spread).toBeUndefined();
});
it("keeps the left page when the right page cannot be admitted, and answers why (#915)", async () => {
  f.spread = true; f.admit = "frequency";
  const answer = await (await put()).json();
  expect(f.uploads).toBe(1);
  expect(answer.photo).toMatchObject({ id: "photo" });
  expect(answer.spread).toMatchObject({ state: "frequency", page: 24 });
});
it("asks again for a slot when the phone's own uploads fill them, instead of dropping the right page (#965 review)", async () => {
  f.spread = true; f.admit = ["busy", "busy", "reserved"];
  const answer = await (await put()).json();
  expect(f.calls.filter((c) => c === "admit_scan_photo_v2")).toHaveLength(3);
  expect(answer.spread).toMatchObject({ state: "saved" });
  expect(answer.spread.page).toBeUndefined();
});
it("names a right page that stays busy, so the parent can photograph it alone (#965 review)", async () => {
  f.spread = true; f.admit = ["busy", "busy", "busy", "busy", "busy"];
  const answer = await (await put()).json();
  expect(f.calls.filter((c) => c === "admit_scan_photo_v2")).toHaveLength(4);
  expect(answer.spread).toMatchObject({ state: "busy", page: 24 });
});
it("reconciles a lost Storage answer for the right page: stored after all, it is saved; not stored, it is left to expire (#965 review)", async () => {
  f.spread = true; f.storageFails = 1; f.recover = "pending";
  let answer = await (await put()).json();
  expect(f.calls).toContain("recover_scan_photo");
  expect(answer.spread).toMatchObject({ state: "saved" });
  f.calls = []; f.saved = []; f.uploads = 0; f.storageFails = 1; f.recover = "waiting";
  answer = await (await put()).json();
  expect(answer.spread).toMatchObject({ state: "uncertain", page: 24 });
  expect(f.saved).toEqual([]);
});
it("answers a spread with pages that are not flat with its own reason (#965 review)", async () => {
  f.normalize = false; f.refuse = "flat";
  const response = await put();
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "flat" });
});
it("lets the right page take this photo when the left page already has one, and adds no other photo (#915)", async () => {
  f.spread = true; f.identify = ["duplicate", "identified"];
  const answer = await (await put()).json();
  expect(f.tokens).toEqual(["qrTokenLeft000000000", "qrTokenRight00000000"]);
  expect(f.uploads).toBe(1);
  expect(f.calls).not.toContain("admit_scan_photo_v2");
  expect(answer.spread).toBeUndefined();
});
it("refuses a spread whose pages both refuse, with the first page's reason (#915)", async () => {
  f.spread = true; f.identify = ["duplicate", "duplicate"];
  expect((await put()).status).toBe(422); expect(f.uploads).toBe(0);
});

it("files a sibling's page with that child only when the sibling's plan opens scanning (#915)", async () => {
  f.filed = "sibling"; expect((await put()).status).toBe(200); expect(f.uploads).toBe(1);
  f.uploads = 0; f.calls = []; f.closed = ["sibling"];
  const refused = await put();
  expect(refused.status).toBe(422); expect(await refused.json()).toEqual({ error: "page" }); expect(f.uploads).toBe(0);
  expect(f.calls).toContain("change_scan_photo");
});

it("a new photo of a page whose photo the check refused replaces it, however it was taken (F5)", async () => {
  f.identify = ["duplicate", "identified"];
  f.held = { id: "old", printed_revision: "r1", sent_at: null }; f.calibration = { state: "refused", printed_revision: "r1" };
  expect((await put()).status).toBe(200);
  expect(f.deleted).toEqual(["old"]);
  expect(f.calls.filter((c) => c === "identify_scan_photo")).toHaveLength(2);
  expect(f.uploads).toBe(1);
});

it("keeps a page's photo that is ready, still being checked, of another printing or sent: the new photo is a duplicate (F5)", async () => {
  for (const [held, calibration] of [
    [{ id: "old", printed_revision: "r1", sent_at: null }, { state: "ready", printed_revision: "r1" }],
    [{ id: "old", printed_revision: "r1", sent_at: null }, { state: "running", printed_revision: "r1" }],
    [{ id: "old", printed_revision: "r1", sent_at: null }, null],
    [{ id: "old", printed_revision: "r1", sent_at: null }, { state: "refused", printed_revision: "r0" }],
    [{ id: "old", printed_revision: "r1", sent_at: "2026-11-05T12:00:00Z" }, { state: "refused", printed_revision: "r1" }],
  ] as const) {
    f.identify = "duplicate"; f.held = { ...held }; f.calibration = calibration && { ...calibration }; f.uploads = 0;
    const answer = await put();
    // The answer names the page (#4); only the ready photo not sent may be replaced, and only by the parent's choice.
    expect(answer.status).toBe(422); expect(await answer.json()).toMatchObject({ error: "duplicate", page: 24 });
    expect(f.deleted).toEqual([]); expect(f.uploads).toBe(0);
  }
});

it("a new photo of a sent page whose marking found every answer blank replaces it once stored (scan edge sweep, 2026-11-14)", async () => {
  f.identify = "duplicate";
  f.held = { id: "old", printed_revision: "r1", sent_at: "2026-11-05T12:00:00Z" }; f.job = { state: "finished", blocked_reason: "unfinished" };
  expect((await put()).status).toBe(200);
  // Stored first, then swapped in one transaction: never deleted before.
  expect(f.calls).toEqual(["start_scan_photo", "identify_scan_photo", "replace_unfinished_scan_photo"]);
  expect(f.uploads).toBe(1); expect(f.deleted).toEqual([]); expect(f.cleaned).toEqual(["old"]);
});

it("an unfinished page keeps its photo when the new upload is lost or the swap refuses", async () => {
  f.identify = "duplicate"; f.held = { id: "old", printed_revision: "r1", sent_at: "2026-11-05T12:00:00Z" }; f.job = { state: "finished", blocked_reason: "unfinished" };
  f.swap = "duplicate";
  expect((await put()).status).toBe(422);
  expect(f.deleted).toEqual([]); expect(f.cleaned).not.toContain("old");
  f.calls = []; f.cleaned = []; f.swap = "pending"; f.uploads = 0; f.storageFails = 1;
  f.uploads = 1; // the fake's second upload fails
  expect((await put()).status).toBe(503);
  expect(f.calls).not.toContain("replace_unfinished_scan_photo"); expect(f.cleaned).toEqual([]);
});

it("keeps a sent page that is marked, being marked or could not be marked: the new photo is a duplicate", async () => {
  for (const job of [null, { state: "finished", blocked_reason: null }, { state: "finished", blocked_reason: "attempts" }, { state: "queued", blocked_reason: "unfinished" }, { state: "running", blocked_reason: null }]) {
    f.identify = "duplicate"; f.held = { id: "old", printed_revision: "r1", sent_at: "2026-11-05T12:00:00Z" }; f.job = job; f.uploads = 0;
    const answer = await put();
    expect(answer.status).toBe(422); expect(f.deleted).toEqual([]); expect(f.uploads).toBe(0);
    expect(f.calls).not.toContain("replace_unfinished_scan_photo");
  }
});

// Scan edge sweep #4: a duplicate names its page, and a ready photo not sent may be replaced by the parent's choice.
const putReplacing = (replace: string) => PUT(new Request(`https://unicalearning.com/api/account/scans/${id}?replace=${replace}`, { method: "PUT", headers: { Origin: "https://unicalearning.com" }, body: new Uint8Array([1]) }), { params: Promise.resolve({ id }) });
it("names the page of a duplicate, and the photo it may replace only when that one is ready and not sent (#4)", async () => {
  f.identify = "duplicate"; f.held = { id: "old", printed_revision: "r1", sent_at: null }; f.calibration = { state: "ready", printed_revision: "r1" };
  let r = await put();
  expect(r.status).toBe(422); expect(await r.json()).toEqual({ error: "duplicate", page: 24, replaceable: "old" });
  // A plain new photo never deletes a ready photo.
  expect(f.deleted).toEqual([]);
  f.held = { id: "old", printed_revision: "r1", sent_at: "2026-11-14T10:00:00Z" };
  r = await put();
  expect(await r.json()).toEqual({ error: "duplicate", page: 24 });
});
it("replaces the page's ready photo, not sent, only when the parent chose this photo instead of it (#4)", async () => {
  f.identify = ["duplicate", "identified"]; f.held = { id: "old", printed_revision: "r1", sent_at: null }; f.calibration = { state: "ready", printed_revision: "r1" };
  expect((await putReplacing("00000000-0000-4000-8000-0000000000aa")).status).toBe(422);
  expect(f.deleted).toEqual([]);
  f.identify = ["duplicate", "identified"]; f.held = { id: "00000000-0000-4000-8000-0000000000aa", printed_revision: "r1", sent_at: null };
  expect((await putReplacing("00000000-0000-4000-8000-0000000000aa")).status).toBe(200);
  expect(f.deleted).toEqual(["00000000-0000-4000-8000-0000000000aa"]);
  // A sent photo is never replaced.
  f.deleted = []; f.identify = ["duplicate", "identified"]; f.held = { id: "00000000-0000-4000-8000-0000000000aa", printed_revision: "r1", sent_at: "2026-11-14T10:00:00Z" };
  expect((await putReplacing("00000000-0000-4000-8000-0000000000aa")).status).toBe(422);
  expect(f.deleted).toEqual([]);
});

it("keeps the old photo when the locked swap finds it sent or in marking meanwhile, for a retake and for Use this new photo instead (review of #981)", async () => {
  f.keep = true;
  f.identify = ["duplicate", "identified"]; f.held = { id: "old", printed_revision: "r1", sent_at: null }; f.calibration = { state: "refused", printed_revision: "r1" };
  expect((await put()).status).toBe(422);
  f.identify = ["duplicate", "identified"]; f.held = { id: "00000000-0000-4000-8000-0000000000aa", printed_revision: "r1", sent_at: null }; f.calibration = { state: "ready", printed_revision: "r1" };
  expect((await putReplacing("00000000-0000-4000-8000-0000000000aa")).status).toBe(422);
  expect(f.deleted).toEqual([]);
  expect(f.calls.filter((c) => c === "replace_ready_scan_photo")).toHaveLength(2);
});

it("emits an upload only after committed finish, and no new upload on an already stored retry", async () => {
  const observer = vi.fn(); setProductObserver(observer);
  expect((await put()).status).toBe(200);
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.upload_committed", attributes: { photoId: id, count: 1 } });
  f.start = "pending";
  expect((await put()).status).toBe(200);
  expect(observer).toHaveBeenCalledOnce();
});
it("reports swallowed background crop failure while the upload stays committed", async () => {
  const observer = vi.fn(); setProductObserver(observer); later.fail = true;
  expect((await put()).status).toBe(200);
  await later.tasks[0]();
  expect(observer).toHaveBeenCalledWith({ code: "scan.check_failed", attributes: { photoId: id } });
  expect(observer.mock.calls.filter(([e]) => e.code === "scan.upload_committed")).toHaveLength(1);
});
