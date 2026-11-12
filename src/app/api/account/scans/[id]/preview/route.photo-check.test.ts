import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// The preview route and the photo check (#855): a ready page claims the check before it answers (so the answer says
// "pending") and runs it after the answer; GET returns the stored state; nothing starts for a page that is not ready.
const ID = "00000000-0000-4000-8000-000000000001";
const f = vi.hoisted(() => ({
  status: "ready" as string, client: true, claimed: [] as string[], ran: 0, afters: [] as (() => unknown)[],
  stored: null as unknown, mem: null as null | import("@/lib/scan-photo-check-memory").MemoryPhoto,
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { f.afters.push(fn); } }));
vi.mock("@/lib/scan-marking-access", () => ({ scanChecksAccess: async () => true }));
vi.mock("@/lib/scan-crops-store", () => ({ scanCropStore: () => ({}) }));
const READY = { status: "ready", straight: { part: "straight", width: 10, height: 10 }, crops: [], notSupported: [] };
vi.mock("@/lib/scan-crops", async (original) => ({
  ...await original<typeof import("@/lib/scan-crops")>(),
  runScanCrops: async () => (f.status === "ready" ? READY : { status: f.status }),
  readScanPreview: async () => (f.status === "ready" ? READY : { status: f.status }),
}));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => ({
    parent: "family", admin: {},
    db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { parent_id: "family" } }) }) }) }) },
  }),
}));
vi.mock("@/lib/scan-photo-check-store", async () => {
  const { memoryPhotoCheckStore } = await import("@/lib/scan-photo-check-memory");
  const { fakeDecisionClient, noul } = await import("@/lib/decision-client-fake");
  const { photoCheckView } = await import("@/lib/scan-photo-check");
  const sharp = (await import("sharp")).default;
  const mem = memoryPhotoCheckStore({ eligible: ["family"] });
  const straight = new Uint8Array(await sharp({ create: { width: 600, height: 800, channels: 3, background: "#fff" } }).jpeg().toBuffer());
  return {
    photoCheckStore: () => {
      if (!mem.photos.has(ID)) mem.photos.set(ID, { parent: "family", state: "saved", sent: false, check: null, straight });
      f.mem = mem.photos.get(ID)!;
      return { ...mem.store, claim: async (o: { parent: string; photo: string; token: string }) => { f.claimed.push(o.token); return mem.store.claim(o); } };
    },
    photoCheckClient: () => (f.client ? fakeDecisionClient({ answer: () => { f.ran++; return { blurry: noul(0.9) }; } }) : null),
    readPhotoCheckView: async () => photoCheckView(mem.photos.get(ID)?.check ?? null),
    reset: () => mem.photos.clear(),
  };
});
import { GET, POST } from "./route";
import * as checkStore from "@/lib/scan-photo-check-store";

const url = `https://unicalearning.com/api/account/scans/${ID}/preview`;
const params = Promise.resolve({ id: ID });
const post = () => POST(new Request(url, { method: "POST", headers: { Origin: "https://unicalearning.com" } }), { params });
const get = () => GET(new Request(url), { params });

beforeEach(() => {
  Object.assign(f, { status: "ready", client: true, claimed: [], ran: 0, afters: [] });
  (checkStore as unknown as { reset: () => void }).reset();
});

describe("the preview route's photo check (#855)", () => {
  it("a ready page answers pending at once, runs the check only after the answer, and GET then returns the result", async () => {
    // Disproved if the decision request runs before the answer, or the answer does not say pending.
    const answer = await (await post()).json();
    expect(answer).toMatchObject({ preview: { status: "ready" }, photoCheck: { state: "pending" } });
    expect(f.ran).toBe(0);
    expect(f.afters).toHaveLength(1);
    await f.afters[0]();
    expect(f.ran).toBe(1);
    expect(await (await get()).json()).toMatchObject({ photoCheck: { state: "done", problem: "blurry" } });
    // A second POST claims nothing more.
    expect((await (await post()).json()).photoCheck).toEqual({ state: "done", problem: "blurry" });
    expect(f.afters).toHaveLength(1);
  });

  it("starts nothing for a page that is not ready, or when decisions are off", async () => {
    f.status = "busy";
    expect(await (await post()).json()).toEqual({ preview: { status: "busy" }, photoCheck: null });
    f.status = "ready"; f.client = false;
    expect((await (await post()).json()).photoCheck).toBeNull();
    expect([f.claimed.length, f.afters.length, f.ran]).toEqual([0, 0, 0]);
  });
});
