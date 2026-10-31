import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { runState, runWorkbookJob, startWorkbookRun, STALE_SECONDS, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import { generateWorkbook, type FitCheck, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { placeChild, planNextWorkbook } from "@/lib/workbook-placement";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { workbookTemplate } from "@/lib/workbook-template";

// "Prepare next workbook" (#312) through its public interface: the in-memory runs, drafts and files, the fake AI client
// with fixed JSON, the fake print engine and the real page templates (#310). The clock is fake: each AI call takes
// AI_SECONDS of it, so a call's time budget runs out after a known number of pages.

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

const child = (over: Partial<ChildInputs> = {}): ChildInputs => ({ parentId: PARENT, name: "Leah", grade: 3, province: "BC", profile: null, workbooks: [], ...over });

/** Each AI call takes this long on the fake clock. */
const AI_SECONDS = 10;
const fits: FitCheck = { fits: async () => ({ ok: true }) };
/** The number of a page request: its day and the slots it asks (a page's first call asks every slot). */
const pageCalls = (requests: AiJsonRequest[]) => requests.filter((r) => r.name === "workbook_page").length;

function setup(o: { inputs?: ChildInputs; ai?: WorkbookJobDeps["ai"]; files?: WorkbookJobDeps["files"]; budgetMs?: number; handOff?: WorkbookJobDeps["handOff"] } = {}) {
  let clock = new Date("2026-10-31T17:00:00.000Z");
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const drafts = memoryDraftStore({ [CHILD]: PARENT });
  const runs = memoryRunStore({ children: { [CHILD]: PARENT }, now: () => clock, newId, drafts });
  const files = memoryWorkbookFiles();
  let tokens = 0;
  const tick = (seconds: number) => { clock = new Date(clock.getTime() + seconds * 1000); };
  const ai = o.ai === undefined ? fakeAiClient({ answer: (r) => { tick(AI_SECONDS); return answer(r); } }) : o.ai;
  const deps: WorkbookJobDeps = {
    runs, drafts, files: o.files ?? files, ai, template: workbookTemplate(), fit: () => fits, engine: fakePrintEngine(),
    source: { inputs: async (id) => (id === CHILD ? (o.inputs ?? child()) : null) },
    newId, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`, fileKey: () => `k${ids}`,
    now: () => clock.getTime(), concurrency: 4, budgetMs: o.budgetMs ?? 1e9, handOff: o.handOff,
  };
  return { runs, drafts, files, deps, ai, tick, now: () => clock };
}

/** A whole draft for the run's draft key, made by the generator with a store that keeps it local. */
async function buildDraft(s: ReturnType<typeof setup>, key: string): Promise<GeneratedWorkbook> {
  const plan = planNextWorkbook({ curriculum: curriculumFor("bc")!, grade: 3, profile: null, workbooks: [], number: 1 });
  if (!plan.ok) throw new Error(plan.reason);
  let made: GeneratedWorkbook | null = null;
  let n = 0;
  await generateWorkbook(
    { workbookId: key, childId: CHILD, child: "Leah", number: 1, profileBuild: null, plan: plan.plan, curriculum: curriculumFor("bc")! },
    { ai: fakeAiClient({ answer }), fit: fits, qrToken: () => `local-token-${String(++n).padStart(8, "0")}`, store: { draft: async () => null, save: async (d) => { made = d; return { status: "saved", draftId: d.id }; } } },
  );
  return made!;
}

async function started(s: ReturnType<typeof setup>) {
  const start = await startWorkbookRun(s.runs, CHILD, ADMIN);
  if (start.status !== "started") throw new Error(start.status);
  return start.runId;
}

describe("a run", () => {
  it("stores a draft with its progress, its check results and revision 1 with an image of every page", async () => {
    const s = setup();
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");

    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", step: null, attempts: 1, error: null, number: 1, draftId: run.draftKey });
    expect(run.donePages).toBe(run.totalPages);
    expect(run.totalPages).toBeGreaterThan(0);
    const draft = (await s.drafts.draft(run.draftId!))!;
    expect(draft.counts.failed).toBe(0);
    expect(draft.counts.questions).toBeGreaterThan(0);
    // The page content the real templates read: the cover prints the child's name.
    expect(draft.pages[0].content).toMatchObject({ kind: "cover", child: "Leah", workbook: 1 });

    const [revision] = s.runs.revisions;
    expect(revision).toMatchObject({ draftId: draft.id, revision: 1, kind: "generated" });
    // Every page has an image: rendered, or a proof image with its failure marked when it did not render.
    const images = revision.rendering!.pages;
    expect(images.map((p) => p.number)).toEqual(draft.pages.map((p) => p.number));
    const failing = new Set(revision.problems.map((p) => p.page));
    for (const p of images) expect(!!p.proof).toBe(failing.has(p.number));
    for (const p of images.filter((x) => x.proof)) expect(p.questions).toEqual([]);
    // Every image and the PDF are in the family's folder for the draft.
    expect([...s.files.files.keys()].every((p) => p.startsWith(`${PARENT}/${draft.id}/`))).toBe(true);
    for (const p of images) expect(s.files.files.has(p.image.path)).toBe(true);
    if (revision.rendering!.pdfPath) expect(s.files.files.has(revision.rendering!.pdfPath)).toBe(true);

    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "draft-stored"]);
    expect(s.runs.audit[0]).toMatchObject({ actor: ADMIN.email, detail: { number: 1 } });
  });

  it("makes the next number after the child's stored workbooks", async () => {
    const s = setup();
    const runs = memoryRunStore({ children: { [CHILD]: PARENT }, workbooks: { [CHILD]: [1, 2] }, now: s.now, newId: s.deps.newId, drafts: s.drafts });
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

describe("the time limit", () => {
  it("hands the run on near its budget, and the next call writes only the pages that are missing", async () => {
    const handed: string[] = [];
    // A budget that lets the first call start a few rounds of pages: each page's call takes AI_SECONDS.
    const s = setup({ budgetMs: 150_000 + 3 * AI_SECONDS * 1000, handOff: async (id) => { handed.push(id); } });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    expect(handed).toEqual([id]);
    const after1 = (await s.runs.run(id))!;
    expect(after1).toMatchObject({ status: "running", draftId: null });
    const kept = s.runs.pageStore.get(id)!.size;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(after1.totalPages!);
    expect(pageCalls((s.ai as ReturnType<typeof fakeAiClient>).requests)).toBe(kept);

    // The next call: the resume route takes the run up again with the whole budget.
    const next = { ...s.deps, budgetMs: 1e9 };
    expect(await runWorkbookJob(id, next, { resume: true })).toBe("done");
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", resumes: 1, donePages: run.totalPages });
    // Every day page was written once: none of the kept pages again.
    expect(pageCalls((s.ai as ReturnType<typeof fakeAiClient>).requests)).toBe(run.totalPages);
    expect(s.drafts.drafts.size).toBe(1);
    expect(s.runs.audit.map((a) => a.action)).toEqual(["run-started", "run-resumed", "draft-stored"]);
  });

  it("is taken up again by the next start when the hand-over never arrives", async () => {
    const s = setup({ budgetMs: 150_000 + 2 * AI_SECONDS * 1000 });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("handed-on");
    const kept = s.runs.pageStore.get(id)!.size;
    // Within 2 minutes the hand-over may still arrive: the run is busy.
    expect(await startWorkbookRun(s.runs, CHILD, ADMIN)).toEqual({ status: "busy", runId: id });
    s.tick(121);
    expect(await startWorkbookRun(s.runs, CHILD, ADMIN)).toEqual({ status: "stalled", runId: id });
    expect(await runWorkbookJob(id, { ...s.deps, budgetMs: 1e9 }, { resume: true })).toBe("done");
    const run = (await s.runs.run(id))!;
    expect(pageCalls((s.ai as ReturnType<typeof fakeAiClient>).requests)).toBe(run.totalPages);
    expect(kept).toBeGreaterThan(0);
  });

  it("renders in a fresh call when the pages end too close to the budget", async () => {
    const handed: string[] = [];
    const s = setup({ budgetMs: 170_000, handOff: async (id) => { handed.push(id); } });
    const id = await started(s);
    let outcome = await runWorkbookJob(id, s.deps);
    for (let calls = 1; outcome === "handed-on" && calls < 50; calls++) outcome = await runWorkbookJob(id, s.deps, { resume: true });
    expect(outcome).toBe("done");
    expect(handed.length).toBeGreaterThan(1);
    const run = (await s.runs.run(id))!;
    expect(pageCalls((s.ai as ReturnType<typeof fakeAiClient>).requests)).toBe(run.totalPages);
    expect(s.runs.revisions).toHaveLength(1);
  });
});

describe("stale runs", () => {
  it("keeps one active run per child: busy while it works, taken up again once it has no progress for the stale time", async () => {
    const s = setup();
    const first = await started(s);
    expect(await startWorkbookRun(s.runs, CHILD, ADMIN)).toEqual({ status: "busy", runId: first });
    s.tick(STALE_SECONDS + 1);
    expect(await startWorkbookRun(s.runs, CHILD, ADMIN)).toEqual({ status: "stalled", runId: first });
    expect(await runWorkbookJob(first, s.deps, { resume: true })).toBe("done");
  });

  it("never lets a call whose run was taken up by another write over the newer call's work", async () => {
    const box: { s?: ReturnType<typeof setup> } = {};
    let late: Promise<string> | null = null;
    let id = "";
    // The first call goes quiet past the stale time while it writes; a new call takes the run up and finishes it.
    const slow = fakeAiClient({
      answer: async (r) => {
        if (late === null && slow.requests.length === 6) {
          box.s!.tick(STALE_SECONDS + 1);
          late = runWorkbookJob(id, { ...box.s!.deps, ai: fakeAiClient({ answer: (q) => answer(q) }) }, { resume: true });
          await late;
        }
        return answer(r);
      },
    });
    const s = setup({ ai: slow });
    box.s = s;
    id = await started(s);
    const kept = () => s.runs.pageStore.get(id)?.size ?? 0;
    expect(await runWorkbookJob(id, s.deps)).toBe("stale");
    expect(await late).toBe("done");
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", resumes: 1, draftId: run.draftKey });
    // One draft and one revision: the late call stored no draft, no revision and no files of its own.
    expect(s.drafts.drafts.size).toBe(1);
    expect(s.runs.revisions).toHaveLength(1);
    const images = new Set(s.runs.revisions[0].rendering!.pages.map((p) => p.image.path));
    const pdf = s.runs.revisions[0].rendering!.pdfPath;
    expect([...s.files.files.keys()].every((p) => images.has(p) || p === pdf)).toBe(true);
    // The stored pages are the newer call's and the ones the first call finished before it was taken up.
    expect(kept()).toBe(run.totalPages);
    // The late call wrote no page after the takeover: its page calls stopped.
    expect(slow.requests.length).toBeLessThanOrEqual(6 + 4);
  });

  it("stores a draft only while the caller holds the run, checked and inserted in one step (R379-1)", async () => {
    const s = setup();
    const id = await started(s);
    // Call A holds the run, then goes quiet past the stale time; call B takes it up before A's draft insert lands.
    const first = (await s.runs.claim(id, "lease-a"))!;
    s.tick(STALE_SECONDS + 1);
    expect(await s.runs.resume(id, "lease-b", STALE_SECONDS)).not.toBeNull();
    // A late insert under the old lease stores nothing; the holder's insert stores the draft once.
    const book = await buildDraft(s, first.draftKey);
    expect(await s.runs.saveDraft(id, "lease-a", book)).toBe("lost");
    expect(s.drafts.drafts.size).toBe(0);
    expect(await s.runs.saveDraft(id, "lease-b", book)).toBe("saved");
    expect(await s.runs.saveDraft(id, "lease-b", book)).toBe("used");
    expect(s.drafts.drafts.size).toBe(1);
  });

  it("lets every page in flight settle before it tries again, writes no page twice and builds the draft from the stored pages (R379-2)", async () => {
    let saves = 0;
    let inFlight = 0;
    let inFlightAtFailure = -1;
    const slow = fakeAiClient({
      answer: async (r) => {
        inFlight++;
        // Pages finish at different times, so others are in flight when one save fails.
        await new Promise((done) => setTimeout(done, 1 + (slow.requests.length % 4) * 3));
        inFlight--;
        return answer(r);
      },
    });
    const s = setup({ ai: slow });
    const save = s.runs.savePage;
    s.deps.runs = {
      ...s.runs,
      savePage: async (runId, lease, page) => {
        if (++saves === 3) {
          inFlightAtFailure = inFlight;
          throw new Error("the database is unavailable");
        }
        return save(runId, lease, page);
      },
    };
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    expect(inFlightAtFailure).toBeGreaterThan(0);
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", attempts: 2 });
    // Every day page was written by one attempt only: one page call each (the page that failed to save is written
    // once more by the second attempt, as it was never stored).
    expect(pageCalls(slow.requests)).toBe(run.totalPages! + 1);
    // The draft's day pages are the stored pages.
    const draft = (await s.drafts.draft(run.draftId!))!;
    for (const p of s.runs.pageStore.get(id)!.values()) expect(draft.pages[p.number - 1]).toEqual(p);
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
