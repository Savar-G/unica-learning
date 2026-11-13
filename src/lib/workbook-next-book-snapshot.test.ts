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
import { book2Planning, jsonHash } from "./workbook-book1-baseline";
import { curriculumStructure, curriculumStructureOf, curriculumVersion } from "./workbook-curriculum";
import type { CurriculumCompatSource } from "./workbook-curriculum/compat";
import type { CurriculumData } from "./workbook-curriculum/types";
import { planLevel, planWorkbook } from "./workbook-plan";
import { sourceHash } from "./workbook-progress-hash";
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
    // #476: the worker plans again from the saved (jsonb) input and must find the saved hash (nextBookRunBook).
    const stored = JSON.parse(JSON.stringify(result.planningInput));
    const again = planWorkbook(stored);
    expect(again.ok && sourceHash(JSON.parse(JSON.stringify({ planningInput: stored, plan: again.plan })))).toBe(result.planHash);
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

describe("next book after a curriculum change", () => {
  // The curriculum now has another fingerprint than Book 1's; `structure` is today's structure, and the archive holds
  // Book 1's. Each case runs the real planner on today's data through the public planning functions.
  const LATER = "f".repeat(28);
  const changedTo = (frozenVersion: string, structure: () => ReturnType<typeof curriculumStructure>): CurriculumCompatSource =>
    ({ version: () => LATER, structure, frozen: (key, version) => (version === frozenVersion ? curriculumStructure(key) : null) });
  const edit = (change: (d: { levels: { id: string; units: string[] }[]; skills: { id: string; unit: string; order: number; position: string }[];
    steps: { skill: string; number: number; position: string }[] }) => void) => {
    const d = structuredClone(BC_CURRICULUM);
    change(d as unknown as Parameters<typeof change>[0]);
    return curriculumStructureOf(d as CurriculumData);
  };

  it("plans the same next book after a version-label change, and refuses a structural change or an unknown version", async () => {
    const job = await jobBook(5), { baseline, record } = baselineOf(job);
    const frozen = baseline.planning.placement.curriculum.version;
    expect(frozen).toBe(curriculumVersion("bc"));
    // Unchanged curriculum: the same answer as before this rule, with or without the seam.
    const today = book2Planning(baseline), prepared = book2Planning(baseline, { prepareOnly: true });
    expect(today.ok && prepared.ok, JSON.stringify([today, prepared])).toBe(true);
    expect(book2Planning(baseline, { curricula: { version: curriculumVersion, structure: () => { throw Error("not read"); }, frozen: () => null } })).toEqual(today);

    // Version-label change only: this seam does not change templates, which can affect the planned questions.
    const templates = changedTo(frozen, () => curriculumStructure("bc"));
    expect(book2Planning(baseline, { curricula: templates })).toEqual(today);
    expect(book2Planning(baseline, { prepareOnly: true, curricula: templates })).toEqual(prepared);

    const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
    for (const e of printedItems(book).filter(e => e.day <= 7 && e.mastery.eligible)) mark(book, e, "right");
    const sources = frozenOf(book, record, []);
    const snapshot = { id: id(99992), workbookId: book.book.id, cutoff: Date.parse("2026-11-17T00:00:00Z"), scope: "day7" as const,
      issuedSkills: [...new Set(baseline.initialIssues.map(i => i.selection.skill))] };
    const unchanged = planNextBookFromSnapshot({ sources, snapshot });
    expect(unchanged.ok, JSON.stringify(unchanged)).toBe(true);
    // The saved plan records the curriculum it was planned on: today's version, not Book 1's label.
    if (!unchanged.ok) return;
    expect(unchanged.planningInput.curriculum).toEqual({ key: "bc", version: curriculumVersion("bc") });
    const relabelled = planNextBookFromSnapshot({ sources, snapshot }, { curricula: templates });
    expect(relabelled.ok, JSON.stringify(relabelled)).toBe(true);
    if (!relabelled.ok) return;
    expect(relabelled.planningInput.curriculum).toEqual({ key: "bc", version: LATER });
    expect(relabelled.planHash).not.toBe(unchanged.planHash);
    const unlabelled = (r: typeof unchanged & { ok: true }) => ({ ...r, planHash: "", planningInput: { ...r.planningInput, curriculum: undefined } });
    expect(unlabelled(relabelled)).toEqual(unlabelled(unchanged));

    // Structural changes: each is refused with its first difference, by both planning paths.
    const issued = baseline.initialIssues.map(i => i.selection).find(s => s.step === 2)!;
    expect(issued).toBeDefined();
    const cases: [string, ReturnType<typeof curriculumStructure>, RegExp][] = [
      ["unit 5.16 before 5.2 in U18", edit(d => {
        const level = d.levels.find(l => l.id === "U18")!;
        level.units = ["5.16", ...level.units.filter(u => u !== "5.16")];
        let order = 0;
        level.units.forEach((unit, u) => d.skills.filter(s => s.unit === unit).sort((a, b) => a.order - b.order).forEach((skill, k) => {
          skill.order = ++order; skill.position = `U18.${u + 1}.${k + 1}`;
          for (const step of d.steps.filter(x => x.skill === skill.id)) step.position = `${skill.position}.${step.number}`;
        }));
      }), /^level U18 has units \[5\.16, 5\.2,/],
      ["an issued skill removed", edit(d => {
        d.skills = d.skills.filter(s => s.id !== issued.skill);
        d.steps = d.steps.filter(s => s.skill !== issued.skill);
      }), new RegExp(`^unit ${issued.unit.replace(".", "\\.")} has skills`)],
      ["an issued step renumbered", edit(d => {
        const steps = d.steps.filter(s => s.skill === issued.skill && s.number >= issued.step).sort((a, b) => b.number - a.number);
        for (const s of steps) { s.number++; s.position = s.position.replace(/\.\d+$/, `.${s.number}`); }
      }), new RegExp(`^skill ${issued.skill.replace(".", "\\.")} has steps`)],
    ];
    for (const [name, structure, difference] of cases) {
      const result = book2Planning(baseline, { curricula: changedTo(frozen, () => structure) });
      expect(result, name).toMatchObject({ ok: false, reason: "curriculum-incompatible", difference: expect.stringMatching(difference) });
      const planned = planNextBookFromSnapshot({ sources, snapshot }, { curricula: changedTo(frozen, () => structure) });
      expect(planned, name).toMatchObject({ ok: false, reason: expect.stringMatching(/^The curriculum changed since Book 1 was planned: /) });
    }

    // A frozen version the archive does not hold, with the committed archive.
    const unknown = structuredClone(baseline);
    unknown.planning.placement.curriculum.version = LATER.replace(/f/g, "e");
    expect(book2Planning(unknown)).toEqual({ ok: false, reason: "curriculum-history-missing" });
    expect(book2Planning(baseline, { curricula: { ...changedTo(frozen, () => curriculumStructure("bc")), frozen: () => null } }))
      .toEqual({ ok: false, reason: "curriculum-history-missing" });
    expect(planNextBookFromSnapshot({ sources, snapshot }, { curricula: { ...templates, frozen: () => null } }))
      .toEqual({ ok: false, reason: "The curriculum Book 1 was planned on is not in the curriculum history." });
  }, 300000);
});
