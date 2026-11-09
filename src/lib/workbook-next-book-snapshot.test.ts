import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { baselineOf, frozenOf, id, jobBook, mark, printedItems, secondTry, shippedBook } from "./workbook-book1.fixture";
import { approvedWorkbook } from "./workbook-ship";
import { planNextBookFromSnapshot } from "./workbook-next-book-snapshot";
import type { Observation } from "./scan-observation";
import type { Json } from "./database";

describe("next book from a frozen U16 capture", () => {
  it("uses printed review marks, holds missing work and makes a stable plan", async () => {
    const job = await jobBook(5), { baseline, record } = baselineOf(job);
    const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
    const all = printedItems(book).filter(e => e.day <= 7 && e.mastery.eligible);
    const area = all.filter(e => e.teaching?.itemStep?.skill === "3.9-area-square-units" && e.teaching.itemStep.step === 4);
    const wrong = all.find(e => e.teaching?.itemStep?.skill === "4.1-expanded-form")!;
    const helped = all.find(e => e.teaching?.itemStep?.skill === "4.10-relationship")!;
    const later = printedItems(book).find(e => e.day >= 8 && e.mastery.eligible)!;
    const afterCutoff = all.find(e => e.teaching?.itemStep?.skill === "4.4-subtract-within-10000")!;
    expect(area.length).toBeGreaterThan(0); expect(wrong).toBeDefined(); expect(helped).toBeDefined(); expect(later).toBeDefined(); expect(afterCutoff).toBeDefined();
    area.forEach(e => mark(book, e, "right"));
    const wrongMark = mark(book, wrong, "wrong");
    const tries: import("./workbook-correction-journal").SecondTryRow[] = [];
    const corrected = secondTry(tries, book, wrongMark, "right", "2026-11-13T00:00:00.000Z");
    mark(book, later, "right");
    mark(book, afterCutoff, "right", "2026-11-18T00:00:00.000Z");
    const helpedMark = mark(book, helped, "right");
    helpedMark.observation = { ...(helpedMark.observation as unknown as Observation), help: "math-help" } as unknown as Json;
    const sources = frozenOf(book, record, tries);
    expect(JSON.stringify(sources)).not.toContain("Leah");
    const snapshot = { id: id(99991), workbookId: book.book.id, cutoff: Date.parse("2026-11-17T00:00:00Z"), scope: "day7" as const,
      issuedSkills: [...new Set(baseline.initialIssues.map(i => i.selection.skill))] };
    const result = planNextBookFromSnapshot({ sources, snapshot });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.planningInput.reviews).toEqual(expect.arrayContaining(job.frame.plan.reviewsAfter));
    expect(result.planningInput.missedReviews).toEqual(expect.arrayContaining([expect.objectContaining({ skill: "4.1-expanded-form" })]));
    expect(result.planningInput.misses).toEqual(expect.arrayContaining([expect.objectContaining({ question: expect.objectContaining({ page: wrong.page, question: wrong.number }) })]));
    const fix = result.plan.days.flatMap(day => day.pages.flatMap(page => page.parts.flatMap(part => part.fixIt ?? [])))
      .find(item => item.skill === "4.1-expanded-form");
    expect(fix?.avoid.questions).toEqual(expect.arrayContaining([expect.objectContaining({ page: wrong.page, question: wrong.number })]));
    expect(result.held).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: "4.10-relationship", reason: "help" }),
      expect.objectContaining({ skill: "5.9-distributive", reason: "no printed question" }),
      expect.objectContaining({ skill: "4.4-add-within-10000", reason: "not marked" }),
    ]));
    expect(result.held).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "outside selected days" })]));
    const lateKey = JSON.stringify([afterCutoff.identity.workbookId, afterCutoff.identity.printedRevision, afterCutoff.identity.pageId, afterCutoff.identity.itemId]);
    expect(result.held).toEqual(expect.arrayContaining([expect.objectContaining({ key: lateKey, version: 2, reason: "after cutoff" })]));
    expect(result.planningInput.reviews).toEqual(expect.arrayContaining([expect.objectContaining({ skill: "3.9-area-square-units", step: 4, interval: 0 })]));
    expect(result.held).toEqual(expect.arrayContaining([expect.objectContaining({ key: `second-try:${corrected.id}` })]));
    expect(result.consumed.length).toBeGreaterThan(0);
    expect(planNextBookFromSnapshot({ sources, snapshot })).toEqual(result);
    const refreshed = planNextBookFromSnapshot({ sources, snapshot: { ...snapshot, scope: "later-book" } });
    expect(refreshed.ok, JSON.stringify(refreshed)).toBe(true);
    if (refreshed.ok) {
      const key = JSON.stringify([later.identity.workbookId, later.identity.printedRevision, later.identity.pageId, later.identity.itemId]);
      expect([...refreshed.consumed, ...refreshed.held].some(item => item.key === key)).toBe(true);
    }
    expect(planNextBookFromSnapshot({ sources, snapshot: { ...snapshot, issuedSkills: snapshot.issuedSkills.slice(1) } })).toMatchObject({ ok: false, reason: "A printed skill is missing from the snapshot." });
    const noMarks = structuredClone(sources);
    noMarks.books[0].items = []; noMarks.books[0].changes = []; noMarks.books[0].events = [];
    noMarks.book1!.corrections.rows = []; noMarks.book1!.corrections.count = 0;
    expect(planNextBookFromSnapshot({ sources: noMarks, snapshot })).toMatchObject({ ok: false, reason: "The selected days have no marked scans." });
    const broken = structuredClone(sources); broken.book1!.corrections.count++;
    expect(planNextBookFromSnapshot({ sources: broken, snapshot })).toMatchObject({ ok: false, reason: "The correction history is incomplete." });
  }, 120000);
});
