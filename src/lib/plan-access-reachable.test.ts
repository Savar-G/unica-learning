import { beforeEach, describe, expect, it, vi } from "vitest";

// With the plan gate closed, a family that has or had a plan still reaches its card, its plan's controls and the deletes.
// The dashboard's gate is closed in every case here: `manage` is planManagementAccess. A family with neither gets the same
// not-found answer as before. No downstream work runs: each route stops at its next step (no secret key, no Stripe), which
// proves that the access check let the request through.
const f = vi.hoisted(() => ({ manage: false, admin: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: async () => false, planManagementAccess: async () => f.manage }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "parent",
  adminClient: () => f.admin,
  sessionClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "parent", email: "family@synthetic.invalid", email_confirmed_at: "2026-01-01" } } }) } }),
}));
vi.mock("@/lib/billing-server", () => ({ liveCardUpdates: () => null }));
vi.mock("@/lib/billing", () => ({ startCardUpdate: vi.fn(), finishCardUpdate: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
vi.mock("@/lib/parent-plan-server", () => ({ cancelFamilyPlan: async () => ({ ok: false, error: "unavailable" }), planCancelledAlert: vi.fn() }));

import { POST as cardUpdate } from "@/app/api/account/card-update/route";
import { GET as cardReturn } from "@/app/api/account/card-update/return/route";
import { POST as cancel } from "@/app/api/account/plan/cancel/route";
import { POST as familyDelete } from "@/app/api/account/family/delete/route";
import { POST as familyCode } from "@/app/api/account/family/delete/code/route";
import { POST as childDelete } from "@/app/api/account/children/[id]/delete/route";
import { POST as childCode } from "@/app/api/account/children/[id]/delete/code/route";
import { PATCH as childEdit } from "@/app/api/account/children/[id]/route";
import { planControlRequest } from "@/lib/plan-control-request";

const id = "11111111-1111-4111-8111-111111111111";
const post = (path: string, body: unknown = {}) => new Request(`https://unica.test${path}`, {
  method: "POST", headers: { origin: "https://unica.test", host: "unica.test", "content-type": "application/json" }, body: JSON.stringify(body),
});
const child = { params: Promise.resolve({ id }) };

beforeEach(() => { f.manage = false; f.admin = null; });

// A route's answer when the access check passed: its next step, with no key, answers 503, never 404.
const ROUTES: [string, () => Promise<Response>][] = [
  ["card update", () => cardUpdate(post("/api/account/card-update", { card: id }))],
  ["family delete", () => familyDelete(post("/api/account/family/delete", { code: "123456", confirm: "DELETE" }))],
  ["family delete code", () => familyCode(post("/api/account/family/delete/code"))],
  ["child delete", () => childDelete(post(`/api/account/children/${id}/delete`, { code: "123456", confirm: "DELETE" }), child)],
  ["child delete code", () => childCode(post(`/api/account/children/${id}/delete/code`), child)],
];

describe.each(ROUTES)("%s", (_name, run) => {
  it("is reached by a closed family with a plan", async () => {
    f.manage = true;
    const response = await run();
    expect(response.status).toBe(503);
  });
  it("answers not found to a family with no plan and no dashboard", async () => {
    expect((await run()).status).toBe(404);
  });
});

describe("the card update's return", () => {
  const back = () => cardReturn(new Request("https://unica.test/api/account/card-update/return?session_id=cs_test_abc"));
  it("takes a closed family to its account page, not to Parent home", async () => {
    f.manage = true;
    expect((await back()).headers.get("location")).toBe("https://unica.test/account/settings?card=failed");
  });
  it("sends a family with no plan to Parent home", async () => {
    expect((await back()).headers.get("location")).toBe("https://unica.test/account");
  });
});

describe("the plan's controls", () => {
  const control = () => planControlRequest(post("/api/account/plan/pause", { card: id, action: "preview", weeks: 2 }));
  it("are reached by a closed family with a plan", async () => {
    f.manage = true;
    expect(await control()).toEqual({ parent: "parent", card: id, body: { card: id, action: "preview", weeks: 2 } });
  });
  it("answer not found to a family with no plan and no dashboard", async () => {
    expect(((await control()) as Response).status).toBe(404);
  });
});

describe("a child's details", () => {
  const edit = () => childEdit(new Request(`https://unica.test/api/account/children/${id}`, { method: "PATCH", headers: { origin: "https://unica.test", "content-type": "application/json" }, body: "{}" }), child);
  it("are reached by a closed family with a plan: its empty change is then refused as invalid, not hidden", async () => {
    f.admin = {}; f.manage = true;
    const response = await edit();
    expect(response.status).not.toBe(404);
    expect(response.status).toBeLessThan(500);
  });
  it("answer not found to a family with no plan and no dashboard", async () => {
    f.admin = {};
    expect((await edit()).status).toBe(404);
  });
});

it("cancel checks no gate: every family with a card setup reaches it, as before", async () => {
  const response = await cancel(post("/api/account/plan/cancel", { card: id }));
  expect(response.status).toBe(503);
});
