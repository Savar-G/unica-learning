// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartPlan, StartedPlan } from "@/components/start-plan";
import { StartPlan as MainStartPlan } from "@/components/__fixtures__/start-plan-main-724f38b4";
import type { StartPlanError } from "@/lib/plan-start-errors";

const fetcher = vi.fn();
const f = { fetch: fetcher };
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("confirm", vi.fn(() => true));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function clickStart() { const b = container.querySelector("button"); if (!b) throw Error("Start button missing"); await act(async () => b.click()); }
const messages = {
  family_plan_upgrade_required: "This child is a sibling. Their price (CAD 59.99) can start once the sibling update ships.",
  already: "This child already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this child.",
  not_delivered: "Confirm that the first workbook has arrived at the family's home before starting the free month.",
  delivery_receipt_required: "Open this child's workbook 1 and confirm its delivery. Then return here to start the free month.",
  delivery_confirmation_required: "The delivery confirmation was not sent correctly. Reload this page and confirm delivery again.",
  invalid: "The start request could not be read. Reload this page and try again.",
  unconfirmed: "We could not confirm that Stripe started this plan. Do not start another one. Reload this page in 15 minutes, or check the family in Stripe.",
  needs_team: "This start needs the team: Stripe did not answer it, and after 24 hours we still find no plan. Do not start another one. Reload this page to see what to do.",
  unavailable: "The plan service is unavailable. Try again later.",
  failed: "We could not confirm the plan start. Check this child's plan in Stripe before trying again.",
  restart_required: "This child's plan has ended. The parent can restart it from the Account tab, or the team can use Restart.",
  wrong_mode: "A restart for this child is in progress. Wait for it to finish before trying again.",
  family_unavailable: "This family is being deleted. A plan cannot be started.",
  payment_refused: "Stripe refused the saved card. Ask the parent to update it in the Account tab before trying again.",
  not_ended: "This child's plan is still running. It cannot be restarted yet.",
} satisfies Record<StartPlanError, string>;
it("gives every route error its own message", () => {
  expect(new Set(Object.values(messages)).size).toBe(Object.keys(messages).length);
});
it.each(Object.entries(messages))("shows a specific sentence for the route's %s outcome", async (error, message) => {
  fetcher.mockResolvedValue(Response.json({ ok: false, error }, { status: 409 }));
  await act(async () => root.render(createElement(StartPlan, { cardId: "card", child: "Leah" })));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
});
it("does not display an unknown provider message", async () => {
  fetcher.mockResolvedValue(Response.json({ ok: false, error: "Raw provider failure sk_test_secret" }, { status: 502 }));
  await act(async () => root.render(createElement(StartPlan, { cardId: "card", child: "Leah" })));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.failed);
});
it("main shows the generic failure for the old route's sibling refusal", async () => {
  f.fetch.mockResolvedValue(Response.json({ ok: false, error: "failed" }, { status: 502 }));
  await act(async () => root.render(createElement(MainStartPlan, { cardId: "card", child: "Sibling" })));
  await clickStart();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Stripe could not start the plan. Check Stripe before trying again.");
});
it("PR B shows plain words for a sibling upgrade stop", async () => {
  f.fetch.mockResolvedValue(Response.json({ ok: false, error: "family_plan_upgrade_required" }, { status: 409 }));
  await act(async () => root.render(createElement(StartPlan, { cardId: "card", child: "Sibling" })));
  await clickStart();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("This child is a sibling. Their price (CAD 59.99) can start once the sibling update ships.");
  expect(container.textContent).not.toContain("family_plan_upgrade_required");
});

const render = (access: "open" | "pending", confirmation = "sent") => renderToStaticMarkup(createElement(StartedPlan, { firstChargeAt: "2026-12-08T20:00:00.000Z", access, confirmation }));

it("a start with access open shows the first charge and no warning", () => {
  const html = render("open");
  expect(html).toContain("Started. First charge");
  expect(html).not.toContain("role=\"alert\"");
});

it("a start whose plan state write did not answer says access could not be confirmed, and promises no recovery", () => {
  const html = render("pending");
  expect(html).toContain("Started. First charge");
  expect(html).toContain("The plan started in Stripe, but we could not confirm that this child can use Unica.");
  expect(html).toContain("Automatic checks will try again.");
  expect(html).toContain("Check this child&#x27;s plan state later today.");
  expect(html).toContain("Do not start another plan.");
  // The write may have stored and lost its answer, and a long Stripe outage holds the checks: the note claims neither outcome.
  expect(html).not.toMatch(/cannot use Unica yet|opens it|every 15 minutes|before that/);
  expect(html).not.toContain("plan start email");
});

it("both warnings show together when both are true", () => {
  const html = render("pending", "not_sent");
  expect(html.match(/role="alert"/g)).toHaveLength(2);
  expect(html).toContain("plan start email");
});


it("shows the admitted sibling price with both pending warnings after a successful start", async () => {
  f.fetch.mockResolvedValue(Response.json({ ok: true, firstChargeAt: "2026-12-08T20:00:00.000Z", monthlyPrice: 59.99, access: "pending", confirmation: "not_sent" }));
  await act(async () => root.render(createElement(StartPlan, { cardId: "card", child: "Sibling" })));
  await clickStart();
  expect(container.textContent).toContain("CAD 59.99 a month.");
  expect(container.textContent).toContain("First charge");
  expect(container.textContent).toContain("we could not confirm that this child can use Unica");
  expect(container.textContent).toContain("We could not confirm the plan start email.");
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
});
