import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ScanMarkingResults } from "./scan-marking-results";
import type { markingPageView } from "@/lib/scan-marking";
const base: ReturnType<typeof markingPageView> & { photoAvailable: boolean } = { completion: { status: "incomplete", total: 1, finished: 0, items: [] }, counts: { scored: 0, unscored: 0, pending: 1, teamChecks: 0 }, solutionsAvailable: false, photoAvailable: false, items: [{ number: 1, itemId: "private", version: 1, canChange: true, evidencePhoto: "photo", photoAvailable: false, actor: "system", at: "2026-11-05T00:00:00Z", state: "pending", result: null, readAnswerText: '<script>private</script>', label: "Please check this answer" }] };
it("pending and expired-image results retain a safely escaped reading without answers, job data or provider names", () => { const html = renderToStaticMarkup(createElement(ScanMarkingResults, { result: base })); expect(html).toContain("Photo no longer available"); expect(html).toContain("Please check this answer"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("Solution"); });
it("a terminal all-unscored page differs from a scored page and the global-cap message is visible", () => { const html = renderToStaticMarkup(createElement(ScanMarkingResults, { result: { ...base, completion: { ...base.completion, status: "complete" }, counts: { scored: 0, unscored: 1, pending: 0, teamChecks: 0 }, budgetHeld: true } })); expect(html).toContain("This page has no scored answers"); expect(html).toContain("We cannot check more pages right now"); });
it("an answer with no mark shows no 'Automatic check' line; a team mark says Our team (#715)", () => {
  const pending = renderToStaticMarkup(createElement(ScanMarkingResults, { result: base }));
  expect(pending).not.toContain("Automatic check");
  const item = { ...base.items[0], state: "parent-checked" as const, result: "wrong" as const, actor: "admin" as const, label: "Wrong" };
  expect(renderToStaticMarkup(createElement(ScanMarkingResults, { result: { ...base, items: [item] } }))).toContain("Our team · 2026-11-05T00:00:00Z");
});
