import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { jsonHash } from "./workbook-book1-baseline";
import { loadPinnedPlanningEngine } from "./workbook-book1-pinned";
import { recoverBook1PlanningInput, type Book1RecoverySources, type PinnedPlanningEngine } from "./workbook-book1-recovery";
import { curriculumFor } from "./workbook-curriculum";
import type { RunFrame } from "./workbook-job";
import { planNextWorkbook } from "./workbook-placement";
import type { PlanInput } from "./workbook-plan";
import { bookPersona, type BookPersona } from "./workbook-sample-profiles";

// #472 recovery contract, on synthetic records only, against the real pinned planners loaded from Git objects:
// de9404ee (the build that planned the first customer's Book 1) and 397e63b5 (main before this change).
const ORIGINAL = "de9404ee545517387a241d79f19f1d70ab1e3201";
const BASE = "397e63b55a1a49a238b0200c3c04ca363495bad3";
const RUN = "00000000-0000-4000-8000-0000000000a1";
let original: Awaited<ReturnType<typeof loadPinnedPlanningEngine>>, base: PinnedPlanningEngine;
beforeAll(async () => {
  [original, base] = await Promise.all([loadPinnedPlanningEngine(ORIGINAL), loadPinnedPlanningEngine(BASE)]);
}, 240_000);

const report = { howWeHelp: "behind" as const, minutes: 31 };
const device = { deviceClass: "tablet", input: "touch", screenWidth: 1024, screenHeight: 768, browser: "safari" };
/** A synthetic frame as the pinned job stored it: its plan, then the capacity step's own days and extra practice. */
function frameOf(engine: PinnedPlanningEngine, profile: unknown, grade = 4, o: { capacity?: boolean } = {}): RunFrame {
  const planned = engine.plan({ curriculumKey: "bc", grade, profile, ...(profile ? { report, device } : {}), workbooks: [], number: 1 });
  if (!planned.result.ok) throw Error("synthetic-plan");
  const plan = structuredClone(planned.result.plan) as RunFrame["plan"];
  if (o.capacity !== false) { plan.days = plan.days.slice(0, 9); (plan as { extraPractice?: unknown }).extraPractice = { pages: 2 }; }
  return { version: 1, itemPolicy: "approved-v1", curriculum: "bc", grade: grade as RunFrame["grade"], profileRevision: profile ? 6 : null, workbooks: [], plan,
    versions: { curriculum: engine.curriculumVersion("bc")!, outline: "synthetic-outline", model: "synthetic", solveModel: "synthetic", build: engine.pin } };
}
function sourcesOf(frame: RunFrame, profile: unknown): Book1RecoverySources {
  return { version: 1, run: { id: RUN, number: 1 }, frame: { reference: `workbook_run_frames:${RUN}`, createdAt: "2026-11-06T10:00:00.000Z", value: frame },
    profile: profile ? { reference: "child_profiles:synthetic:6", revision: 6, builtAt: "2026-11-06T09:00:00.000Z", value: profile } : null };
}

describe("recoverBook1PlanningInput with the pinned original planner", () => {
  it("bundles the pin's own Git blobs, not the working tree", async () => {
    const { execFileSync } = await import("node:child_process");
    const blob = (rev: string) => execFileSync("git", ["rev-parse", rev], { encoding: "utf8" }).trim();
    const plan = "src/lib/workbook-plan.ts", placement = "src/lib/workbook-placement.ts";
    expect(original.files[plan]).toBe(blob(`${ORIGINAL}:${plan}`));
    expect(original.files[placement]).toBe(original.placementBlob);
    // This branch changed both files, so the working tree's blobs differ from the pin's.
    expect(original.files[placement]).not.toBe(execFileSync("git", ["hash-object", placement], { encoding: "utf8" }).trim());
    expect(Object.keys(original.files).length).toBeGreaterThan(20);
    expect(Object.keys(original.files).every(f => f.startsWith("src/") || f.startsWith("data/"))).toBe(true);
  });
  it.each(["on-level", "catch-up", "ahead", "rushed"] as BookPersona[])("recovers the exact PlanInput of a %s Book 1 and its hash", persona => {
    const profile = JSON.parse(JSON.stringify(bookPersona(persona).profile));
    const frame = frameOf(original, profile);
    const r = recoverBook1PlanningInput(sourcesOf(frame, profile), original);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const direct = original.plan({ curriculumKey: "bc", grade: 4, profile, report, device, workbooks: [], number: 1 }).calls[0];
    expect(r.input).toEqual(JSON.parse(JSON.stringify(direct)));
    expect(r.inputHash).toBe(jsonHash(direct));
    expect(r.proof).toMatchObject({ kind: "exact-recovery", planner: { build: ORIGINAL, tree: original.tree, placementBlob: original.placementBlob } });
    expect(r.input.passed).toEqual({});
    expect(r.input.personal?.hasAssessment).toBe(true);
  });
  it("recovers a Book 1 with no profile", () => {
    const frame = frameOf(original, null, 1);
    expect(recoverBook1PlanningInput(sourcesOf(frame, null), original).ok).toBe(true);
  });
  const refusals: [string, (s: Book1RecoverySources) => PinnedPlanningEngine | null, string][] = [
    ["no engine", () => null, "engine-unavailable"],
    ["another build's engine", () => base, "build-mismatch"],
    ["no build", s => { s.frame.value.versions.build = null; return original; }, "build-unknown"],
    ["a frame with a capture", s => { s.frame.value.planning = { version: 1, input: {} as PlanInput, placement: {} as never }; return original; }, "frame-has-capture"],
    ["run 2", s => { s.run.number = 2; return original; }, "not-book1"],
    ["earlier workbooks", s => { s.frame.value.workbooks = [{ number: 1, levels: [13] }]; return original; }, "not-book1"],
    ["no frozen profile", s => { s.profile = null; return original; }, "profile-not-frozen"],
    ["another revision", s => { s.profile!.revision = 7; return original; }, "profile-revision-mismatch"],
    ["a profile built after the frame", s => { s.profile!.builtAt = "2026-11-06T10:00:00.001Z"; return original; }, "profile-after-frame"],
    ["an unreadable profile", s => { s.profile!.value = { schemaVersion: 99 }; return original; }, "profile-unreadable"],
    ["another curriculum version", s => { s.frame.value.versions.curriculum = "other"; return original; }, "curriculum-version-mismatch"],
    ["no frozen report", s => { delete (s.frame.value.plan.personal as { report?: unknown }).report; return original; }, "frozen-report-missing"],
    ["a different plan", s => { (s.frame.value.plan as unknown as Record<string, unknown>).level = { id: "U99" }; return original; }, "plan-mismatch"],
    ["a different personal field", s => { (s.frame.value.plan.personal as unknown as { report: { minutes: number } }).report.minutes = 5; return original; }, "plan-mismatch"],
    ["capacity fields on a legacy-policy frame", s => { delete s.frame.value.itemPolicy; return original; }, "plan-mismatch"],
  ];
  it.each(refusals)("refuses %s", (_name, change, reason) => {
    const profile = JSON.parse(JSON.stringify(bookPersona("on-level").profile));
    const s = sourcesOf(frameOf(original, profile), profile);
    const engine = change(s);
    expect(recoverBook1PlanningInput(s, engine)).toEqual({ ok: false, reason });
  });
  it("never reads a profile it was not given", () => {
    const profile = JSON.parse(JSON.stringify(bookPersona("catch-up").profile)), today = JSON.parse(JSON.stringify(bookPersona("ahead").profile));
    const s = sourcesOf(frameOf(original, profile), profile);
    s.profile!.value = today;
    expect(recoverBook1PlanningInput(s, original)).toEqual({ ok: false, reason: "plan-mismatch" });
  });
});

describe("default public outputs are unchanged against the base pin", () => {
  const cases: { name: string; grade: number; persona: BookPersona | null; workbooks: { number: number; levels: number[] }[]; number: number }[] = [
    { name: "no profile, grade 1", grade: 1, persona: null, workbooks: [], number: 1 },
    { name: "on-level", grade: 4, persona: "on-level", workbooks: [], number: 1 },
    { name: "catch-up", grade: 4, persona: "catch-up", workbooks: [], number: 1 },
    { name: "ahead", grade: 4, persona: "ahead", workbooks: [], number: 1 },
    { name: "rushed book 2", grade: 4, persona: "rushed", workbooks: [{ number: 1, levels: [13] }], number: 2 },
  ];
  it.each(cases)("planNextWorkbook gives the same plan and planner input for $name", c => {
    const profile = c.persona ? JSON.parse(JSON.stringify(bookPersona(c.persona).profile)) : null;
    const facts = profile ? { report, device } : {};
    const pinned = base.plan({ curriculumKey: "bc", grade: c.grade, profile, ...facts, workbooks: c.workbooks, number: c.number });
    const input = { ...(facts as object), curriculum: curriculumFor("bc")!, grade: c.grade as never, profile, workbooks: c.workbooks, number: c.number } as Parameters<typeof planNextWorkbook>[0];
    const captured: PlanInput[] = [];
    const withCapture = planNextWorkbook(input, i => { captured.push(i); });
    const without = planNextWorkbook(input);
    expect(JSON.parse(JSON.stringify(without))).toEqual(JSON.parse(JSON.stringify(withCapture)));
    expect(JSON.parse(JSON.stringify(withCapture.ok && withCapture.plan))).toEqual(JSON.parse(JSON.stringify(pinned.result.plan)));
    expect(captured).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(captured))).toEqual(JSON.parse(JSON.stringify(pinned.calls)));
  });
});
