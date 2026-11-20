import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as refresh } from "@/app/api/admin/social/refresh/route";
import { POST as tag } from "@/app/api/admin/social/tag/route";
import { GET as cron } from "@/app/api/social-metrics/route";

const { requireAdmin, runSocialRefresh, saveSocialTracking } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), runSocialRefresh: vi.fn(), saveSocialTracking: vi.fn(),
}));
vi.mock("@/lib/admin-store", () => ({ requireAdmin }));
vi.mock("@/lib/social-store", () => ({ runSocialRefresh, saveSocialTracking }));
vi.mock("@/lib/sentry-cron", () => ({ monitored: (_slug: string, handler: (request: Request) => Promise<Response>) => handler }));

const ORIGIN = "https://example.test";
function post(path: string, origin: string, body?: URLSearchParams) {
  return new Request(ORIGIN + path, { method: "POST", headers: { Origin: origin }, body });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("social route authorization", () => {
  it("refuses unauthenticated and non-admin mutations before touching storage or a provider", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(refresh(post("/api/admin/social/refresh", ORIGIN))).rejects.toThrow("404");
    await expect(tag(post("/api/admin/social/tag", ORIGIN))).rejects.toThrow("404");
    expect(runSocialRefresh).not.toHaveBeenCalled();
    expect(saveSocialTracking).not.toHaveBeenCalled();
  });

  it("rejects cross-origin submissions and accepts a same-origin admin edit", async () => {
    requireAdmin.mockResolvedValue({});
    expect((await refresh(post("/api/admin/social/refresh", "https://other.test"))).status).toBe(403);
    expect((await tag(post("/api/admin/social/tag", "https://other.test"))).status).toBe(403);
    expect(saveSocialTracking).not.toHaveBeenCalled();
    expect(runSocialRefresh).not.toHaveBeenCalled();
    saveSocialTracking.mockResolvedValue("saved");
    const tags = new URLSearchParams({ platform: "youtube", post: "clip", content: "post-1", campaign: "organic" });
    const response = await tag(post("/api/admin/social/tag", ORIGIN, tags));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("notice=saved");
    expect(saveSocialTracking).toHaveBeenCalledWith("youtube", "clip", { utm_content: "post-1", utm_campaign: "organic" });
  });

  it("requires the cron secret and reports a failed platform without retrying a whole run", async () => {
    const request = (token: string) => new Request(`${ORIGIN}/api/social-metrics`, { headers: { Authorization: `Bearer ${token}` } });
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(request("bad"))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "fixture-cron");
    expect((await cron(request("wrong"))).status).toBe(401);
    expect(runSocialRefresh).not.toHaveBeenCalled();
    runSocialRefresh.mockResolvedValue({ kind: "done", results: [{ platform: "youtube", status: "failed", message: "Fixture failure" }] });
    expect((await cron(request("fixture-cron"))).status).toBe(502);
    expect(runSocialRefresh).toHaveBeenCalledTimes(1);
  });
});
