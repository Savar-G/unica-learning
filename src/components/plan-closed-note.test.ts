import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/plan", useRouter: () => ({}), redirect: vi.fn() }));
const f = vi.hoisted(() => ({ closed: null as unknown }));
vi.mock("@/lib/plan-access", () => ({ familyClosedPlan: async () => f.closed }));
import { AccountBilling } from "@/components/account-billing";
import { ParentPlanView } from "@/components/parent-plan-view";
import type { ParentPlan } from "@/lib/parent-plan";
import { PlanClosedNote, planClosedFamily, type ClosedPlan } from "./plan-closed-note";

const words = (closed: ClosedPlan, on: "home" | "plan" | "account") => renderToStaticMarkup(createElement(PlanClosedNote, { closed, on }));
const text = (html: string) => html.replace(/<\/p><p>/g, " ").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
const leo = (reason: ClosedPlan["reason"]): ClosedPlan => ({ reason, child: "Leo" });
const family = (reason: ClosedPlan["reason"]): ClosedPlan => ({ reason, child: null });
const CLOSED = "so Scan pages and Maya are closed";
const BACK = "Access comes back after the next payment goes through, which can take a few days.";

describe("the words depend on the plan kind", () => {
  it("payment_failed, with one child's plan", () => {
    expect(text(words(leo("payment_failed"), "account"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. To pay, use Update card below. ${BACK} To stop the plan, use Cancel plan on your plan page.`);
  });
  it("payment_failed, for a family with no one child to name", () => {
    expect(text(words(family("payment_failed"), "account"))).toContain(`Your last payment did not go through, ${CLOSED} for now.`);
  });
  it("ended", () => {
    expect(text(words(leo("ended"), "plan"))).toBe(`Leo's plan has ended, ${CLOSED}. To start again, use Restart plan below.`);
    expect(text(words(family("ended"), "plan"))).toBe(`Your family's plan has ended, ${CLOSED}. To start again, use Restart plan below.`);
  });
  it("paused", () => {
    expect(text(words(leo("paused"), "plan"))).toBe(`Leo's plan is paused, ${CLOSED} until it resumes.`);
    expect(text(words(family("paused"), "home"))).toBe(`Your family's plan is paused, ${CLOSED} until it resumes.`);
  });
  it.each(["unknown", "no_plan", "read_failed", "open"] as const)("any other case: %s", (reason) => {
    expect(text(words(leo(reason), "plan"))).toBe(`Leo's plan is not running, ${CLOSED} for now.`);
    expect(text(words(family(reason), "plan"))).toBe(`Your family's plan is not running, ${CLOSED} for now.`);
  });
  it("never promises saved work", () => {
    for (const reason of ["payment_failed", "ended", "paused", "unknown"] as const) expect(text(words(leo(reason), "home"))).not.toMatch(/saved work|child's/i);
  });
});

describe("the words match where the buttons are", () => {
  const zone = "America/Vancouver";
  const planPage = (plan: ParentPlan) => renderToStaticMarkup(createElement(ParentPlanView, { plans: [{ cardId: "11111111-1111-4111-8111-111111111111", childName: "Leo", plan }], zone, controls: true, pending: new Map() }));
  const accountPage = (plan: ParentPlan) => renderToStaticMarkup(createElement(AccountBilling, { zone, billing: { state: "loaded", plans: [{ childId: "c1", firstName: "Leo", cardId: "11111111-1111-4111-8111-111111111111", plan }], invoices: { state: "loaded", invoices: [] } } }));

  it("payment_failed: Update card is on the account page and Cancel plan on the plan page, so each is below there and a link elsewhere", () => {
    const failed: ParentPlan = { kind: "payment_failed" };
    expect(accountPage(failed)).toContain("Update card");
    expect(accountPage(failed)).not.toContain("Cancel plan");
    expect(planPage(failed)).toContain("Cancel plan");
    expect(planPage(failed)).not.toContain(">Update card<");

    const account = words(leo("payment_failed"), "account");
    expect(text(account)).toContain("use Update card below");
    expect(account).toContain('use <b>Cancel plan</b> on your <a href="/account/plan">plan page</a>');
    const plan = words(leo("payment_failed"), "plan");
    expect(text(plan)).toContain("use Cancel plan below");
    expect(plan).toContain('use <b>Update card</b> on your <a href="/account/settings">account page</a>');
    const home = words(leo("payment_failed"), "home");
    expect(home).toContain('href="/account/settings"');
    expect(home).toContain('href="/account/plan"');
    expect(text(home)).not.toContain("below");
  });

  it("ended: Restart plan is on the plan page and the account page, so it is below on both and a link from Parent home", () => {
    const ended: ParentPlan = { kind: "ended" };
    expect(planPage(ended)).toContain("Restart plan");
    expect(accountPage(ended)).toContain("Restart plan");
    expect(text(words(leo("ended"), "plan"))).toContain("use Restart plan below");
    expect(text(words(leo("ended"), "account"))).toContain("use Restart plan below");
    expect(words(leo("ended"), "home")).toContain('use <b>Restart plan</b> on your <a href="/account/plan">plan page</a>');
  });
});

describe("planClosedFamily", () => {
  it("answers what the gate says, and null when the family is not closed", async () => {
    f.closed = leo("ended");
    expect(await planClosedFamily("p1")).toEqual(leo("ended"));
    f.closed = null;
    expect(await planClosedFamily("p1")).toBeNull();
  });
});
