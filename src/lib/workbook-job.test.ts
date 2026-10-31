import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { runState, runWorkbookJob, startWorkbookRun, STALE_SECONDS, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import { placeChild } from "@/lib/workbook-placement";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { fixedTemplate } from "@/lib/workbook-template-fixed";

// "Prepare next workbook" (#312) through its public interface: the in-memory runs, drafts and files, the fake AI client
// with fixed JSON, the fake print engine and the fixed template on main (cover and practice layouts only).

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" };

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const addOp = (a: number, b: number) => ({ kind: "add", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

/** A sound item for every slot asked: an addition with a carry, its wrong answers and an easier example. */
function answer(r: AiJsonRequest) {
  const asked = JSON.parse((r.content[0] as { text: string }).text) as { slots: { slot: string; skills: string[] }[] };
  return {
    items: asked.slots.map((s) => ({
      slot: s.slot, skill: s.skills[0], difficulty: 2, text: "268 + 157 = ?", format: "write-number", operation: addOp(268, 157),
      wrongAnswers: [
        { value: num(315), cause: "O3", description: "Adds each column and forgets to carry.", step: "tens" },
        { value: num(111), cause: "operation", description: "Takes away instead of adding.", step: null },
      ],
      easier: { text: "48 + 37 = ?", operation: addOp(48, 37) },
      shownWrong: null,
    })),
  };
}

const child = (over: Partial<ChildInputs> = {}): ChildInputs => ({ parentId: PARENT, grade: 3, province: "BC", profile: null, workbooks: [], ...over });

function setup(o: { inputs?: ChildInputs; ai?: WorkbookJobDeps["ai"]; files?: WorkbookJobDeps["files"] } = {}) {
  let clock = new Date("2026-10-31T17:00:00.000Z");
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const runs = memoryRunStore({ children: { [CHILD]: PARENT }, now: () => clock, newId });
  const drafts = memoryDraftStore({ [CHILD]: PARENT });
  const files = memoryWorkbookFiles();
  let tokens = 0;
  const ai = o.ai === undefined ? fakeAiClient({ answer }) : o.ai;
  const deps: WorkbookJobDeps = {
    runs, drafts, files: o.files ?? files, ai, template: fixedTemplate(), engine: fakePrintEngine(),
    source: { inputs: async (id) => (id === CHILD ? (o.inputs ?? child()) : null) },
    newId, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`, fileKey: () => `k${ids}`,
  };
  return { runs, drafts, files, deps, ai, tick: (seconds: number) => { clock = new Date(clock.getTime() + seconds * 1000); }, now: () => clock };
}

async function started(s: ReturnType<typeof setup>) {
  const start = await startWorkbookRun(s.runs, CHILD, ADMIN);
  if (start.status !== "started") throw new Error(start.status);
  return start.runId;
}

describe("a run", () => {
  it("stores a draft with its progress, its check results and revision 1 with the pages that rendered", async () => {
    const s = setup();
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");

    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", step: null, attempts: 1, error: null, number: 1 });
    expect(run.donePages).toBe(run.totalPages);
    expect(run.totalPages).toBeGreaterThan(0);
    const draft = (await s.drafts.draft(run.draftId!))!;
    expect(draft.counts.failed).toBe(0);
    expect(draft.counts.questions).toBeGreaterThan(0);

    const [revision] = s.runs.revisions;
    expect(revision).toMatchObject({ draftId: draft.id, revision: 1, kind: "generated" });
    // The fixed template lays out the cover and practice pages; every other page is named as not rendered.
    const rendered = revision.rendering!.pages.map((p) => p.number);
    const types = new Map(draft.pages.map((p) => [p.number, p.type]));
    expect(rendered.length).toBeGreaterThan(1);
    expect(rendered.every((n) => types.get(n) === "cover" || types.get(n) === "practice")).toBe(true);
    const notRendered = new Set(revision.problems.map((p) => p.page));
    expect(rendered.length + notRendered.size).toBe(draft.pages.length);
    expect(revision.problems.find((p) => types.get(p.page) === "how-plan")?.reason).toBe("the template has no layout for a how-plan page");
    // Every image and the PDF are in the family's folder for the draft.
    expect([...s.files.files.keys()].every((p) => p.startsWith(`${PARENT}/${draft.id}/`))).toBe(true);
    expect(s.files.files.has(revision.rendering!.pdfPath)).toBe(true);
    for (const p of revision.rendering!.pages) expect(s.files.files.has(p.image.path)).toBe(true);

    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "draft-stored"]);
    expect(s.runs.audit[0]).toMatchObject({ actor: ADMIN.email, detail: { number: 1 } });
  });

  it("makes the next number after the child's stored workbooks", async () => {
    const s = setup();
    const runs = memoryRunStore({ children: { [CHILD]: PARENT }, workbooks: { [CHILD]: [1, 2] }, now: s.now, newId: s.deps.newId });
    const start = await startWorkbookRun(runs, CHILD, ADMIN);
    expect(start.status).toBe("started");
    expect((await runs.run((start as { runId: string }).runId))!.number).toBe(3);
  });

  it("fails with a plain error and no retry when it is refused", async () => {
    const s = setup({ inputs: child({ province: "ON" }) });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect(await s.runs.run(id)).toMatchObject({ status: "failed", attempts: 1, error: "There is no workbook curriculum for ON yet. Only BC has one.", draftId: null });
    expect(s.drafts.drafts.size).toBe(0);
    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "run-failed"]);
  });

  it("fails when the AI is off, before any AI call", async () => {
    const s = setup({ ai: null });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect((await s.runs.run(id))!.error).toBe("The AI is off: OPENROUTER_API_KEY is not set.");
  });

  it("retries an error once and renders again without writing the draft again", async () => {
    const files = memoryWorkbookFiles();
    let fails = 1;
    const flaky = { ...files, put: async (f: Parameters<typeof files.put>[0]) => { if (fails-- > 0) throw new Error("Storage is unavailable"); return files.put(f); } };
    const s = setup({ files: flaky });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", attempts: 2 });
    expect(run.errors.map((e) => e.error)).toEqual(["Storage is unavailable"]);
    expect(s.drafts.drafts.size).toBe(1);
    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "run-retried", "draft-stored"]);
  });

  it("stops after the last attempt and keeps every attempt's error", async () => {
    const files = memoryWorkbookFiles();
    const s = setup({ files: { ...files, put: async () => { throw new Error("Storage is unavailable"); } } });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "failed", attempts: 2, error: "Storage is unavailable" });
    expect(run.errors).toHaveLength(2);
    expect(s.drafts.drafts.size).toBe(1);
    expect(files.files.size).toBe(0);
  });

  it("is taken by one job call only", async () => {
    const s = setup();
    const id = await started(s);
    const [a, b] = await Promise.all([runWorkbookJob(id, s.deps), runWorkbookJob(id, s.deps)]);
    expect([a, b].sort()).toEqual(["done", "not-claimed"]);
    expect(s.drafts.drafts.size).toBe(1);
  });
});

describe("stale runs", () => {
  it("keeps one active run per child until it has no progress for the stale time", async () => {
    const s = setup();
    const first = await started(s);
    expect(await startWorkbookRun(s.runs, CHILD, ADMIN)).toEqual({ status: "busy", runId: first });
    s.tick(STALE_SECONDS + 1);
    const second = await startWorkbookRun(s.runs, CHILD, ADMIN);
    expect(second.status).toBe("started");
    expect(await s.runs.run(first)).toMatchObject({ status: "stale" });
    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "run-stopped", "run-started"]);
  });

  it("never stores a stopped run's draft over the newer run", async () => {
    let newer: string | null = null;
    // While the first run writes its pages, it goes quiet past the stale time and an admin starts a new run.
    const ai = fakeAiClient({
      answer: async (r) => {
        if (!newer && ai.requests.length === 3) {
          s.tick(STALE_SECONDS + 1);
          const start = await startWorkbookRun(s.runs, CHILD, ADMIN);
          newer = start.status === "started" ? start.runId : null;
        }
        return answer(r);
      },
    });
    const s = setup({ ai });
    const first = await started(s);
    expect(await runWorkbookJob(first, s.deps)).toBe("stale");
    expect(newer).not.toBeNull();
    expect(await s.runs.run(first)).toMatchObject({ status: "stale", draftId: null });
    expect(s.drafts.drafts.size).toBe(0);
    expect(s.files.files.size).toBe(0);
    // The stopped run made no more AI calls after it lost its lease.
    const calls = ai.requests.length;

    expect(await runWorkbookJob(newer!, s.deps)).toBe("done");
    expect((await s.runs.run(newer!))!.draftId).not.toBeNull();
    expect(s.drafts.drafts.size).toBe(1);
    expect(calls).toBeLessThan(ai.requests.length / 2);
  });

  it("reads as stopped when a running run has no progress for the stale time", () => {
    const now = new Date("2026-10-31T17:00:00.000Z");
    const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
    expect(runState({ status: "running", heartbeatAt: ago(30), createdAt: ago(60) }, now)).toBe("preparing");
    expect(runState({ status: "running", heartbeatAt: ago(STALE_SECONDS + 1), createdAt: ago(900) }, now)).toBe("stopped");
    expect(runState({ status: "queued", heartbeatAt: null, createdAt: ago(5) }, now)).toBe("waiting");
    expect(runState({ status: "stale", heartbeatAt: ago(5), createdAt: ago(5) }, now)).toBe("stopped");
    expect(runState({ status: "failed", heartbeatAt: ago(900), createdAt: ago(900) }, now)).toBe("failed");
  });
});

describe("placement", () => {
  const BC = curriculumFor("bc")!;
  const profile = (notYetSecure: string[]) => ({ notYetSecure, standards: [] }) as unknown as ChildLearnerProfile;

  it("starts a first workbook at the lowest level with a standard not yet secure, at or below the grade", () => {
    expect(placeChild({ curriculum: BC, grade: 3, profile: profile(["2.4", "3.3"]), workbooks: [] }).level.id).toBe("U9");
    expect(placeChild({ curriculum: BC, grade: 3, profile: profile([]), workbooks: [] }).level.id).toBe("U10");
    expect(placeChild({ curriculum: BC, grade: 3, profile: null, workbooks: [] }).level.id).toBe("U10");
    expect(placeChild({ curriculum: BC, grade: 0, profile: null, workbooks: [] }).level.id).toBe("U1");
    expect(placeChild({ curriculum: BC, grade: 9, profile: null, workbooks: [] }).level.id).toBe("U27");
  });

  it("goes on at the newest workbook's level", () => {
    const place = placeChild({ curriculum: BC, grade: 3, profile: profile(["2.4"]), workbooks: [{ number: 1, levels: [10] }, { number: 2, levels: [11] }] });
    expect(place).toMatchObject({ first: false, inLevel: 1 });
    expect(place.level.id).toBe("U11");
  });
});
