import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { baselineOf, frozenOf, id, jobBook, mark, parentChange, printedItems, secondTry, shippedBook } from "./workbook-book1.fixture";
import { approvedWorkbook } from "./workbook-ship";
import { nextBookIssuedSkills, planNextBookFromSnapshot } from "./workbook-next-book-snapshot";
import type { Observation } from "./scan-observation";
import type { Json } from "./database";
import { firstObservation } from "./scan-observation";
import { BC_SKILL_MAP } from "./assessment";
import { BC_CURRICULUM, curriculumFromData, curriculumProblems } from "./workbook-curriculum";
import { jsonHash } from "./workbook-book1-baseline";
import { planLevel } from "./workbook-plan";
import { skillUnits } from "./workbook-teaching-frame";

describe("next book from a frozen U16 capture", () => {
  it("cannot recover an unprinted unit's frozen order from the saved structural fields", async () => {
    const job = await jobBook(5), { baseline } = baselineOf(job);
    const original = BC_CURRICULUM;
    const changed = structuredClone(original);
    const level = changed.levels.find(l => l.id === "U18")!;
    // Unit 5.2 is in the real customer's frozen placement facts, but not in the U16 plan or printed skill records.
    expect(level.units[0]).toBe("5.2");
    level.units = ["5.16", ...level.units.filter(u => u !== "5.16")];
    let order = 0;
    level.units.forEach((unit, unitIndex) => {
      const skills = changed.skills.filter(s => s.unit === unit).sort((a, b) => a.order - b.order);
      skills.forEach((skill, skillIndex) => {
        skill.order = ++order;
        skill.position = `${level.id}.${unitIndex + 1}.${skillIndex + 1}`;
        for (const step of changed.steps.filter(s => s.skill === skill.id)) step.position = `${skill.position}.${step.number}`;
      });
    });
    // A valid structural change must differ from the original, while all saved structural evidence stays equal.
    expect(curriculumProblems(original, BC_SKILL_MAP)).toEqual([]);
    expect(curriculumProblems(changed, BC_SKILL_MAP)).toEqual([]);
    const before = curriculumFromData(original), after = curriculumFromData(changed);
    expect(after.level("U18")!.units.indexOf("5.2")).not.toBe(before.level("U18")!.units.indexOf("5.2"));
    expect(after.skill("5.2-decimal-place-value")!.order).not.toBe(before.skill("5.2-decimal-place-value")!.order);
    expect(baseline.binding.levels).toEqual([16]);
    expect(baseline.curriculum.skills.some(s => s.skill.unit === "5.2")).toBe(false);
    expect(skillUnits(before)).toEqual(job.frame.units);
    expect(planLevel(before, "U16")).toEqual(baseline.planning.input.level);
    const evidence = (c: typeof before) => ({ units: skillUnits(c), level: planLevel(c, "U16"),
      skills: baseline.curriculum.skills.map(s => ({ skill: c.skill(s.skill.id), steps: c.skillSteps(s.skill.id) })) });
    expect(jsonHash(evidence(after))).toBe(jsonHash(evidence(before)));
  }, 120000);

  it("uses printed review marks, holds missing work and makes a stable plan", async () => {
    const job = await jobBook(5), { baseline, record } = baselineOf(job);
    const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
    const all = printedItems(book).filter(e => e.day <= 7 && e.mastery.eligible);
    const area = all.filter(e => e.teaching?.itemStep?.skill === "3.9-area-square-units" && e.teaching.itemStep.step === 4);
    const wrong = all.find(e => e.teaching?.itemStep?.skill === "4.1-expanded-form")!;
    const helped = all.find(e => e.teaching?.itemStep?.skill === "4.10-relationship")!;
    const later = printedItems(book).find(e => e.day >= 8 && e.mastery.eligible)!;
    const afterCutoff = all.find(e => e.teaching?.itemStep?.skill === "4.4-subtract-within-10000")!;
    const pending = all.find(e => {
      const question = book.questions.find(q => q.page_id === e.identity.pageId && q.question_number === e.number);
      const teaching = question?.teaching as import("./workbook-print-contract").TeachingContext | null;
      return teaching?.plannedStep && teaching.itemStep?.skill === teaching.plannedStep.skill;
    })!;
    expect(pending).toBeDefined();
    expect(area.length).toBeGreaterThan(0); expect(wrong).toBeDefined(); expect(helped).toBeDefined(); expect(later).toBeDefined(); expect(afterCutoff).toBeDefined();
    const areaMarks = area.map(e => mark(book, e, "right"));
    parentChange(book, areaMarks[0], "wrong", "2026-11-18T00:00:00.000Z");
    const wrongMark = mark(book, wrong, "wrong");
    const tries: import("./workbook-correction-journal").SecondTryRow[] = [];
    const corrected = secondTry(tries, book, wrongMark, "right", "2026-11-13T00:00:00.000Z");
    mark(book, later, "right");
    mark(book, afterCutoff, "right", "2026-11-18T00:00:00.000Z");
    const pendingMark = mark(book, pending, "right");
    book.events = book.events.filter(e => e.id !== pendingMark.event_id);
    pendingMark.observation = firstObservation(pending, id(30099)) as unknown as Json;
    pendingMark.result_version = 1; pendingMark.event_id = null; pendingMark.original_event = null;
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
    const pendingKey = JSON.stringify([pending.identity.workbookId, pending.identity.printedRevision, pending.identity.pageId, pending.identity.itemId]);
    expect(result.consumed.some(item => item.key === pendingKey)).toBe(false);
    expect(result.held).toEqual(expect.arrayContaining([expect.objectContaining({ key: pendingKey, version: 1, reason: "not marked" })]));
    const areaKey = JSON.stringify([area[0].identity.workbookId, area[0].identity.printedRevision, area[0].identity.pageId, area[0].identity.itemId]);
    expect(result.consumed).toEqual(expect.arrayContaining([expect.objectContaining({ key: areaKey, effectiveVersion: 2 })]));
    expect(result.held).toEqual(expect.arrayContaining([expect.objectContaining({ key: `${areaKey}:version:3`, version: 3, reason: "changed after the snapshot" })]));
    expect(result.held.filter(item => item.key !== null).some(item => result.consumed.some(used => used.key === item.key))).toBe(false);
    const shuffled = structuredClone(sources);
    for (const b of shuffled.books) { b.pages.reverse(); b.questions.reverse(); b.items.reverse(); b.changes.reverse(); b.events.reverse(); }
    expect(planNextBookFromSnapshot({ sources: shuffled, snapshot: { ...snapshot, issuedSkills: [...snapshot.issuedSkills].reverse() } })).toEqual(result);
    expect(planNextBookFromSnapshot({ sources, snapshot })).toEqual(result);
    const refreshed = planNextBookFromSnapshot({ sources, snapshot: { ...snapshot, scope: "later-book" } });
    expect(refreshed.ok, JSON.stringify(refreshed)).toBe(true);
    if (refreshed.ok) {
      const key = JSON.stringify([later.identity.workbookId, later.identity.printedRevision, later.identity.pageId, later.identity.itemId]);
      expect([...refreshed.consumed, ...refreshed.held].some(item => item.key === key)).toBe(true);
    }
    expect(planNextBookFromSnapshot({ sources, snapshot: { ...snapshot, issuedSkills: snapshot.issuedSkills.slice(1) } })).toMatchObject({ ok: false, reason: "A printed skill is missing from the snapshot." });
    expect(nextBookIssuedSkills(sources)).toEqual([...snapshot.issuedSkills].sort());
    expect(nextBookIssuedSkills({ ...structuredClone(sources), book1: undefined } as unknown as typeof sources)).toBeNull();
    const noMarks = structuredClone(sources);
    noMarks.books[0].items = []; noMarks.books[0].changes = []; noMarks.books[0].events = [];
    noMarks.book1!.corrections.rows = []; noMarks.book1!.corrections.count = 0;
    expect(planNextBookFromSnapshot({ sources: noMarks, snapshot })).toMatchObject({ ok: false, reason: "The selected days have no marked scans." });
    const broken = structuredClone(sources); broken.book1!.corrections.count++;
    expect(planNextBookFromSnapshot({ sources: broken, snapshot })).toMatchObject({ ok: false, reason: "The correction history is incomplete." });
  }, 120000);
});
