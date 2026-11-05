import { describe, expect, it } from "vitest";
import type { Item, QuestionPackage } from "@/lib/question-package";
import {
  expectedItems,
  firstObservation,
  markingEvent,
  masteryDecision,
  MAX_READ_TEXT,
  observationProblem,
  OBSERVATION_VERSION,
  pageCompletion,
  type ExpectedItem,
  type MarkResult,
  type Observation,
} from "@/lib/scan-observation";
import type { TeachingContext } from "@/lib/workbook-print-contract";

// The observation and completion contract through its public functions. Each test names what would disprove it.

const STEP = { unit: "U1", skill: "add-within-20", step: 2 };

const item = (o: Partial<Item> = {}): Item => ({
  format: "write-number", scorable: true, parentChecked: false, checks: [], error: null,
  regions: [{ id: "a", kind: "box", label: null, answer: { type: "number", value: 12 } }], ...o,
});

const pkg = (id: string, o: Partial<Item> = {}): QuestionPackage => ({ id, item: item(o) } as unknown as QuestionPackage);

const teaching = (o: { practiceType?: string | null; itemStep?: TeachingContext["itemStep"]; eligibility?: Partial<TeachingContext["eligibility"]> } = {}): TeachingContext => ({
  version: 1, curriculum: { key: "bc", version: "v1" }, practiceType: "now-you", part: "practice", slot: "1.1", extra: false, track: "A",
  plannedStep: STEP, itemStep: STEP, reviewSteps: [],
  ...o,
  eligibility: { format: "write-number", scorable: true, parentChecked: false, mastery: true, reason: null, ...o.eligibility },
});

const PARENT_CHECKED = { format: "draw" as const, scorable: false, parentChecked: true, regions: [{ id: "a", kind: "picture" as const, label: null }] };
const UNSCORED = { format: "hands-on" as const, scorable: false, parentChecked: false, regions: [{ id: "a", kind: "lines" as const, label: "Notes" }] };

const page = (questions: { package: QuestionPackage | null; teaching: TeachingContext | null }[], printedRevision = "r".repeat(28)) => expectedItems({
  workbookId: "w", printedRevision, pageId: "p", questions: questions.map((q, i) => ({ number: i + 1, ...q })),
});

const scored = (e: ExpectedItem, result: MarkResult, version = 2): Observation => ({
  ...firstObservation(e, "photo-1"), state: "scored", result, certainty: "certain", readAnswerText: result === "blank" ? "" : "12",
  regions: [{ regionId: "a", text: result === "blank" ? "" : "12", value: result === "blank" ? null : "12", certainty: "certain" }], resultVersion: version,
});

const parentChecked = (e: ExpectedItem, result: MarkResult): Observation => ({ ...firstObservation(e, null), state: "parent-checked", result, actor: "parent", resultVersion: 2 });

describe("page completion", () => {
  it("an all-unscored page completes with no score, once each item has its explicit observation", () => {
    // Disproved if it needs a score, or if having no observation at all counts as finished.
    const items = page([{ package: pkg("a", UNSCORED), teaching: teaching({ eligibility: { format: "hands-on", scorable: false, parentChecked: false, mastery: false, reason: "not-scorable" } }) }, { package: pkg("b", UNSCORED), teaching: null }]);
    expect(pageCompletion(items, []).status).toBe("incomplete");
    const done = pageCompletion(items, items.map((e) => firstObservation(e, null)));
    expect(done).toMatchObject({ status: "complete", finished: 2, total: 2 });
    expect(items.map((e) => firstObservation(e, null).result)).toEqual([null, null]);
  });

  it("a required pending parent check does not complete; the parent's answer does", () => {
    // Disproved if a waiting parent check counts as finished.
    const items = page([{ package: pkg("a"), teaching: teaching() }, { package: pkg("b", PARENT_CHECKED), teaching: null }]);
    const waiting = pageCompletion(items, [scored(items[0], "right"), firstObservation(items[1], null)]);
    expect(waiting.status).toBe("incomplete");
    expect(waiting.items.map((i) => i.progress)).toEqual(["finished", "parent-check"]);
    expect(pageCompletion(items, [scored(items[0], "right"), parentChecked(items[1], "wrong")]).status).toBe("complete");
  });

  it("a mixed page completes only when its scored, parent-checked and unscored items are all terminal", () => {
    // Disproved if any one of the kinds can be skipped.
    const items = page([
      { package: pkg("a"), teaching: teaching() }, { package: pkg("b"), teaching: teaching({ practiceType: "try-first" }) },
      { package: pkg("c", PARENT_CHECKED), teaching: null }, { package: pkg("d", UNSCORED), teaching: null },
    ]);
    const all = [scored(items[0], "wrong"), scored(items[1], "blank"), parentChecked(items[2], "right"), firstObservation(items[3], null)];
    expect(pageCompletion(items, all).status).toBe("complete");
    for (let i = 0; i < all.length; i++) {
      const less = all.filter((_, k) => k !== i);
      const result = pageCompletion(items, less);
      expect(result.status).toBe("incomplete");
      expect(result.items[i].progress).toBe("missing");
    }
  });

  it("reading uncertainty is pending, not blank", () => {
    // Disproved if an uncertain read can finish an item as blank.
    const [e] = page([{ package: pkg("a"), teaching: teaching() }]);
    const uncertain: Observation = { ...firstObservation(e, "photo-1"), certainty: "uncertain", readAnswerText: "1?" };
    expect(observationProblem(uncertain)).toBeNull();
    expect(pageCompletion([e], [uncertain]).items[0].progress).toBe("pending");
    const guessed = { ...scored(e, "blank"), certainty: "uncertain" as const };
    expect(observationProblem(guessed)).toMatch(/uncertain/);
    expect(pageCompletion([e], [guessed]).status).toBe("incomplete");
    expect(markingEvent(e, guessed)).toEqual({ publish: false, reason: "invalid" });
  });

  it("an observation of another revision does not finish this revision's item", () => {
    // Disproved if an old photo's result completes a new revision's page.
    const old = page([{ package: pkg("a"), teaching: teaching() }], "o".repeat(28));
    const now = page([{ package: pkg("a"), teaching: teaching() }], "n".repeat(28));
    expect(pageCompletion(old, [scored(old[0], "right")]).status).toBe("complete");
    expect(pageCompletion(now, [scored(old[0], "right")]).status).toBe("incomplete");
    expect(markingEvent(now[0], scored(old[0], "right"))).toEqual({ publish: false, reason: "other-identity" });
  });

  it("the highest result version is the item's one result, in any order", () => {
    const [e] = page([{ package: pkg("a"), teaching: teaching() }]);
    const first = scored(e, "right", 2), change = { ...scored(e, "wrong", 3), actor: "parent" as const };
    expect(pageCompletion([e], [change, first]).finished).toBe(1);
    const pendingNewer = { ...firstObservation(e, "photo-2"), resultVersion: 4 };
    expect(pageCompletion([e], [first, pendingNewer]).items[0].progress).toBe("pending");
  });

  it("a page with an unavailable question never completes; a page with no items says so", () => {
    const items = page([{ package: null, teaching: null }]);
    expect(pageCompletion(items, [firstObservation(items[0], null)]).status).toBe("incomplete");
    expect(pageCompletion([], []).status).toBe("no-items");
  });
});

describe("eligibility and the marking event", () => {
  it("a scorable Try first item is explicitly excluded from mastery, through to the event", () => {
    // Disproved if `scorable` alone counts it, or if the teaching context's own flag can turn it back on.
    const context = teaching({ practiceType: "try-first", eligibility: { mastery: true, reason: null } });
    expect(masteryDecision(pkg("a"), context)).toEqual({ eligible: false, reason: "try-first" });
    const [e] = page([{ package: pkg("a"), teaching: context }]);
    expect(markingEvent(e, scored(e, "right"))).toEqual({ publish: false, reason: "try-first" });
    expect(pageCompletion([e], [scored(e, "right")]).status).toBe("complete");
  });

  it("a page without trustworthy teaching context cannot publish scored events", () => {
    // Disproved if a legacy or unreadable context publishes. The positive control publishes.
    const [legacy] = page([{ package: pkg("a"), teaching: null }]);
    expect(markingEvent(legacy, scored(legacy, "right"))).toEqual({ publish: false, reason: "no-teaching-context" });
    const [wrongFormat] = page([{ package: pkg("a"), teaching: teaching({ eligibility: { format: "circle" } }) }]);
    expect(markingEvent(wrongFormat, scored(wrongFormat, "right"))).toEqual({ publish: false, reason: "context-mismatch" });
    const [good] = page([{ package: pkg("a"), teaching: teaching() }]);
    expect(markingEvent(good, scored(good, "right"))).toEqual({
      publish: true, key: `marking:${"w"}:${"r".repeat(28)}:p:a`, result: "right", step: STEP,
    });
  });

  it("a review item with no item step stays excluded", () => {
    // Disproved if a planned or review-list step stands in for the step it really tests (#597 fixes the data later).
    const context = teaching({ itemStep: null, eligibility: { mastery: false, reason: "no-item-step" } });
    expect(masteryDecision(pkg("a"), context)).toEqual({ eligible: false, reason: "no-item-step" });
    const [e] = page([{ package: pkg("a"), teaching: context }]);
    expect(markingEvent(e, scored(e, "wrong"))).toEqual({ publish: false, reason: "no-item-step" });
  });

  it("a parent-checked item stores the judgment, and counts only when its printed context permits it", () => {
    // Disproved if a parent's judgment changes mastery by default.
    const off = teaching({ eligibility: { format: "draw", scorable: false, parentChecked: true, mastery: false, reason: "parent-checked" } });
    const [e] = page([{ package: pkg("a", PARENT_CHECKED), teaching: off }]);
    expect(e.mastery).toEqual({ eligible: false, reason: "parent-checked" });
    expect(markingEvent(e, parentChecked(e, "right"))).toEqual({ publish: false, reason: "parent-checked" });
    const allowed = teaching({ eligibility: { format: "draw", scorable: false, parentChecked: true, mastery: true, reason: null } });
    const [yes] = page([{ package: pkg("a", PARENT_CHECKED), teaching: allowed }]);
    expect(markingEvent(yes, parentChecked(yes, "right"))).toMatchObject({ publish: true, result: "right" });
    expect(markingEvent(yes, firstObservation(yes, null))).toEqual({ publish: false, reason: "not-terminal" });
  });

  it("a written reason and an unscored activity never count", () => {
    const written = { format: "written-reason" as const, scorable: false, parentChecked: true, regions: [{ id: "a", kind: "lines" as const, label: "Why" }] };
    expect(masteryDecision(pkg("a", written), teaching({ eligibility: { format: "written-reason", scorable: false, parentChecked: true, mastery: true } }))).toEqual({ eligible: false, reason: "written-reason" });
    expect(masteryDecision(pkg("a", UNSCORED), teaching({ eligibility: { format: "hands-on", scorable: false, parentChecked: false, mastery: true } }))).toEqual({ eligible: false, reason: "not-scorable" });
  });

  it("the decision reads the expected item, so a stored observation cannot make itself eligible", () => {
    const [e] = page([{ package: pkg("a"), teaching: null }]);
    const claims = { ...scored(e, "right"), mastery: { eligible: true, reason: null } };
    expect(markingEvent(e, claims)).toEqual({ publish: false, reason: "no-teaching-context" });
  });

  it("a pending item publishes nothing, and the event key stays the same across scans", () => {
    const [e] = page([{ package: pkg("a"), teaching: teaching() }]);
    expect(markingEvent(e, firstObservation(e, "photo-1"))).toEqual({ publish: false, reason: "not-terminal" });
    const one = markingEvent(e, { ...scored(e, "right"), evidence: { photoRevision: "photo-1" } });
    const two = markingEvent(e, { ...scored(e, "right"), evidence: { photoRevision: "photo-2" } });
    expect(one).toEqual(two);
  });
});

describe("the observation's shape", () => {
  const [e] = page([{ package: pkg("a"), teaching: teaching() }]);

  it("holds the public fields, and refuses what the contract forbids", () => {
    // Disproved if any of these shapes is accepted.
    const good = scored(e, "wrong");
    expect(good).toMatchObject({ version: OBSERVATION_VERSION, identity: { workbookId: "w", pageId: "p", itemId: "a" }, evidence: { photoRevision: "photo-1" }, method: "code", actor: "system" });
    expect(observationProblem(good)).toBeNull();
    expect(observationProblem({ ...good, readAnswerText: "x".repeat(MAX_READ_TEXT + 1) })).toMatch(/limit/);
    expect(observationProblem({ ...good, regions: [{ regionId: "a", text: "x".repeat(MAX_READ_TEXT + 1), value: null, certainty: "certain" }] })).toMatch(/limit/);
    expect(observationProblem({ ...good, result: null })).toMatch(/result/);
    expect(observationProblem({ ...firstObservation(e, null), result: "right" })).toMatch(/result/);
    expect(observationProblem({ ...good, readAnswerText: null })).toMatch(/read/);
    expect(observationProblem({ ...good, resultVersion: 0 })).toMatch(/version/);
    expect(observationProblem({ ...good, identity: { ...good.identity, printedRevision: "" } })).toMatch(/identity/);
    expect(observationProblem({ ...good, method: "parent" })).toMatch(/code/);
  });

  it("keeps a null reading as null, and empty text only for an empty answer", () => {
    // A blank result has empty text; an unreadable answer has null text and stays pending.
    const blank = scored(e, "blank");
    expect([blank.readAnswerText, observationProblem(blank)]).toEqual(["", null]);
    const unreadable: Observation = { ...firstObservation(e, "photo-1"), readAnswerText: null, regions: [{ regionId: "a", text: null, value: null, certainty: "uncertain" }], certainty: "uncertain" };
    expect(observationProblem(unreadable)).toBeNull();
    expect(pageCompletion([e], [unreadable]).status).toBe("incomplete");
  });
});
