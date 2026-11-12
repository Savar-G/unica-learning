import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const ID = "00000000-0000-4000-8000-000000000001";
const LEASE = "00000000-0000-4000-8000-000000000002";
const f = vi.hoisted(() => ({
  marked: true, photo: true, downloads: [] as string[], calibration: null as null | { state: string; lease_token: string; result: { parts: string[]; sheetCheck?: number } | null },
  run: 0, read: 0, signedOutDuringRead: false, active: true,
  photoChild: null as string | null, plan: { open: true, reason: "open" } as { open: boolean; reason: string }, asked: [] as unknown[],
}));
const ai = vi.hoisted(() => vi.fn(() => { throw new Error("S2b must not dispatch AI"); }));
vi.mock("@/lib/ai-client", () => ({ aiClient: ai }));
vi.mock("@/lib/scan-pages-access", () => ({ markedFamily: async () => f.marked }));
// The real admission rule, with the plan gate answered by the test (the dashboard's gate is not on main yet).
vi.mock("@/lib/scan-marking-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-marking-access")>();
  const gate = async (input: { parentId: string; childId: string }) => { f.asked.push(input); return f.plan as never; };
  return { ...actual, scanChecksAccess: (...args: Parameters<typeof actual.scanChecksAccess>) => actual.scanChecksAccess(args[0], args[1], args[2], args[3], gate) };
});
vi.mock("@/lib/scan-crops-store", () => ({ scanCropStore: () => ({}) }));
vi.mock("@/lib/scan-crops", async (original) => ({
  ...await original<typeof import("@/lib/scan-crops")>(),
  runScanCrops: async () => { f.run++; return { status: "busy" }; },
  readScanPreview: async () => { f.read++; return { status: "not-started" }; },
}));
vi.mock("@/lib/scan-photo-server", () => ({
  SCAN_HEADERS: { "Cache-Control": "private, no-store, max-age=0" }, SCAN_BUCKET: "scan-photos",
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => {
    const row = () => (f.photo ? { id: ID, parent_id: "family", state: "saved", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() } : null);
    const one = (data: unknown) => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }), maybeSingle: async () => ({ data }) }) });
    return {
      parent: "family", active: async () => f.active,
      db: { from: () => ({ select: () => one(row()) }), auth: { getUser: async () => ({ data: { user: { id: "family" } } }) } },
      admin: {
        from: (table: string) => ({ select: () => one(table === "scan_calibrations" ? f.calibration : table === "scan_photos" ? (f.photoChild ? { child_id: f.photoChild } : null) : { deletion_requested_at: null }) }),
        storage: { from: () => ({ download: async (path: string) => { f.downloads.push(path); if (f.signedOutDuringRead) f.active = false; return { data: new Blob(["crop bytes"], { type: "image/jpeg" }) }; } }) },
      },
    };
  },
}));
import { GET, POST } from "./route";
import { GET as PART } from "./[part]/route";

const url = `https://unicalearning.com/api/account/scans/${ID}/preview`;
const params = Promise.resolve({ id: ID });
const part = (name: string) => PART(new Request(`${url}/${name}`), { params: Promise.resolve({ id: ID, part: name }) });
const post = (origin = "https://unicalearning.com") => POST(new Request(url, { method: "POST", headers: { Origin: origin } }), { params });

beforeEach(() => {
  Object.assign(f, { photoChild: null, plan: { open: true, reason: "open" }, asked: [], marked: true, photo: true, downloads: [], run: 0, read: 0, signedOutDuringRead: false, active: true, calibration: { state: "ready", lease_token: LEASE, result: { parts: ["straight", "crop-3"], sheetCheck: 1 } } });
  ai.mockClear();
});

describe("the preview route", () => {
  it("is for test families and admins only, whatever the Scan pages switch says", async () => {
    // Disproved if an ordinary family reaches the job or a file when SCAN_PAGES_ENABLED is on.
    vi.stubEnv("SCAN_PAGES_ENABLED", "on");
    f.marked = false;
    expect((await GET(new Request(url), { params })).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect((await part("crop-3")).status).toBe(404);
    expect([f.run, f.read, f.downloads.length]).toEqual([0, 0, 0]);
    vi.unstubAllEnvs();
  });

  it("refuses another family's photo: RLS gives no row, so nothing runs", async () => {
    f.photo = false;
    expect((await GET(new Request(url), { params })).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect((await part("crop-3")).status).toBe(404);
    expect([f.run, f.read, f.downloads.length]).toEqual([0, 0, 0]);
  });

  it("refuses a POST from another origin before it starts anything", async () => {
    expect((await post("https://example.com")).status).toBe(403);
    expect(f.run).toBe(0);
  });

  it("runs the job for a marked family, with no AI dispatch", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-configured-key");
    expect(await (await post()).json()).toEqual({ preview: { status: "busy" }, photoCheck: null });
    expect(await (await GET(new Request(url), { params })).json()).toEqual({ preview: { status: "not-started" }, photoCheck: null });
    expect(ai).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("a crop's image route", () => {
  it("serves a stored part privately, with the path from the stored lease", async () => {
    const response = await part("crop-3");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(await response.text()).toBe("crop bytes");
    expect(f.downloads).toEqual([`family/${ID}/${LEASE}-crop-3.jpg`]);
  });

  it("reads no Storage for a part the calibration does not hold, a malformed name, or a running calibration", async () => {
    // Disproved if a browser can choose a path. Each name here must stop before Storage.
    for (const name of ["crop-9", "photo", "photo.jpg", "../photo.jpg", `${LEASE}-crop-3`, "crop-3.jpg"]) expect((await part(name)).status, name).toBe(404);
    f.calibration = { state: "running", lease_token: LEASE, result: null };
    expect((await part("crop-3")).status).toBe(404);
    f.calibration = null;
    expect((await part("straight")).status).toBe(404);
    expect(f.downloads).toEqual([]);
  });

  it("serves no part of a ready result made before the sheet check (#456)", async () => {
    // Disproved if crops a photo had before the sheet check, which may hold another sheet's answers, can still be read.
    f.calibration = { state: "ready", lease_token: LEASE, result: { parts: ["straight", "crop-3"] } };
    expect((await part("crop-3")).status).toBe(404);
    f.calibration = { state: "ready", lease_token: LEASE, result: { parts: ["straight", "crop-3"], sheetCheck: 0 } };
    expect((await part("straight")).status).toBe(404);
    expect(f.downloads).toEqual([]);
  });

  it("delivers nothing when the session ends during the Storage read", async () => {
    f.signedOutDuringRead = true;
    expect((await part("crop-3")).status).toBe(404);
    expect(f.downloads).toHaveLength(1);
  });

  it("delivers nothing for a photo that has ended, before Storage", async () => {
    f.photo = false;
    expect((await part("straight")).status).toBe(404);
    expect(f.downloads).toEqual([]);
  });
});

describe("the preview route in families mode", () => {
  const CHILD = "22222222-2222-4222-8222-222222222222";
  beforeEach(() => { f.marked = false; f.photoChild = CHILD; vi.stubEnv("SCAN_MARKING_ENABLED", "families"); });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["open", "ending_until_end"])("checks a real family's photo while the child's plan is %s", async (reason) => {
    f.plan = { open: true, reason };
    expect((await GET(new Request(url), { params })).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await part("crop-3")).status).toBe(200);
    expect([f.run, f.read]).toEqual([1, 1]);
    expect(f.asked).toContainEqual({ parentId: "family", childId: CHILD });
  });

  it.each(["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"])("runs no check when the plan answer is %s", async (reason) => {
    f.plan = { open: false, reason };
    expect((await GET(new Request(url), { params })).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect((await part("crop-3")).status).toBe(404);
    expect([f.run, f.read, f.downloads.length]).toEqual([0, 0, 0]);
  });

  it("runs no check for a photo that is not this family's, without asking the plan gate", async () => {
    f.photoChild = null;
    expect((await post()).status).toBe(404);
    expect((await part("crop-3")).status).toBe(404);
    expect([f.run, f.downloads.length, f.asked.length]).toEqual([0, 0, 0]);
  });

  it.each(["test-only", "off"])("with switch %s a running plan does not open the checks", async (flag) => {
    vi.stubEnv("SCAN_MARKING_ENABLED", flag);
    expect((await post()).status).toBe(404);
    expect(f.asked).toEqual([]);
    f.marked = true;
    expect((await post()).status).toBe(200);
  });
});
