// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SiteAnalytics, scrubAnalyticsEvent, scrubSpeedEvent } from "@/components/site-analytics";
import { VisitTags } from "@/components/visit-tags";

const state = vi.hoisted(() => ({ path: "/admin/parent-dashboard", tags: vi.fn(), keepVisit: vi.fn(), analytics: vi.fn(), speed: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/lib/ad-tags", () => ({ getAdTags: state.tags }));
vi.mock("@/lib/visit-source", () => ({ keepVisit: state.keepVisit }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => { state.analytics(); return null; } }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => { state.speed(); return null; } }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it.each(["/admin/dashboard", "/admin/parent-dashboard"])("does not start analytics or visit/ad effects on the sample explorer at %s", async path => {
  state.path = path;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(createElement("div", null, createElement(SiteAnalytics), createElement(VisitTags))));
    expect(state.tags).not.toHaveBeenCalled(); expect(state.keepVisit).not.toHaveBeenCalled();
    expect(state.analytics).not.toHaveBeenCalled(); expect(state.speed).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it.each(["/admin/dashboard", "/admin/parent-dashboard"])("drops sample URLs from analytics already loaded on an earlier page and keeps normal parent events at %s", path => {
  const sample = { type: "pageview" as const, url: `https://unicalearning.com${path}?view=plan&scenario=restart_review` };
  expect(scrubAnalyticsEvent(sample)).toBeNull();
  expect(scrubSpeedEvent({ ...sample, type: "vital" })).toBeNull();
  expect(scrubAnalyticsEvent({ ...sample, url: "https://unicalearning.com/account" })).not.toBeNull();
  expect(scrubSpeedEvent({ type: "vital", url: "https://unicalearning.com/account?child=1" })?.url).toBe("https://unicalearning.com/account");
});
