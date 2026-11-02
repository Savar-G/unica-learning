import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ active: true, signedIn: true, frozen: false, delivered: false, revokeOnDownload: false }));
const dispatch = vi.hoisted(() => vi.fn(() => { throw new Error("AI must not run in S1"); }));
vi.mock("@/lib/ai-client", () => ({ aiClient: dispatch }));
vi.mock("@/lib/scan-photo-server", () => ({
  SCAN_HEADERS: { "Cache-Control": "private, no-store, max-age=0" },
  SCAN_BUCKET: "scan-photos",
  scanPath: () => "family/revision/photo.jpg",
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => {
    if (!fake.signedIn) notFound();
    const photo = () => fake.active ? { id: "00000000-0000-4000-8000-000000000001", parent_id: "family", state: "saved", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() } : null;
    return {
      parent: "family",
      active: async () => fake.signedIn,
      db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: photo() }) }) }) }), auth: { getUser: async () => ({ data: { user: { id: "family" } } }) } },
      admin: {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { deletion_requested_at: fake.frozen ? new Date().toISOString() : null } }) }) }) }),
        storage: { from: () => ({ download: async () => { fake.delivered = true; if (fake.revokeOnDownload) fake.signedIn = false; return { data: new Blob(["private bytes"], { type: "image/jpeg" }) }; } }) },
      },
    };
  },
}));
import { GET } from "./route";

const request = () => GET(new Request("https://unicalearning.com/api/account/scans/00000000-0000-4000-8000-000000000001/image"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });
describe("authenticated scan image delivery", () => {
  beforeEach(() => { fake.active = true; fake.signedIn = true; fake.frozen = false; fake.delivered = false; fake.revokeOnDownload = false; dispatch.mockClear(); vi.stubEnv("OPENROUTER_API_KEY", "synthetic-configured-key"); });
  afterEach(() => vi.unstubAllEnvs());
  it("refuses delivery when the session is revoked during the Storage read", async () => {
    fake.revokeOnDownload = true;
    expect((await request()).status).toBe(404);
    expect(fake.delivered).toBe(true);
  });
  it("returns bytes privately and does not dispatch AI with a configured key", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(await response.text()).toBe("private bytes");
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("does not read Storage for signed-out, denied, terminal or family-frozen requests", async () => {
    fake.signedIn = false; await expect(request()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }); expect(fake.delivered).toBe(false);
    fake.signedIn = true; fake.active = false; expect((await request()).status).toBe(404); expect(fake.delivered).toBe(false);
    fake.active = true; fake.frozen = true; expect((await request()).status).toBe(404); expect(fake.delivered).toBe(false);
  });
});
