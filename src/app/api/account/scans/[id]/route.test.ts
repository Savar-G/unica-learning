import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ start: "started", identify: "identified", normalize: true, uploads: 0, calls: [] as string[] }));
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
    if (!f.normalize) throw new Error("qr");
    return { token: "qrToken0000000000000", bytes: new Uint8Array([1]), width: 10, height: 20 };
  },
}));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanPath: () => "family/photo/photo.jpg", SCAN_BUCKET: "scan-photos",
  scanView: async () => ({ id: "photo", state: "pending" }),
  cleanupScanPhoto: async () => true,
  scanSession: async () => ({ parent: "family", photoOpen: async () => true, admin: {
    from: () => ({ select: () => ({ single: async () => ({ data: { input_bytes: 100, output_bytes: 100, decoded_pixels: 100 } }) }) }),
    rpc: async (name: string) => {
      f.calls.push(name);
      return { data: name === "start_scan_photo" ? f.start : name === "identify_scan_photo" ? f.identify : name === "change_scan_photo" ? "saved" : "pending" };
    },
    storage: { from: () => ({ upload: async () => { f.uploads++; return {}; } }) },
  } }),
}));
import { POST, PUT } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const put = () => PUT(new Request(`https://unicalearning.com/api/account/scans/${id}`, { method: "PUT", headers: { Origin: "https://unicalearning.com" }, body: new Uint8Array([1]) }), { params: Promise.resolve({ id }) });
beforeEach(() => { later.tasks = []; later.checks = true; later.crops = []; later.fail = false; later.preview = "ready"; later.photoChecks = []; f.start = "started"; f.identify = "identified"; f.normalize = true; f.uploads = 0; f.calls = []; ai.mockClear(); vi.stubEnv("OPENROUTER_API_KEY", "synthetic-configured-key"); });
afterEach(() => vi.unstubAllEnvs());
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
