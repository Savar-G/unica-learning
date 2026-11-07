import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ access: { open: false, reason: "no_plan" }, history: false }));
vi.mock("@/lib/plan-access", () => ({ familyPlanAccess: async () => f.access, familyHasPlanHistory: async () => f.history }));
import { PlanClosedNote, planClosedFamily } from "./plan-closed-note";

beforeEach(() => { f.access = { open: false, reason: "no_plan" }; f.history = false; });

it("names a family that had a plan and has no child open", async () => {
  f.history = true; f.access = { open: false, reason: "payment_failed" };
  expect(await planClosedFamily("p1")).toBe(true);
});

it("stays away from a family with no plan, an open plan, or a failed read", async () => {
  expect(await planClosedFamily("p1")).toBe(false);
  f.history = true; f.access = { open: true, reason: "open" };
  expect(await planClosedFamily("p1")).toBe(false);
  f.access = { open: false, reason: "read_failed" };
  expect(await planClosedFamily("p1")).toBe(false);
});

it("says plainly what is closed and how to pay or cancel", () => {
  const out = renderToStaticMarkup(PlanClosedNote({}));
  expect(out).toContain("Your plan is not running");
  expect(out).toContain('href="/account/settings"');
  expect(out).toContain('href="/account/plan"');
  expect(renderToStaticMarkup(PlanClosedNote({ showAccount: false }))).not.toContain('href="/account/settings"');
});
