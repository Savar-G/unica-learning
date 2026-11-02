import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authorized: true, problem: null as string | null, db: {}, send: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => state.authorized ? { userId: "admin" } : null }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => state.db }));
vi.mock("@/lib/email-delivery", () => ({ emailConfigProblem: () => state.problem }));
vi.mock("@/lib/workbook-email-server", () => ({ sendWorkbookNotice: state.send, runWorkbookWelcomes: state.run }));

const { POST } = await import("@/app/api/admin/cards/[id]/workbook-email/route");
const { POST: cron } = await import("@/app/api/workbook-emails/route");
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };
const body = { kind: "dispatch", workbookNumber: 1, delivery: { method: "mail", carrier: "Carrier", trackingNumber: "A123" } };
const request = (value: unknown = body, origin = "https://unica.test") => new Request(`https://unica.test/api/admin/cards/${id}/workbook-email`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value),
});
beforeEach(() => { state.authorized = true; state.problem = null; state.send.mockReset().mockResolvedValue({ status: "sent", emailId: "re_1" }); state.run.mockReset().mockResolvedValue({ pending: 0, checked: 0, sent: 0 }); });

describe("admin workbook email route", () => {
  it("requires live admin access and the site's origin", async () => {
    state.authorized = false;
    expect((await POST(request(), ctx)).status).toBe(404);
    state.authorized = true;
    expect((await POST(request(body, "https://other.test"), ctx)).status).toBe(403);
    expect(state.send).not.toHaveBeenCalled();
  });
  it.each([{ ...body, delivery: { method: "mail" } }, { ...body, workbookNumber: 0 }, { ...body, workbookNumber: 1.5 }, { kind: "other" }])("rejects invalid delivery input before any send", async (input) => {
    expect((await POST(request(input), ctx)).status).toBe(400);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("ignores a forged recipient and passes only validated fields", async () => {
    expect((await POST(request({ ...body, to: "attacker@example.com", parentId: "other" }), ctx)).status).toBe(200);
    expect(state.send).toHaveBeenCalledWith(state.db, { cardId: id, kind: "dispatch", workbookNumber: 1, delivery: { method: "mail", carrier: "Carrier", trackingNumber: "A123", trackingUrl: "" } });
  });
  it("stops before a claim when email is unavailable", async () => {
    state.problem = "No sender";
    expect((await POST(request(), ctx)).status).toBe(503);
    expect(state.send).not.toHaveBeenCalled();
  });
});

describe("workbook email worker authorization", () => {
  it("requires the cron secret and preserves dry mode", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-secret");
    try {
      expect((await cron(new Request("https://unica.test/api/workbook-emails", { method: "POST" }))).status).toBe(401);
      expect(state.run).not.toHaveBeenCalled();
      const response = await cron(new Request("https://unica.test/api/workbook-emails?dry=1", { method: "POST", headers: { authorization: "Bearer synthetic-secret" } }));
      expect(response.status).toBe(200);
      expect(state.run).toHaveBeenCalledWith(state.db, { dry: true });
    } finally { vi.unstubAllEnvs(); }
  });
});
