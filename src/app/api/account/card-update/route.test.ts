import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ parent: vi.fn(), access: vi.fn(), start: vi.fn(), finish: vi.fn(), seams: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: f.parent }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: f.access }));
vi.mock("@/lib/billing", () => ({ startCardUpdate: f.start, finishCardUpdate: f.finish }));
vi.mock("@/lib/billing-server", () => ({ liveCardUpdates: f.seams }));
import { POST } from "./route";
import { GET } from "./return/route";
import { safeNext } from "@/lib/sign-in-link";

const card = "11111111-1111-4111-8111-111111111111";
const SEAMS = { store: {}, provider: {} };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://unica.test/api/account/card-update", {
  method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
const back = (query: string) => new Request(`https://unica.test/api/account/card-update/return${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  f.parent.mockResolvedValue("parent-1");
  f.access.mockResolvedValue(true);
  f.seams.mockReturnValue(SEAMS);
  f.start.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/1" });
  f.finish.mockResolvedValue("updated");
});

describe("opening the card page", () => {
  it("refuses another site, a form post and a signed-out parent before any Stripe call", async () => {
    expect((await POST(post({ card }, { origin: "https://other.test" }))).status).toBe(403);
    expect((await POST(post({ card }, { "content-type": "text/plain" }))).status).toBe(415);
    f.parent.mockResolvedValue(null);
    expect((await POST(post({ card }))).status).toBe(401);
    expect(f.start).not.toHaveBeenCalled();
  });

  it("gives a family the dashboard's switch does not open to a 404, and calls no Stripe", async () => {
    f.access.mockResolvedValue(false);
    expect((await POST(post({ card }))).status).toBe(404);
    expect(f.seams).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });

  it.each([{}, { card: "not-a-uuid" }, { card: 7 }, null])("refuses a body without a card setup id", async (body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(f.start).not.toHaveBeenCalled();
  });

  it("uses the signed-in parent, whatever else the body says, and returns to this site", async () => {
    const response = await POST(post({ card: card.toUpperCase(), customer: "cus_other", parent: "parent-2" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/1" });
    expect(f.start).toHaveBeenCalledWith("parent-1", card, { returnUrl: "https://unica.test/api/account/card-update/return", cancelUrl: "https://unica.test/account/settings?card=unchanged" }, SEAMS);
  });

  it("answers 404 for another family's row, 502 when Stripe fails and 503 with no seams", async () => {
    f.start.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await POST(post({ card }))).status).toBe(404);
    f.start.mockResolvedValue({ ok: false, error: "failed" });
    expect((await POST(post({ card }))).status).toBe(502);
    f.seams.mockReturnValue(null);
    expect((await POST(post({ card }))).status).toBe(503);
  });
});

describe("coming back from Stripe", () => {
  const location = (r: Response) => r.headers.get("location");

  it("finishes for the signed-in parent, and says so on the Account tab", async () => {
    const response = await GET(back("?session_id=cs_test_abc123"));
    expect(response.status).toBe(303);
    expect(location(response)).toBe("https://unica.test/account/settings?card=updated");
    expect(f.finish).toHaveBeenCalledWith("parent-1", "cs_test_abc123", SEAMS);
  });

  it.each([["incomplete", "unchanged"], ["not_found", "failed"], ["failed", "failed"]])("turns %s into the notice %s", async (result, notice) => {
    f.finish.mockResolvedValue(result);
    expect(location(await GET(back("?session_id=cs_test_abc123")))).toBe(`https://unica.test/account/settings?card=${notice}`);
  });

  it("sends a signed-out parent to sign in and back to this address, so the card still takes effect", async () => {
    f.parent.mockResolvedValue(null);
    const to = new URL(location(await GET(back("?session_id=cs_test_abc123")))!);
    expect(to.pathname).toBe("/sign-in");
    expect(safeNext(to.searchParams.get("next"))).toBe("/api/account/card-update/return?session_id=cs_test_abc123");
    expect(f.finish).not.toHaveBeenCalled();
  });

  it("sends a family the dashboard's switch does not open to Parent home, and writes nothing", async () => {
    f.access.mockResolvedValue(false);
    expect(location(await GET(back("?session_id=cs_test_abc123")))).toBe("https://unica.test/account");
    expect(f.seams).not.toHaveBeenCalled();
    expect(f.finish).not.toHaveBeenCalled();
  });

  it.each(["", "?session_id=", "?session_id=../../v1/customers", "?session_id=cs_test_a%2Fb", "?session_id=sub_1"])("asks Stripe nothing about %s", async (query) => {
    expect(location(await GET(back(query)))).toBe("https://unica.test/account/settings?card=failed");
    expect(f.finish).not.toHaveBeenCalled();
  });
});
