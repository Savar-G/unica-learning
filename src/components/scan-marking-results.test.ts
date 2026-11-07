import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScanMarkingResults } from "./scan-marking-results";
import type { markingPageView } from "@/lib/scan-marking";
const base: ReturnType<typeof markingPageView> & { photoAvailable: boolean } = { completion: { status: "incomplete", total: 1, finished: 0, items: [] }, counts: { scored: 0, unscored: 0, pending: 1, teamChecks: 0 }, solutionsAvailable: false, photoAvailable: false, items: [{ number: 1, itemId: "private", version: 1, canChange: true, evidencePhoto: "photo", photoAvailable: false, actor: "system", at: "2026-11-05T00:00:00Z", state: "pending", result: null, readAnswerText: '<script>private</script>', label: "Not marked yet" }] };
it("pending and expired-image results retain a safely escaped reading without answers, job data or provider names", () => { const html = renderToStaticMarkup(createElement(ScanMarkingResults, { result: base })); expect(html).toContain("Photo no longer available"); expect(html).toContain("Not marked yet"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("Solution"); });
it("a terminal all-unscored page differs from a scored page and the global-cap message is visible", () => { const html = renderToStaticMarkup(createElement(ScanMarkingResults, { result: { ...base, completion: { ...base.completion, status: "complete" }, counts: { scored: 0, unscored: 1, pending: 0, teamChecks: 0 }, budgetHeld: true } })); expect(html).toContain("This page has no scored answers"); expect(html).toContain("We cannot check more pages right now"); });
it("an answer with no mark shows no 'Automatic check' line; a team mark says Our team (#715)", () => {
  const pending = renderToStaticMarkup(createElement(ScanMarkingResults, { result: base }));
  expect(pending).not.toContain("Automatic check");
  const item = { ...base.items[0], state: "parent-checked" as const, result: "wrong" as const, actor: "admin" as const, label: "Wrong" };
  expect(renderToStaticMarkup(createElement(ScanMarkingResults, { result: { ...base, items: [item] } }))).toContain("Our team · Nov 4, 5:00 p.m.");
});
it("shows a mark's time as a short date and time in the family's zone, never the raw time (#715)", () => {
  const item = { ...base.items[0], state: "parent-checked" as const, result: "wrong" as const, actor: "admin" as const, label: "Wrong", at: "2026-11-07T21:37:13.132333+00:00" };
  const html = renderToStaticMarkup(createElement(ScanMarkingResults, { result: { ...base, items: [item] }, zone: "America/Toronto" }));
  expect(html).toContain("Our team · Nov 7, 4:37 p.m.");
  expect(html).not.toContain("2026-11-07T21:37");
});
describe("the page line agrees with its answers (#715)", () => {
  type Item = (typeof base.items)[number];
  const marked: Item = { ...base.items[0], itemId: "marked", number: 1, state: "scored", result: "wrong", label: "Wrong" };
  const unread: Item = { ...base.items[0], itemId: "unread", number: 2, state: "pending", result: null, label: "Not marked yet" };
  const team: Item = { ...base.items[0], itemId: "team", number: 3, state: "pending", result: null, label: "Our team is checking this answer." };
  const page = (items: Item[], counts: Partial<typeof base.counts>, status: "complete" | "incomplete" = "incomplete") => renderToStaticMarkup(createElement(ScanMarkingResults, {
    result: { ...base, items, completion: { ...base.completion, status, total: items.length }, counts: { scored: 0, unscored: 0, pending: 0, teamChecks: 0, ...counts } } }));
  it("no answer has a mark: This page is not marked yet.", () => {
    expect(page([unread], { pending: 1 })).toContain("This page is not marked yet.");
  });
  it("some answers have a mark and others are not marked: Some answers on this page are not marked yet.", () => {
    const html = page([marked, unread], { scored: 1, pending: 1 });
    expect(html).toContain("Some answers on this page are not marked yet.");
    expect(html).not.toContain("This page is not marked yet.");
  });
  it("our team is checking an answer: that line wins, also over an unmarked answer", () => {
    expect(page([marked, team], { scored: 1, teamChecks: 1 })).toContain("Our team is checking some answers on this page.");
    const both = page([marked, unread, team], { scored: 1, pending: 1, teamChecks: 1 });
    expect(both).toContain("Our team is checking some answers on this page.");
    expect(both).not.toContain("not marked yet.</p>");
  });
  it("every answer has its mark: This page has been marked.", () => {
    expect(page([marked], { scored: 1 }, "complete")).toContain("This page has been marked.");
  });
});
