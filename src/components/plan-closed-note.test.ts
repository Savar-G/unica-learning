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
const CLOSED = "so Scan pages, Maya and your dashboard are closed";
const BACK = "Access comes back after the next payment goes through, which can take a few days.";
const REASONS = ["payment_failed", "ended", "paused", "unknown", "no_plan", "read_failed", "open"] as const;
const PAGES = ["home", "plan", "account"] as const;

describe("the words depend on the plan kind", () => {
  it("payment_failed on the plan page, which has the card's own line", () => {
    expect(text(words(leo("payment_failed"), "plan"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. ${BACK} To stop the plan, use Cancel plan below.`);
  });
  it("payment_failed on the account page, which has the card's own line", () => {
    expect(text(words(leo("payment_failed"), "account"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. ${BACK} To stop the plan, use Cancel plan on your plan page.`);
  });
  it("payment_failed on Parent home, which has no card", () => {
    expect(text(words(leo("payment_failed"), "home"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. To pay, use Update card on your account page. ${BACK} To stop the plan, use Cancel plan on your plan page.`);
  });
  it("only Parent home says how to pay", () => {
    expect(text(words(leo("payment_failed"), "home"))).toContain("To pay");
    expect(text(words(leo("payment_failed"), "plan"))).not.toContain("To pay");
    expect(text(words(leo("payment_failed"), "account"))).not.toContain("To pay");
    expect(text(words(family("payment_failed"), "plan"))).not.toContain("To pay");
    expect(text(words(family("payment_failed"), "account"))).not.toContain("To pay");
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
  it("never names Explain", () => {
    for (const reason of REASONS) for (const on of PAGES) expect(text(words(leo(reason), on))).not.toMatch(/explain/i);
  });
  it("every note has its own class beside acct-alert, for its spacing under the heading", () => {
    for (const reason of REASONS) for (const on of PAGES) expect(words(leo(reason), on)).toMatch(/^<div role="status" class="acct-alert plan-closed-note">/);
  });
  it("never promises saved work", () => {
    for (const reason of ["payment_failed", "ended", "paused", "unknown"] as const) expect(text(words(leo(reason), "home"))).not.toMatch(/saved work|child's/i);
  });
});

describe("the words match where the buttons are", () => {
  const zone = "America/Vancouver";
  const planPage = (plan: ParentPlan) => renderToStaticMarkup(createElement(ParentPlanView, { plans: [{ cardId: "11111111-1111-4111-8111-111111111111", childName: "Leo", plan }], zone, controls: true, pending: new Map() }));
  const accountPage = (plan: ParentPlan) => renderToStaticMarkup(createElement(AccountBilling, { zone, billing: { state: "loaded", plans: [{ childId: "c1", firstName: "Leo", cardId: "11111111-1111-4111-8111-111111111111", plan }], invoices: { state: "loaded", invoices: [] } } }));

  it("payment_failed: each page's card has the way to pay, so only Parent home sends the parent to it, and Cancel plan is below only on the plan page", () => {
    const failed: ParentPlan = { kind: "payment_failed" };
    expect(accountPage(failed)).toContain("Your last payment did not go through. Please update your card.");
    expect(accountPage(failed)).toContain("Update card");
    expect(accountPage(failed)).not.toContain("Cancel plan");
    expect(planPage(failed)).toContain("Your last payment did not go through. Please");
    expect(planPage(failed)).toContain("update your card");
    expect(planPage(failed)).toContain("Cancel plan");
    expect(planPage(failed)).not.toContain(">Update card<");

    const account = words(leo("payment_failed"), "account");
    expect(account).not.toContain("Update card");
    expect(account).toContain('use <b>Cancel plan</b> on your <a href="/account/plan">plan page</a>');
    const plan = words(leo("payment_failed"), "plan");
    expect(plan).not.toContain("Update card");
    expect(plan).not.toContain('href="/account/settings"');
    expect(text(plan)).toContain("use Cancel plan below");
    const home = words(leo("payment_failed"), "home");
    expect(home).toContain('use <b>Update card</b> on your <a href="/account/settings">account page</a>');
    expect(home).toContain('use <b>Cancel plan</b> on your <a href="/account/plan">plan page</a>');
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
