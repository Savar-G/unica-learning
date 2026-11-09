import { afterEach, describe, expect, it, vi } from "vitest";

const { admin, createSweep, run, send } = vi.hoisted(() => ({
  admin: vi.fn(() => ({})), createSweep: vi.fn(), run: vi.fn(), send: vi.fn(),
}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: admin }));
vi.mock("@/lib/workbook-scan-progress-sweep-server", () => ({ createWorkbookScanProgressSweep: createSweep }));
vi.mock("@/lib/email-resend", () => ({ resendTransport: send }));
import { POST } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("scan progress cron", () => {
  it("refuses requests without the configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await POST(new Request("https://example.test/api/scan-progress", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(admin).not.toHaveBeenCalled();
  });
  it("runs the sweep without sending email", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    run.mockResolvedValue({ selectedBooks: 1 });
    createSweep.mockReturnValue({ run });
    const response = await POST(new Request("https://example.test/api/scan-progress", { method: "POST", headers: { authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, selectedBooks: 1 });
    expect(run).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });
  it("writes nothing on a dry run", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    createSweep.mockReturnValue({ run });
    const response = await POST(new Request("https://example.test/api/scan-progress?dry=1", { method: "POST", headers: { authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, dry: true });
    expect(admin).not.toHaveBeenCalled();
    expect(createSweep).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
