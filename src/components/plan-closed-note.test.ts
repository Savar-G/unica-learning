import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/plan", useRouter: () => ({}), redirect: vi.fn() }));
const f = vi.hoisted(() => ({ closed: null as unknown, marked: false }));
vi.mock("@/lib/plan-access", () => ({ familyClosedPlan: async () => f.closed }));
vi.mock("@/lib/scan-pages-access", () => ({ markedFamily: async () => f.marked }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({}) }));
import { AccountBilling } from "@/components/account-billing";
import { ParentPlanView } from "@/components/parent-plan-view";
import type { ParentPlan } from "@/lib/parent-plan";
import { readFileSync } from "node:fs";
import { PlanClosedNote, closedNoteFor, planClosedFamily, type ClosedPlan } from "./plan-closed-note";
import { noteGivesCardReason } from "./plan-closed-card";

const words = (closed: ClosedPlan, on: "home" | "plan" | "account") => renderToStaticMarkup(createElement(PlanClosedNote, { closed, on }));
const text = (html: string) => html.replace(/<\/p><p>/g, " ").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
const leo = (reason: ClosedPlan["reason"]): ClosedPlan => ({ reason, child: "Leo" });
const family = (reason: ClosedPlan["reason"]): ClosedPlan => ({ reason, child: null });
const CLOSED = "so Scan pages, Maya and your dashboard are closed";
const BACK = "Access comes back after the next payment goes through, which can take a few days.";
const REASONS = ["payment_failed", "ended", "paused", "unknown", "no_plan", "read_failed", "open"] as const;
const PAGES = ["home", "plan", "account"] as const;

describe("the words depend on the plan kind", () => {
  it("payment_failed, on each page", () => {
    expect(text(words(leo("payment_failed"), "account"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. To pay, use Update card below. ${BACK} To stop the plan, use Cancel plan on your plan page.`);
    expect(text(words(leo("payment_failed"), "plan"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. To pay, use Update card on your account page. ${BACK} To stop the plan, use Cancel plan below.`);
    expect(text(words(leo("payment_failed"), "home"))).toBe(`Your last payment for Leo did not go through, ${CLOSED} for now. To pay, use Update card on your account page. ${BACK} To stop the plan, use Cancel plan on your plan page.`);
  });
  it("every page's note says how to pay", () => {
    for (const on of PAGES) {
      expect(text(words(leo("payment_failed"), on))).toContain("To pay");
      expect(text(words(family("payment_failed"), on))).toContain("To pay");
    }
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

describe("the card leaves out the reason only when the note on the same page gives it", () => {
  const zone = "America/Vancouver";
  const CARD = "11111111-1111-4111-8111-111111111111";
  const failed: ParentPlan = { kind: "payment_failed" };
  const SENTENCE = "Your last payment did not go through.";
  const times = (html: string) => (text(html).match(/did not go through/g) ?? []).length;
  /** The plan page: the note and the cards inside one view. */
  const planPage = (closed: ClosedPlan | null, plans: { name: string; plan: ParentPlan }[] = [{ name: "Leo", plan: failed }]) => renderToStaticMarkup(createElement(ParentPlanView, {
    zone, controls: true, pending: new Map(), closed,
    plans: plans.map(({ name, plan }, i) => ({ cardId: `${CARD}${i}`, childName: name, plan })),
    note: closed ? createElement(PlanClosedNote, { closed, on: "plan" }) : undefined,
  }));
  /** The account page: the note, then the section that streams in with the same `closed`. */
  const accountPage = (closed: ClosedPlan | null, plans: { name: string; plan: ParentPlan }[] = [{ name: "Leo", plan: failed }]) => (closed ? words(closed, "account") : "") + renderToStaticMarkup(createElement(AccountBilling, {
    zone, closed, billing: { state: "loaded", invoices: { state: "loaded", invoices: [] }, plans: plans.map(({ name, plan }, i) => ({ childId: `c${i}`, firstName: name, cardId: `${CARD}${i}`, plan })) },
  }));
  const pages = [["plan page", planPage], ["account page", accountPage]] as const;

  it.each(pages)("%s: a payment_failed note for this child says it once, in the note", (_, page) => {
    const out = page(leo("payment_failed"));
    expect(times(out)).toBe(1);
    expect(text(out)).toContain("Your last payment for Leo did not go through");
    expect(text(out)).not.toContain(SENTENCE);
    expect(text(out)).toContain("update your card");
  });
  it.each(pages)("%s: a payment_failed note that names no child says it once, in the note", (_, page) => {
    const out = page(family("payment_failed"), [{ name: "Leo", plan: failed }, { name: "Mia", plan: failed }]);
    expect(times(out)).toBe(1);
  });
  it.each(pages)("%s: with no note, the card says it", (_, page) => {
    const out = page(null);
    expect(text(out)).toContain(SENTENCE);
    expect(times(out)).toBe(1);
  });
  it.each(pages)("%s: an unknown note says nothing about the payment, so the card keeps it", (_, page) => {
    expect(text(page(leo("unknown")))).toContain(SENTENCE);
    expect(text(page(family("unknown")))).toContain(SENTENCE);
  });
  it.each(pages)("%s: a note that names another child leaves this card's sentence", (_, page) => {
    const out = page({ reason: "payment_failed", child: "Mia" });
    expect(text(out)).toContain("Your last payment for Mia did not go through");
    expect(text(out)).toContain(SENTENCE);
    expect(times(out)).toBe(2);
  });
  it.each(pages)("%s: with two cards, only the card the note names leaves it out", (_, page) => {
    const out = page(leo("payment_failed"), [{ name: "Leo", plan: failed }, { name: "Mia", plan: failed }]);
    expect(times(out)).toBe(2);
    expect(text(out)).toContain(SENTENCE);
  });
  it.each(pages)("%s: a card of any other kind is the same with the note or without it", (_, page) => {
    const others: ParentPlan[] = [{ kind: "ended" }, { kind: "not_started" }, { kind: "unknown" }, { kind: "paused", resumesOn: null, monthly: 79.99 }, { kind: "paying", nextCharge: null, monthly: 79.99 }];
    for (const plan of others) {
      const row = [{ name: "Leo", plan }];
      const noted = page(leo("payment_failed"), row);
      const plain = page(null, row);
      const cardOf = (html: string) => html.slice(html.indexOf("<li"));
      expect(cardOf(noted)).toBe(cardOf(plain));
    }
  });
  it("the rule, on its own", () => {
    expect(noteGivesCardReason(null, "Leo")).toBe(false);
    expect(noteGivesCardReason(undefined, "Leo")).toBe(false);
    expect(noteGivesCardReason(leo("payment_failed"), "Leo")).toBe(true);
    expect(noteGivesCardReason(family("payment_failed"), "Leo")).toBe(true);
    expect(noteGivesCardReason(leo("payment_failed"), "Mia")).toBe(false);
    for (const reason of ["unknown", "ended", "paused", "no_plan", "read_failed", "open"] as const) expect(noteGivesCardReason(leo(reason), "Leo")).toBe(false);
  });
  it("a view with no closed prop, as the admin preview renders it, keeps the sentence", () => {
    expect(text(renderToStaticMarkup(createElement(ParentPlanView, { zone, controls: true, pending: new Map(), plans: [{ cardId: CARD, childName: "Leo", plan: failed }] })))).toContain(SENTENCE);
    expect(text(renderToStaticMarkup(createElement(AccountBilling, { zone, billing: { state: "loaded", invoices: { state: "loaded", invoices: [] }, plans: [{ childId: "c", firstName: "Leo", cardId: CARD, plan: failed }] } })))).toContain(SENTENCE);
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

// #709: with PARENT_DASHBOARD_ENABLED on, a family whose plan stopped keeps the dashboard frame while Scan pages and Maya
// close. It still reads why, in words that leave the dashboard out.
describe("a stopped plan with the dashboard switch on (#709)", () => {
  const open = (closed: ClosedPlan, on: "home" | "plan" | "account") => text(renderToStaticMarkup(createElement(PlanClosedNote, { closed, on, dashboardOpen: true })));
  it("says Scan pages and Maya are closed, and never names the dashboard, on each page", () => {
    for (const on of PAGES) {
      expect(open(leo("payment_failed"), on)).toContain("Your last payment for Leo did not go through, so Scan pages and Maya are closed for now.");
      for (const reason of REASONS) expect(open(leo(reason), on)).not.toMatch(/dashboard/i);
    }
    expect(open(leo("ended"), "plan")).toBe("Leo's plan has ended, so Scan pages and Maya are closed. To start again, use Restart plan below.");
    expect(open(family("paused"), "home")).toBe("Your family's plan is paused, so Scan pages and Maya are closed until it resumes.");
  });
  it("shows the note with the switch on and with it unset, and only to a stopped family that is not marked", async () => {
    f.closed = leo("payment_failed"); f.marked = false;
    expect(await closedNoteFor("p", false)).toEqual({ closed: leo("payment_failed"), dashboardOpen: false });
    expect(await closedNoteFor("p", true)).toEqual({ closed: leo("payment_failed"), dashboardOpen: true });
    f.marked = true;
    expect(await closedNoteFor("p", true)).toBeNull();
    f.closed = null; f.marked = false;
    // (An open plan or no plan: planClosedFamily answers null, so no note with the switch either way.)
    expect(await closedNoteFor("p", true)).toBeNull();
    expect(await closedNoteFor("p", false)).toBeNull();
  });
  it("Parent home, the plan page and the account page all read the note through closedNoteFor, with its dashboard flag", () => {
    for (const page of ["page.tsx", "plan/page.tsx", "settings/page.tsx"]) {
      const source = readFileSync(`src/app/(product)/account/(dashboard)/${page}`, "utf8");
      expect(source, page).toContain("closedNoteFor(");
      expect(source, page).toMatch(/dashboardOpen=\{(?:note|planClosed)\.dashboardOpen\}/);
      expect(source, page).not.toMatch(/dashboard \? null : (?:await )?planClosedFamily/);
    }
  });
});
