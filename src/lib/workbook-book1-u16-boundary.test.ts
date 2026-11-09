import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { baselineOf, frozenOf, jobBook, mark, printedItems, requestOf, shippedBook } from "./workbook-book1.fixture";
import { evaluateBook1Preview } from "./workbook-book1-preview";
import { approvedWorkbook } from "./workbook-ship";

describe("synthetic U16 Book 1 evidence boundary", () => {
  it("does not infer earlier mastery from a printed review step", async () => {
    const job = await jobBook(5);
    const { baseline, record } = baselineOf(job);
    const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
    expect(job.frame.plan.level).toBe(16);
    expect(baseline.priorMastery.passed).toEqual({});
    const selection = { unit: "3.9", skill: "3.9-area-square-units", step: 4 };
    expect(baseline.initialIssues).toContainEqual({ kind: "initial-issue", selection });
    const items = printedItems(book).filter(e => e.mastery.eligible && e.day <= 7 && e.teaching?.itemStep?.skill === selection.skill && e.teaching.itemStep.step === selection.step);
    expect(items.length).toBeGreaterThan(0);
    const scheduled = job.frame.plan.days.flatMap(d => d.pages.flatMap(p => p.parts.flatMap(part => part.reviews ?? [])));
    expect(scheduled.filter(r => r.skill === selection.skill && r.step === selection.step)).toHaveLength(0);
    expect(job.frame.plan.reviewsAfter.filter(r => r.skill === selection.skill && r.step === selection.step)).toHaveLength(0);
    items.forEach(item => mark(book, item, "right"));
    const sources = frozenOf(book, record);
    expect(JSON.stringify(sources)).not.toContain("Leah");
    expect(await evaluateBook1Preview(requestOf(book, selection), sources)).toMatchObject({ ok: false, availability: "unavailable", reasons: ["history-mastery-gap"], plan: null });
  }, 120000);
  it("does not treat a scheduled review as a printed question", async () => {
    const job = await jobBook(5);
    const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
    const day = job.frame.plan.days.find(d => d.day === 5)!;
    const planned = day.pages.find(p => p.parts.some(part => part.reviews?.some(r => r.skill === "5.9-distributive" && r.step === 1)))!;
    const pages = book.pages.filter(p => (p.print_contract as { day: number | null }).day === 5).sort((a, b) => a.page_number - b.page_number);
    const printed = pages[planned.number - 1];
    expect(printed).toBeDefined();
    const actual = book.questions.filter(q => q.page_id === printed.id).map(q => q.teaching as { part: string; itemStep: { skill: string; step: number } | null });
    expect(actual.filter(t => t.part === "remember-these" && t.itemStep?.skill === "5.9-distributive" && t.itemStep.step === 1)).toHaveLength(0);
  }, 120000);
});
