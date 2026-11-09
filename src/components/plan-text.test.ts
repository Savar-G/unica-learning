import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
import { PlanText } from "@/components/plan-text";
import { familyZone } from "@/lib/family-time";

const zone = familyZone({ timeZone: "America/Vancouver", postal: null, province: null });
const text = (plan: Parameters<typeof PlanText>[0]["plan"]) =>
  renderToStaticMarkup(createElement(PlanText, { plan, zone, cardUpdate: "here" })).replace(/<[^>]+>/g, "");

it("words a cancelled free month with its end date, and keeps the unknown line for an unknown plan", () => {
  expect(text({ kind: "ending", endsOn: "2026-12-22T20:42:20.000Z", free: true })).toBe("Cancelled. The plan ends on December 22, 2026. We will not charge your card.");
  expect(text({ kind: "unknown" })).toBe("We cannot load this plan now.");
});
