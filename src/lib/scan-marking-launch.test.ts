import { expect, it } from "vitest";
import { MARKING_LAUNCH_ITEMS, SCAN_MARKING_LAUNCH_EVIDENCE, scanMarkingLaunchReadiness, type MarkingLaunchCandidate, type MarkingLaunchEvidence } from "./scan-marking-launch";

const current: MarkingLaunchCandidate = { model: "synthetic-model", prompt: "synthetic-prompt-v1", photoSetSha256: "a".repeat(64), printedRevision: "synthetic-print-v1" };
const now = "2026-11-06T20:00:00.000Z";
function approved(): MarkingLaunchEvidence {
  return {
    candidate: { ...current },
    items: Object.fromEntries(MARKING_LAUNCH_ITEMS.map((id) => [id, {
      owner: "Savar", status: "approved", proof: `synthetic://launch/${id}`,
      recordedAt: id === "evaluation-bar" ? "2026-11-06T16:00:00.000Z" : "2026-11-06T19:00:00.000Z", candidate: { ...current },
    }])) as MarkingLaunchEvidence["items"],
    evaluation: { barSetAt: "2026-11-06T16:00:00.000Z", startedAt: "2026-11-06T17:00:00.000Z", completedAt: "2026-11-06T18:00:00.000Z",
      maxWrongDefiniteRate: 0.01, maxWrongAsRight: 0, maxClearUnsureRate: 0.05,
      definite: 100, wrongDefinite: 1, wrongAsRight: 0, clear: 100, clearUnsure: 5, plainUnsureReasons: true },
    limits: { sharedUtcMonthUsd: 50, keyTotalUsd: 50, keyReset: "never", comparisonProjectionStopUsd: 15 },
  };
}

it("accepts complete synthetic evidence at the exact D-267 limits, without granting server access", () => {
  expect(scanMarkingLaunchReadiness(current, approved(), now)).toEqual({ ready: true, blockers: [] });
});

it("records the accepted synthetic Sonnet result while physical and family release stay held", () => {
  const saved = SCAN_MARKING_LAUNCH_EVIDENCE;
  const result = scanMarkingLaunchReadiness(saved.candidate, saved, "2026-11-07T08:00:00.000Z");
  expect(result.ready).toBe(false);
  expect(result.blockers).toEqual([
    "sample-approval", "screen-approval", "provider-policy", "physical-iphone", "physical-android", "privacy-text", "release-flags",
  ]);
  expect(saved.candidate).toMatchObject({ model: "anthropic/claude-sonnet-5.5", prompt: "whole-page-scalar-readings-v7" });
  expect(saved.evaluation).toMatchObject({ definite: 218, wrongDefinite: 0, wrongAsRight: 0, clear: 219, clearUnsure: 1 });
  expect(saved.items["evaluation-pass"].proof).toContain("offline replay");
  expect(SCAN_MARKING_LAUNCH_EVIDENCE.items["provider-policy"].status).toBe("deferred");
  expect(SCAN_MARKING_LAUNCH_EVIDENCE.items["provider-policy"].proof).toContain("deferred by Savar");
});

it.each(MARKING_LAUNCH_ITEMS)("rejects missing, incomplete, deferred and stale %s evidence", (id) => {
  for (const replacement of [undefined, null, {}, { status: "approved" },
    { ...approved().items[id], status: "pending" }, { ...approved().items[id], status: "deferred" },
    { ...approved().items[id], owner: " " }, { ...approved().items[id], proof: " " },
    { ...approved().items[id], recordedAt: "2026-11-07T00:00:00.000Z" },
    { ...approved().items[id], recordedAt: "2026-11-32T19:00:00.000Z" },
    { ...approved().items[id], candidate: { ...current, prompt: "old-prompt" } },
  ]) {
    const e = approved();
    const result = scanMarkingLaunchReadiness(current, { ...e, items: { ...e.items, [id]: replacement } }, now);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(id);
  }
});

it.each(["model", "prompt", "photoSetSha256", "printedRevision"] as const)("rejects approval for a changed %s", (field) => {
  const changed = { ...current, [field]: field === "photoSetSha256" ? "b".repeat(64) : "changed" };
  const result = scanMarkingLaunchReadiness(changed, approved(), now);
  expect(result.ready).toBe(false);
  expect(result.blockers).toEqual(expect.arrayContaining(["candidate-missing-or-stale", ...MARKING_LAUNCH_ITEMS]));
});

it.each([undefined, null, [], {}, "approved", { items: [] }, { candidate: { ...current, photoSetSha256: "not-a-hash" } }])("fails closed for malformed evidence: %j", (evidence) => {
  expect(scanMarkingLaunchReadiness(current, evidence, now).ready).toBe(false);
});

it.each([
  { wrongDefinite: 2 }, { definite: 99 }, { wrongAsRight: 1 }, { wrongAsRight: -1 }, { clearUnsure: 6 }, { clear: 99 },
  { plainUnsureReasons: false }, { definite: 0 }, { clear: 0 }, { definite: Infinity }, { wrongDefinite: 0.1 }, { clearUnsure: -1 },
])("rejects an unsafe or uncountable evaluation: %j", (change) => {
  const e = approved();
  expect(scanMarkingLaunchReadiness(current, { ...e, evaluation: { ...e.evaluation, ...change } }, now).blockers).toContain("evaluation-result");
});

it.each([
  { maxWrongDefiniteRate: 0.02 }, { maxWrongAsRight: 1 }, { maxClearUnsureRate: 0.1 },
  { barSetAt: "2026-11-06T17:00:00.000Z" }, { barSetAt: "2026-11-06T18:00:00.000Z" },
  { startedAt: "2026-11-06T19:00:00.000Z" }, { completedAt: "2026-11-07T18:00:00.000Z" }, { barSetAt: "invalid" },
])("requires the unchanged bar to precede the evaluation: %j", (change) => {
  const e = approved();
  expect(scanMarkingLaunchReadiness(current, { ...e, evaluation: { ...e.evaluation, ...change } }, now).blockers).toContain("evaluation-bar-or-order");
});

it.each([{ sharedUtcMonthUsd: 51 }, { keyTotalUsd: 51 }, { keyReset: "monthly" }, { comparisonProjectionStopUsd: 16 }])("rejects changed spending limits: %j", (change) => {
  const e = approved();
  expect(scanMarkingLaunchReadiness(current, { ...e, limits: { ...e.limits, ...change } }, now).blockers).toContain("spending-limits");
});

it("requires an explicit valid clock", () => {
  expect(scanMarkingLaunchReadiness(current, approved(), "invalid").blockers).toContain("invalid-clock");
});

it.each(["sample-approval", "screen-approval", "provider-policy"] as const)("requires Savar's recorded approval for %s", (id) => {
  const e = approved();
  expect(scanMarkingLaunchReadiness(current, { ...e, items: { ...e.items, [id]: { ...e.items[id], owner: "Another reviewer" } } }, now).blockers).toContain(id);
});

it("rejects pass proof recorded before the completed run and a bar record from after its claimed preset time", () => {
  for (const [id, recordedAt] of [["evaluation-pass", "2026-11-06T17:00:00.000Z"], ["evaluation-bar", "2026-11-06T19:00:00.000Z"]] as const) {
    const e = approved();
    expect(scanMarkingLaunchReadiness(current, { ...e, items: { ...e.items, [id]: { ...e.items[id], recordedAt } } }, now).blockers).toContain("evaluation-proof-order");
  }
});
