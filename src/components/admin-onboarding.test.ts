import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OnboardingCheckIns } from "@/components/admin-onboarding";
import type { OnboardingStart } from "@/lib/admin-onboarding";

const row: OnboardingStart = { cardId: "c", childId: "kid", parentId: "p", parentName: "Priya <Sam>", childName: "Leah", email: "parent@example.invalid", finishedAt: "2026-11-10T18:00:00Z", location: {} };
it("names the family, offers a personal draft and counts real families only", () => {
  const html = renderToStaticMarkup(createElement(OnboardingCheckIns, { load: { rows: [row, { ...row, parentId: "test" }], unavailable: false }, isTest: (id: string) => id === "test" }));
  expect(html).toContain("Day 2 check-ins today");
  expect(html).toContain('adm-pl-count">1</span>');
  expect(html).toContain("Priya &lt;Sam&gt;");
  expect(html).toContain("mailto:parent%40example.invalid?");
  expect(html).toContain('href="/admin/parents/p"');
  expect(html).toContain("does not track completed contacts");
});
it("shows read failures and hides an empty daily list", () => {
  const render = (unavailable: boolean) => renderToStaticMarkup(createElement(OnboardingCheckIns, { load: { rows: [], unavailable }, isTest: () => false }));
  expect(render(true)).toContain("could not be read");
  expect(render(false)).toBe("");
});
