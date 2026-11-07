import { describe, expect, it } from "vitest";
import { deriveWorkbookProgress, type IssuedProgressDecision, type ProgressCause, type ProgressCurriculum,
  type ProgressHistory, type ProgressOriginal, type ProgressSampleItem, type ProgressSnapshot,
  type WorkbookProgressDecision } from "./workbook-progress";

// Every fixture is synthetic. The curriculum references establish causes; no answer text does.
function fixture(right = 80, total = 100, step = 2) {
  const curriculum: ProgressCurriculum = {
    key: "bc", version: "synthetic-curriculum-v1", skill: { id: "synthetic-skill", unit: "S.1", curriculum: "bc" },
    steps: [1, 2, 3].map(number => ({
      curriculum: "bc", skill: "synthetic-skill", number, position: `S.1.${number}`, name: "Synthetic step",
      change: "Synthetic change", rules: "Synthetic rules", example: { problem: "6 + 7", answer: "13" },
      pages: 1, representation: "number line", mistakes: [
        { answer: "56", why: "Synthetic established concept", kind: "conceptual", misconception: "SYNTHETIC-C1" },
        { answer: "12", why: "Synthetic established concept two", kind: "conceptual", misconception: null },
      ], spotTheError: { wrong: "Synthetic wrong", fix: "Synthetic fix" }, arithmetic: "checked",
    })),
  };
  const snapshot: ProgressSnapshot = {
    version: 1, id: "snapshot", parentId: "parent", childId: "child", cutoff: 1_000,
    curriculum: { key: curriculum.key, version: curriculum.version },
    selection: { unit: "S.1", skill: "synthetic-skill", step, approvalReference: "synthetic-test-only-approval" },
    scope: [{ workbookId: "book", printedRevision: "print-v1", days: [1, 2, 3, 4, 5, 6, 7] }],
    requiredSample: [], reviews: [{ skill: "synthetic-skill", step: 1, interval: 2, due: 8 }],
    missedReviews: [{ skill: "synthetic-skill", step: 1, interval: 0, due: -1 }],
  };
  const sample: ProgressSampleItem[] = [], originals: ProgressOriginal[] = [];
  for (let n = 0; n < total; n++) {
    const expected: ProgressSampleItem["expected"] = {
      identity: { workbookId: "book", printedRevision: "print-v1", pageId: `page-${n}`, itemId: `item-${n}` },
      number: 1, method: "code", scoredRegions: ["answer"], mastery: { eligible: true, reason: null },
      teaching: { curriculum: snapshot.curriculum, part: "now-you", slot: `slot-${n}`, practiceType: "now-you",
        itemStep: { unit: "S.1", skill: "synthetic-skill", step } },
    };
    sample.push({ expected, contextVersion: 1, day: 1, question: { source: "workbook", workbookId: "book", page: n + 1, question: 1 }, resultVersion: 1 });
    originals.push({ parentId: "parent", childId: "child", day: 1,
      first: { at: 100, provenance: { eventId: `event-${n}`, model: "synthetic-reader-v1", prompt: "synthetic-prompt-v1" },
        observation: { version: 1, identity: expected.identity, evidence: { photoRevision: "photo-v1" },
          readAnswerText: n < right ? "13" : "56", regions: [{ regionId: "answer", text: n < right ? "13" : "56", value: n < right ? "13" : "56", certainty: "certain" }],
          certainty: "certain", state: "scored", method: "code", result: n < right ? "right" : "wrong",
          teaching: expected.teaching, mastery: expected.mastery, help: "none", actor: "system", resultVersion: 1 } },
      changes: [], secondTries: [], cause: { kind: "unknown" },
    });
  }
  snapshot.requiredSample = sample;
  const history: ProgressHistory = { version: 1, originals, issuedDecisions: [] };
  return { snapshot, curriculum, history, sample, originals };
}
type Fixture = ReturnType<typeof fixture>;
function decision(f: Fixture): WorkbookProgressDecision {
  const result = deriveWorkbookProgress(f.snapshot, f.curriculum, f.history);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.decision;
}
function establish(f: Fixture, kind: "careless" | "conceptual", indices = f.originals.map((_, n) => n).filter(n => f.originals[n].first.observation.result === "wrong")) {
  for (const n of indices) f.originals[n].cause = kind === "careless"
    ? { kind, evidenceId: `established-${n}`, resultVersion: 1 }
    : { kind, evidenceId: `established-${n}`, resultVersion: 1, mistake: { stepPosition: `S.1.${f.snapshot.selection.step}`, index: 0 } };
}
function issued(f: Fixture, actions: IssuedProgressDecision["action"][]) {
  f.history.issuedDecisions = actions.map((action, n) => ({ version: 1, id: `issued-${n}`, workbookId: `prior-book-${n}`,
    parentId: "parent", childId: "child", issuedAt: n + 1, curriculum: f.snapshot.curriculum,
    selection: { unit: "S.1", skill: "synthetic-skill", step: f.snapshot.selection.step }, action }));
}
function correctOriginal(f: Fixture, n: number, result: "right" | "wrong" | "blank") {
  const change = structuredClone(f.originals[n].first);
  change.at = 200;
  change.provenance = { eventId: `parent-change-${n}`, model: null, prompt: null };
  change.observation = { ...change.observation, state: "parent-checked", method: "parent", actor: "parent",
    result, resultVersion: 2, evidence: null, readAnswerText: null, regions: [], certainty: "not-read" };
  f.originals[n].changes = [change];
  f.sample[n].resultVersion = 2;
}
function freeze(v: unknown) {
  if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(freeze); }
}

describe("deriveWorkbookProgress: complete distributions and targets", () => {
  it.each([
    [74, "retain-review", 2, "unknown-cause", 0],
    [75, "repeat-new-numbers", 2, "practice", 1],
    [89, "repeat-new-numbers", 2, "practice", 1],
    [90, "advance", 3, "mastered", 0],
  ] as const)("uses exactly %i independent first successes out of 100", (right, action, target, reason, repeatIncrement) => {
    const d = decision(fixture(right));
    expect(d).toMatchObject({ version: 1, status: "complete", action, target: { step: target }, reason, repeatIncrement,
      score: { required: 100, resolved: 100, independentFirstRight: right, percent: right } });
    expect(d.misses).toHaveLength(100 - right);
    expect(d.items.filter(x => x.unresolved)).toHaveLength(100 - right);
    expect(d.items.find(x => x.identity.itemId === `item-${right}`)).toMatchObject({ unresolved: true,
      first: { observation: { result: "wrong", readAnswerText: "56" }, provenance: { eventId: `event-${right}` } } });
    expect(d.passed).toEqual({ "synthetic-skill": right >= 90 ? 2 : 1 });
    expect(d.representation).toEqual({ current: "number line", request: "keep", maya: false });
  });

  it("uses established concepts for regression and three occurrences for focused practice", () => {
    const f = fixture(74); establish(f, "conceptual", [74, 75, 76]);
    const d = decision(f);
    expect(d).toMatchObject({ action: "regress-represent", target: { step: 1 }, reason: "conceptual", repeatIncrement: 0,
      representation: { request: "another" } });
    expect(d.focusedPractice).toEqual([{ stepPosition: "S.1.2", mistakeIndex: 0, misconception: "SYNTHETIC-C1", occurrences: 3,
      keys: d.items.filter(x => ["item-74", "item-75", "item-76"].includes(x.identity.itemId)).map(x => x.key) }]);
    expect(d.misses.find(m => m.event === "event-74")).toMatchObject({ mistake: "SYNTHETIC-C1", question: { page: 75 } });
  });
  it("regresses with two established concepts without focused practice", () => {
    const f = fixture(74); establish(f, "conceptual", [74, 75]);
    expect(decision(f)).toMatchObject({ action: "regress-represent", focusedPractice: [] });
  });
  it("uses check-your-work only when every non-right cause is established careless", () => {
    const f = fixture(74); establish(f, "careless");
    expect(decision(f)).toMatchObject({ action: "repeat-check-work", target: { step: 2 }, reason: "careless", repeatIncrement: 1 });
    f.originals[99].cause = { kind: "unknown" };
    expect(decision(f)).toMatchObject({ action: "retain-review", reason: "unknown-cause", repeatIncrement: 0 });
  });
  it("does not infer a cause from a matching wrong answer", () => {
    const f = fixture(0, 3);
    expect(decision(f)).toMatchObject({ action: "retain-review", focusedPractice: [], target: { step: 2 } });
    expect(decision(f).items.every(x => x.cause.kind === "unknown")).toBe(true);
  });
  it("retains step 1 on regression and reports completion at the final step", () => {
    const first = fixture(0, 2, 1); establish(first, "conceptual");
    expect(decision(first)).toMatchObject({ action: "regress-represent", target: { step: 1 }, representation: { request: "another" } });
    expect(decision(fixture(90, 100, 3))).toMatchObject({ action: "skill-complete", target: { step: 3 }, passed: { "synthetic-skill": 3 } });
  });
});

describe("required frozen evidence", () => {
  it("retains unfinished work at an observed 100 percent with an unscanned required item", () => {
    const f = fixture(2, 2); f.history.originals = [f.originals[0]]; f.sample[1].resultVersion = null;
    issued(f, ["repeat", "repeat"]);
    const d = decision(f);
    expect(d).toMatchObject({ status: "insufficient-evidence", action: "retain-unfinished", target: { step: 2 },
      repeatIncrement: 0, score: { required: 2, resolved: 1, independentFirstRight: 1, percent: null } });
    expect(d.items.find(x => x.identity.itemId === "item-1")).toMatchObject({ status: "missing", first: null, unresolved: false });
  });
  it.each(["sample", "empty-sample", "context", "context-version"])("does not decide mastery without %s", missing => {
    const f = fixture(1, 1);
    if (missing === "sample" || missing === "empty-sample") {
      f.snapshot.requiredSample = missing === "sample" ? null : []; f.history.originals = [];
    } else if (missing === "context") {
      f.sample[0].expected.teaching = null; f.originals[0].first.observation.teaching = null;
    } else f.sample[0].contextVersion = null;
    expect(decision(f)).toMatchObject({ status: "insufficient-evidence", action: "retain-unfinished", target: { step: 2 }, repeatIncrement: 0 });
  });
  it.each(["pending", "uncertain"])("keeps the sample incomplete for %s evidence", state => {
    const f = fixture(1, 2), o = f.originals[1].first.observation;
    o.state = "pending"; o.result = null; o.certainty = state === "uncertain" ? "uncertain" : "not-read";
    o.readAnswerText = null; o.regions = []; o.issue = "blurry";
    expect(decision(f)).toMatchObject({ status: "insufficient-evidence", action: "retain-unfinished", focusedPractice: [], repeatIncrement: 0 });
    expect(decision(f).items.find(x => x.identity.itemId === "item-1")).toMatchObject({ status: "pending", cause: { kind: "unknown" } });
  });
  it("keeps resolved misses while other required work remains unscanned", () => {
    const f = fixture(0, 2); f.history.originals = [f.originals[0]];
    const d = decision(f);
    expect(d.action).toBe("retain-unfinished");
    expect(d.misses).toEqual([{ skill: "synthetic-skill", question: { source: "workbook", workbookId: "book", page: 1, question: 1 },
      event: "event-0", result: "wrong", mistake: null, stuckStep: null }]);
    expect(d.items.find(x => x.identity.itemId === "item-1")?.status).toBe("missing");
  });
  it("counts a confirmed blank as resolved non-right without an invented cause", () => {
    const f = fixture(3, 4), o = f.originals[3].first.observation;
    o.result = "blank"; o.readAnswerText = ""; o.regions[0].text = ""; o.regions[0].value = null;
    expect(decision(f)).toMatchObject({ status: "complete", action: "repeat-new-numbers", score: { percent: 75 } });
    expect(decision(f).misses[0]).toMatchObject({ result: "blank", event: "event-3", mistake: null });
  });
  it("excludes Try first, unscored, and ineligible parent checks", () => {
    const f = fixture(1, 4);
    for (let n = 1; n < 4; n++) {
      const e = f.sample[n].expected;
      e.mastery = { eligible: false, reason: n === 1 ? "try-first" : n === 2 ? "not-scorable" : "parent-checked" };
      if (n === 1) e.teaching!.practiceType = "try-first";
      if (n === 2) e.method = "unscored";
      if (n === 3) e.method = "parent";
      f.sample[n].resultVersion = null;
    }
    f.history.originals = [f.originals[0]];
    const d = decision(f);
    expect(d).toMatchObject({ action: "advance", score: { required: 1, resolved: 1, percent: 100 }, misses: [] });
    expect(d.items.filter(x => x.status === "excluded")).toHaveLength(3);
  });
  it("admits a frozen eligible parent check without requiring a photo reading", () => {
    const f = fixture(1, 1), e = f.sample[0].expected, o = f.originals[0].first.observation;
    e.method = "parent"; o.method = "parent"; o.state = "parent-checked"; o.actor = "parent";
    o.certainty = "not-read"; o.readAnswerText = null; o.regions = []; o.evidence = null;
    expect(decision(f)).toMatchObject({ action: "advance", score: { percent: 100 } });
  });
});

describe("first score, effective original, and later work", () => {
  it("corrects the effective original score but preserves its first saved wrong score and reading", () => {
    const f = fixture(3, 4); correctOriginal(f, 3, "right");
    const d = decision(f);
    expect(d).toMatchObject({ action: "advance", target: { step: 3 }, score: { percent: 100 }, misses: [] });
    expect(d.items.find(x => x.identity.itemId === "item-3")).toMatchObject({ unresolved: false,
      first: { observation: { result: "wrong", readAnswerText: "56", resultVersion: 1 }, provenance: { model: "synthetic-reader-v1" } },
      effective: { observation: { result: "right", resultVersion: 2, actor: "parent", readAnswerText: null } } });
    expect(d.consumed.find(x => x.key.includes("item-3"))).toMatchObject({ firstVersion: 1, effectiveVersion: 2 });
  });
  it.each(["math-help", "none"] as const)("keeps a successful %s second try separate from the effective original", help => {
    const f = fixture(3, 4);
    f.originals[3].secondTries = [{ id: "try-2", at: 300, basedOnResultVersion: 1, result: "right", help }];
    const d = decision(f);
    expect(d).toMatchObject({ action: "repeat-new-numbers", score: { percent: 75 }, misses: [] });
    expect(d.items.find(x => x.identity.itemId === "item-3")).toMatchObject({ unresolved: false,
      first: { observation: { result: "wrong" } }, effective: { observation: { result: "wrong", resultVersion: 1 } },
      secondTries: [{ id: "try-2", help }] });
  });
  it.each(["math-help", "unknown"] as const)("does not turn a first right with %s help into independent mastery", help => {
    const f = fixture(4, 4); f.originals[3].first.observation.help = help;
    const d = decision(f);
    expect(d).toMatchObject({ action: "repeat-new-numbers", score: { percent: 75 } });
    expect(d.misses).toEqual([expect.objectContaining({ event: "event-3", result: "right_with_help" })]);
    expect(d.items.find(x => x.identity.itemId === "item-3")?.unresolved).toBe(true);
  });
  it("restores an unresolved miss when a parent changes a right original to wrong", () => {
    const f = fixture(4, 4); correctOriginal(f, 3, "wrong");
    const d = decision(f);
    expect(d).toMatchObject({ action: "repeat-new-numbers", target: { step: 2 }, score: { percent: 75 } });
    expect(d.misses).toEqual([expect.objectContaining({ event: "event-3", result: "wrong" })]);
    expect(d.items.find(x => x.identity.itemId === "item-3")?.effective?.observation.resultVersion).toBe(2);
  });
  it("retains an older second try without letting it cancel a later wrong original mark", () => {
    const f = fixture(3, 4);
    f.originals[3].secondTries = [{ id: "earlier-fix", at: 150, basedOnResultVersion: 1, result: "right", help: "math-help" }];
    correctOriginal(f, 3, "wrong");
    const d = decision(f);
    expect(d).toMatchObject({ action: "repeat-new-numbers", score: { percent: 75 } });
    expect(d.misses).toEqual([expect.objectContaining({ event: "event-3", result: "wrong" })]);
    expect(d.items.find(x => x.identity.itemId === "item-3")).toMatchObject({ unresolved: true,
      secondTries: [{ id: "earlier-fix", basedOnResultVersion: 1 }], effective: { observation: { resultVersion: 2 } } });
  });
  it("clears the later wrong original only with a try on its effective version", () => {
    const f = fixture(3, 4); correctOriginal(f, 3, "wrong");
    f.originals[3].secondTries = [{ id: "later-fix", at: 300, basedOnResultVersion: 2, result: "right", help: "math-help" }];
    expect(decision(f)).toMatchObject({ score: { percent: 75 }, misses: [] });
  });
  it("does not turn an assisted original into independent success through a parent mark change", () => {
    const f = fixture(3, 4); f.originals[3].first.observation.help = "math-help";
    correctOriginal(f, 3, "right");
    f.originals[3].changes[0].observation.help = "none";
    const d = decision(f);
    expect(d).toMatchObject({ action: "repeat-new-numbers", score: { percent: 75 } });
    expect(d.misses).toEqual([expect.objectContaining({ result: "right_with_help", event: "event-3" })]);
  });
  it("preserves an earlier conceptual cause without applying it to a changed original mark", () => {
    const f = fixture(0, 3); establish(f, "conceptual"); correctOriginal(f, 0, "right"); correctOriginal(f, 1, "wrong");
    const d = decision(f);
    expect(d).toMatchObject({ action: "retain-review", focusedPractice: [], score: { independentFirstRight: 1 } });
    expect(d.items.find(x => x.identity.itemId === "item-1")).toMatchObject({
      cause: { kind: "conceptual", resultVersion: 1 }, effectiveCause: { kind: "unknown" }, unresolved: true,
    });
    expect(d.misses.find(m => m.event === "event-1")?.mistake).toBe(null);
  });
  it("retains the specific wrong reading after image expiry without a photo availability input", () => {
    const f = fixture(0, 1), before = decision(f);
    f.snapshot.cutoff = 100_000_000_000;
    const after = decision(f);
    expect(after.items).toEqual(before.items);
    expect(after.items[0].first).toMatchObject({ observation: { readAnswerText: "56", regions: [{ text: "56", value: "56" }], evidence: { photoRevision: "photo-v1" } },
      provenance: { eventId: "event-0", model: "synthetic-reader-v1", prompt: "synthetic-prompt-v1" } });
    expect(after.misses).toEqual(before.misses);
  });
});

describe("issued repeats and deterministic inputs", () => {
  it.each([0, 1, 2])("uses %i prior issued repeats, irrespective of duplicate photos", count => {
    const f = fixture(80); issued(f, Array.from({ length: count }, () => "repeat" as const));
    f.history.originals = f.originals.flatMap(x => [x, structuredClone(x), structuredClone(x)]);
    const d = decision(f);
    expect(d).toMatchObject({ priorRepeats: count, action: count === 2 ? "change-approach" : "repeat-new-numbers",
      repeatIncrement: count === 2 ? 0 : 1, parentFollowUp: count === 2, target: { step: 2 },
      representation: { request: count === 2 ? "another" : "keep", maya: count === 2 } });
    expect(d.items).toHaveLength(100); expect(d.misses).toHaveLength(20); expect(d.score.percent).toBe(80);
  });
  it("applies the repeat cap to careless-only practice", () => {
    const f = fixture(0, 2); establish(f, "careless"); issued(f, ["repeat", "repeat"]);
    expect(decision(f)).toMatchObject({ action: "change-approach", reason: "repeat-cap", parentFollowUp: true, repeatIncrement: 0 });
  });
  it("ends a repeat sequence at an issued changed approach", () => {
    const f = fixture(80); issued(f, ["repeat", "repeat", "change-approach", "repeat"]);
    expect(decision(f)).toMatchObject({ priorRepeats: 1, action: "repeat-new-numbers" });
  });
  it("accepts exact duplicate issued decisions only once", () => {
    const f = fixture(80); issued(f, ["repeat"]);
    f.history.issuedDecisions = [...f.history.issuedDecisions, structuredClone(f.history.issuedDecisions[0])];
    expect(decision(f).priorRepeats).toBe(1);
  });
  it("preserves valid review inputs and produces the same result from frozen reordered evidence", () => {
    const f = fixture(3, 4), baseline = decision(f);
    f.history.originals = [...f.originals].reverse();
    freeze(f);
    expect(decision(f)).toEqual(baseline);
    expect(baseline.reviews).toEqual(f.snapshot.reviews); expect(baseline.missedReviews).toEqual(f.snapshot.missedReviews);
    baseline.items[0].first!.observation.readAnswerText = "changed output";
    expect(f.originals[0].first.observation.readAnswerText).toBe("13");
  });
  it("preserves caller-validated reviews for another skill without calculating their schedule", () => {
    const f = fixture(1, 1);
    f.snapshot.reviews = [...f.snapshot.reviews, { skill: "other-saved-skill", step: 4, interval: 3, due: 41 }];
    const d = decision(f);
    expect(d.reviews).toEqual(f.snapshot.reviews);
    expect(d.missedReviews).toEqual(f.snapshot.missedReviews);
  });
});

describe("refusal of foreign, conflicting, or unsupported evidence", () => {
  const refusal = (f: Fixture) => {
    const result = deriveWorkbookProgress(f.snapshot, f.curriculum, f.history);
    expect(result.ok).toBe(false); expect(result).not.toHaveProperty("decision");
    expect(JSON.stringify(result)).not.toContain("56");
  };
  it("rejects different submissions for the same original even if one has a newer version", () => {
    const f = fixture(1, 1), conflict = structuredClone(f.originals[0]);
    conflict.first.observation.result = "wrong";
    f.history.originals = [f.originals[0], conflict];
    expect(deriveWorkbookProgress(f.snapshot, f.curriculum, f.history)).toEqual({ ok: false, reason: "conflicting-duplicate" });
    conflict.first.observation.resultVersion = 2; refusal(f);
  });
  it.each(["parent", "child", "book", "revision", "page", "item", "day"])("rejects wrong %s scope", field => {
    const f = fixture(1, 1), r = f.originals[0];
    r.first.observation.identity = { ...r.first.observation.identity };
    if (field === "parent") r.parentId = "other";
    if (field === "child") r.childId = "other";
    if (field === "book") r.first.observation.identity.workbookId = "other";
    if (field === "revision") r.first.observation.identity.printedRevision = "other";
    if (field === "page") r.first.observation.identity.pageId = "other";
    if (field === "item") r.first.observation.identity.itemId = "other";
    if (field === "day") r.day = 8;
    refusal(f);
  });
  it("requires explicit scope before later-book evidence can include Day 8", () => {
    const f = fixture(1, 1); f.sample[0].day = 8; f.originals[0].day = 8;
    refusal(f);
    f.snapshot.scope = [{ workbookId: "book", printedRevision: "print-v1", days: [8] }];
    expect(decision(f).action).toBe("advance");
  });
  it.each(["result", "parent-change", "second-try", "issued"])("rejects a %s after the frozen cutoff", part => {
    const f = fixture(0, 1);
    if (part === "result") f.originals[0].first.at = 1_001;
    if (part === "parent-change") { correctOriginal(f, 0, "right"); f.originals[0].changes[0].at = 1_001; }
    if (part === "second-try") f.originals[0].secondTries = [{ id: "late", at: 1_001, basedOnResultVersion: 1, result: "right", help: "none" }];
    if (part === "issued") { issued(f, ["repeat"]); f.history.issuedDecisions[0].issuedAt = 1_001; }
    refusal(f);
  });
  it.each(["snapshot", "history", "observation", "context", "curriculum", "result-pin", "change-chain"])("rejects an unsupported or mismatched %s version", part => {
    const f = fixture(0, 1);
    if (part === "snapshot") Object.assign(f.snapshot, { version: 2 });
    if (part === "history") Object.assign(f.history, { version: 2 });
    if (part === "observation") f.originals[0].first.observation.version = 2;
    if (part === "context") f.sample[0].contextVersion = 2;
    if (part === "curriculum") f.curriculum.version = "other-version";
    if (part === "result-pin") f.sample[0].resultVersion = 2;
    if (part === "change-chain") { correctOriginal(f, 0, "right"); f.originals[0].changes[0].observation.resultVersion = 3; }
    refusal(f);
  });
  it.each(["mistake-index", "mistake-step", "cause-version", "false-try-first", "foreign-context", "reading-length", "unknown-result"])("rejects malformed %s", part => {
    const f = fixture(0, 1); establish(f, "conceptual");
    const cause = f.originals[0].cause as Extract<ProgressCause, { kind: "conceptual" }>;
    if (part === "mistake-index") cause.mistake.index = 99;
    if (part === "mistake-step") cause.mistake.stepPosition = "other-step";
    if (part === "cause-version") cause.resultVersion = 2;
    if (part === "false-try-first") f.sample[0].expected.teaching!.practiceType = "try-first";
    if (part === "foreign-context") f.sample[0].expected.teaching!.itemStep = { unit: "S.1", skill: "other-skill", step: 2 };
    if (part === "reading-length") f.originals[0].first.observation.readAnswerText = "x".repeat(201);
    if (part === "unknown-result") Object.assign(f.originals[0].first.observation, { result: "invented" });
    refusal(f);
  });
  it("rejects conflicting issued records for one book", () => {
    const f = fixture(1, 1); issued(f, ["repeat", "repeat"]);
    f.history.issuedDecisions[1].workbookId = f.history.issuedDecisions[0].workbookId;
    refusal(f);
  });
  it.each(["same-question", "same-page-id", "same-page-number"])("rejects a frozen sample with conflicting %s mapping", part => {
    const f = fixture(2, 2);
    if (part === "same-question") f.sample[1].question.page = 1;
    if (part === "same-page-id") f.sample[1].expected.identity.pageId = "page-0";
    if (part === "same-page-number") {
      f.sample[1].question.page = 1; f.sample[1].question.question = 2; f.sample[1].expected.number = 2;
    }
    refusal(f);
  });
  it.each(["event", "try", "obsolete-try-version", "review"])("rejects a conflicting or malformed %s contract", part => {
    const f = fixture(0, 2);
    if (part === "event") f.originals[1].first.provenance.eventId = f.originals[0].first.provenance.eventId;
    if (part === "try") for (const r of f.originals) r.secondTries = [{ id: "same-try", at: 150, basedOnResultVersion: 1, result: "right", help: "none" }];
    if (part === "obsolete-try-version") {
      correctOriginal(f, 0, "wrong");
      f.originals[0].secondTries = [{ id: "obsolete", at: 300, basedOnResultVersion: 1, result: "right", help: "none" }];
    }
    if (part === "review") f.snapshot.reviews[0].interval = 4;
    refusal(f);
  });
  it("returns a bounded refusal for malformed runtime JSON", () => {
    expect(deriveWorkbookProgress(null as unknown as ProgressSnapshot, fixture().curriculum, fixture().history))
      .toEqual({ ok: false, reason: "invalid-contract" });
  });
});
