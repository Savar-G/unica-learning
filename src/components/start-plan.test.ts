// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartPlan } from "@/components/start-plan";
import type { StartPlanError } from "@/lib/plan-start-errors";

const fetcher = vi.fn();
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("confirm", vi.fn(() => true));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const messages = {
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
