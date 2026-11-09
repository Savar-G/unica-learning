// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartPlan } from "@/components/start-plan";
import { StartPlan as MainStartPlan } from "@/components/__fixtures__/start-plan-main-724f38b4";
const f = vi.hoisted(() => ({ fetch: vi.fn() }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", f.fetch);
  vi.stubGlobal("confirm", vi.fn(() => true));
  window.confirm = vi.fn(() => true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function clickStart() { const b = container.querySelector("button"); if (!b) throw Error("Start button missing"); await act(async () => b.click()); }
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
