import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ start: "started", identify: "identified", normalize: true, uploads: 0, calls: [] as string[] }));
const ai = vi.hoisted(() => vi.fn(() => { throw new Error("S1 must not dispatch AI"); }));
vi.mock("@/lib/ai-client", () => ({ aiClient: ai }));
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
  scanSession: async () => ({ parent: "family", admin: {
    from: () => ({ select: () => ({ single: async () => ({ data: { input_bytes: 100, output_bytes: 100, decoded_pixels: 100 } }) }) }),
    rpc: async (name: string) => {
      f.calls.push(name);
      return { data: name === "start_scan_photo" ? f.start : name === "identify_scan_photo" ? f.identify : "pending" };
    },
    storage: { from: () => ({ upload: async () => { f.uploads++; return {}; } }) },
  } }),
}));
import { PUT } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const put = () => PUT(new Request(`https://unicalearning.com/api/account/scans/${id}`, { method: "PUT", headers: { Origin: "https://unicalearning.com" }, body: new Uint8Array([1]) }), { params: Promise.resolve({ id }) });
beforeEach(() => { f.start = "started"; f.identify = "identified"; f.normalize = true; f.uploads = 0; f.calls = []; ai.mockClear(); vi.stubEnv("OPENROUTER_API_KEY", "synthetic-configured-key"); });
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
