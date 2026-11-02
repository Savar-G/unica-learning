import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { runState, runWorkbookJob, startWorkbookRun, SLOT_ATTEMPTS, STALE_SECONDS, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import { generateWorkbook, type FitCheck, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { placeChild, planNextWorkbook } from "@/lib/workbook-placement";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { workbookTemplate } from "@/lib/workbook-template";
import { keySolver, type Solver } from "@/lib/workbook-solve-check";

// "Prepare next workbook" (#312) through its public interface: the in-memory runs, drafts and files, the fake AI client
// with fixed JSON, the fake print engine and the real page templates (#310). The clock is fake: each AI call takes
// AI_SECONDS of it, so a call's time budget runs out after a known number of pages.

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" };


/** Sound items for every slot asked, in the format its place takes (the dev fake's items). */
const answer = (r: AiJsonRequest) => fakeWorkbookItems(r);

const child = (over: Partial<ChildInputs> = {}): ChildInputs => ({ parentId: PARENT, name: "Leah", grade: 3, province: "BC", profile: null, workbooks: [], ...over });

/** Each AI call takes this long on the fake clock. */
const AI_SECONDS = 10;
const fits: FitCheck = { fits: async () => ({ ok: true }) };
/** The number of a page request: its day and the slots it asks (a page's first call asks every slot). */
const pageCalls = (requests: AiJsonRequest[]) => requests.filter((r) => r.name === "workbook_page").length;

function setup(o: {
  inputs?: ChildInputs; ai?: WorkbookJobDeps["ai"]; files?: WorkbookJobDeps["files"]; budgetMs?: number; handOff?: WorkbookJobDeps["handOff"];
  solver?: WorkbookJobDeps["solver"]; solveCost?: WorkbookJobDeps["solveCost"]; concurrency?: number;
} = {}) {
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
    solver: o.solver === undefined ? keySolver() : o.solver, ...(o.solveCost ? { solveCost: o.solveCost } : {}),
    source: { inputs: async (id) => (id === CHILD ? (o.inputs ?? child()) : null) },
    newId, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`, fileKey: () => `k${ids}`,
    now: () => clock.getTime(), concurrency: o.concurrency ?? 4, budgetMs: o.budgetMs ?? 1e9, handOff: o.handOff,
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
    { workbookId: key, childId: CHILD, book: { child: "Leah" }, number: 1, profileBuild: null, plan: plan.plan, curriculum: curriculumFor("bc")! },
    { ai: fakeAiClient({ answer }), solver: keySolver(), fit: fits, qrToken: () => `local-token-${String(++n).padStart(8, "0")}`, store: { draft: async () => null, save: async (d) => { made = d; return { status: "saved", draftId: d.id }; } } },
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
    // The dev fake picks its numbers from what it is asked, so a few of its sums repeat by chance: only those fail.
    const failed = draft.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "failed").map((q) => `${q.place}: ${(q.check as { reason: string }).reason}`));
    expect(failed.filter((r) => !/repeats a question|same sum|same as question|only by one number/.test(r))).toEqual([]);
    expect(failed.length).toBeLessThan(draft.counts.questions * 0.03);
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

  it("marks a failed question on a page that fits: the page's image is a proof with the failure (R379-4-1)", async () => {
    // Slot 1.1 of every page fails the check twice; the fit check passes every page.
    const ai = fakeAiClient({
      answer: (r) => {
        const asked = JSON.parse((r.content[0] as { text: string }).text) as { slots: { slot: string; skills: string[] }[] };
        const good = answer(r).items;
        return { items: asked.slots.map((sl, k) => (sl.slot === "1.1"
          ? { ...good[k], operation: { kind: "add", operands: [], expression: null, unit: null, denominator: null, values: [] } }
          : good[k])) };
      },
    });
    const s = setup({ ai });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const draft = (await s.drafts.draft((await s.runs.run(id))!.draftId!))!;
    const page = draft.pages.find((p) => p.fit.status === "fits" && p.questions.some((q) => q.slot === "1.1" && q.check.status === "failed"))!;
    expect(page).toBeDefined();
    const [revision] = s.runs.revisions;
    const q = page.questions.find((x) => x.slot === "1.1")!;
    expect(revision.problems.filter((p) => p.page === page.number).map((p) => p.reason)).toContain(`question ${q.number} failed: ${(q.check as { reason: string }).reason}`);
    expect(revision.rendering!.pages.find((p) => p.number === page.number)).toMatchObject({ proof: true });
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
    expect((await s.runs.run(id))!.error).toBe("The AI is off: no Claude subscription here and no OPENROUTER_API_KEY.");
  });

  it("fails when the solve check is off, before any AI call", async () => {
    const s = setup({ solver: null });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("failed");
    expect((await s.runs.run(id))!.error).toBe("The solve check is off: no Claude subscription here and no OPENROUTER_API_KEY.");
    expect((s.ai as ReturnType<typeof fakeAiClient>).requests).toHaveLength(0);
  });

  it("stores every solve check with its cost and verdict; a question the reader answers another way fails with both answers (#380)", async () => {
    // The reader answers one more than the key for every printed question with "now" in it (the stories).
    const misreads: Solver = {
      model: "reader",
      solve: async (request) => ({
        answers: request.key.map((k) => ({ question: k.question, box: k.box, answer: /now/.test(request.questions[0].text) && k.question === "question" ? String(Number(k.right[0]) + 1) : k.right[0] })),
        problem: null,
      }),
    };
    const s = setup({ solver: misreads, solveCost: () => 0.0005 });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const solves = s.runs.solveStore.get(id)!;
    expect(solves.length).toBeGreaterThan(50);
    expect(solves.every((x) => x.model === "reader" && x.usd === 0.0005 && x.ms >= 0)).toBe(true);
    const disagreed = solves.filter((x) => x.verdict === "disagreed");
    expect(disagreed.length).toBeGreaterThan(0);
    expect(disagreed[0].log.verdict).toMatchObject({ status: "disagreed", reason: expect.stringContaining("the key says") });
    expect(JSON.parse(disagreed[0].log.answers)).toMatchObject({ answers: expect.any(Array) });
    // A story the reader still answers another way after its redo fails, with what the reader answered and the key.
    const draft = (await s.drafts.draft((await s.runs.run(id))!.draftId!))!;
    const failed = draft.pages.flatMap((p) => p.questions).filter((q) => q.check.status === "failed" && /the solve check/.test(q.check.reason));
    expect(failed.length).toBeGreaterThan(0);
    expect((failed[0].check as { reason: string }).reason).toMatch(/a reader of the printed text answers "\d+", the key says "\d+"/);
    // Each failed question's checks are stored under its package id.
    expect(solves.some((x) => x.questionId === failed[0].package!.id && x.verdict === "disagreed")).toBe(true);
  });

  it("makes the same draft one page at a time and five at a time (#312, the book memory of #380)", async () => {
    const draftAt = async (concurrency: number) => {
      const s = setup({ concurrency });
      const id = await started(s);
      expect(await runWorkbookJob(id, s.deps)).toBe("done");
      return (await s.drafts.draft((await s.runs.run(id))!.draftId!))!;
    };
    expect((await draftAt(5)).pages).toEqual((await draftAt(1)).pages);
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
    let atRetry: { inFlight: number; calls: number; stored: number } | null = null;
    const slow = fakeAiClient({
      answer: async (r) => {
        inFlight++;
        // The first calls of the later pages are slow, so they are in flight when the third page's save fails.
        const page = (JSON.parse((r.content[0] as { text: string }).text) as { page?: number; day?: number });
        await new Promise((done) => setTimeout(done, r.name === "workbook_page" && slow.requests.length > 3 ? 25 : 1 + (page.page ?? 0) % 3));
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
      retry: async (runId, lease, error) => {
        atRetry = { inFlight, calls: pageCalls(slow.requests), stored: s.runs.pageStore.get(runId)?.size ?? 0 };
        return s.runs.retry(runId, lease, error);
      },
    };
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    expect(inFlightAtFailure).toBeGreaterThan(0);
    // Nothing of the first attempt is still running when it tries again.
    expect(atRetry).toMatchObject({ inFlight: 0, stored: 2 });
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", attempts: 2 });
    // Every page's first call was asked once in all (R379-7-1): the first attempt's calls of the pages after the one
    // that failed were stored as they came back, and the second attempt replays them instead of asking again.
    expect(atRetry!.calls).toBeGreaterThan(atRetry!.stored + 1);
    expect(pageCalls(slow.requests)).toBe(run.totalPages!);
    // The draft's day pages are the stored pages.
    const draft = (await s.drafts.draft(run.draftId!))!;
    for (const p of s.runs.pageStore.get(id)!.values()) expect(draft.pages[p.number - 1]).toEqual(p);
  });

  it("never asks the AI again for a question when its page save fails after its redo, and the job retries (R379-2-1)", async () => {
    // Slot 1.1 of every page fails the check, so each page uses its second attempt on it (the redo).
    // An operation with no operands: code cannot build it, so the check fails.
    const bad = (sl: { slot: string; skills: string[] }) => ({ slot: sl.slot, skill: sl.skills[0], difficulty: 2, text: "? + ? = ?", format: "write-number", operation: { kind: "add", operands: [], expression: null, unit: null, denominator: null, values: [] }, wrongAnswers: [], easier: null, shownWrong: null });
    const ai = fakeAiClient({
      // Every slot and worked example asked (the dev fake's items), slot 1.1 bad.
      answer: (r) => ({ items: answer(r).items.map((it) => (it.slot === "1.1" ? bad({ slot: it.slot, skills: [it.skill] }) : it)) }),
    });
    const s = setup({ ai });
    s.deps.concurrency = 1;
    // The first page's save fails after both of its 1.1 attempts were used.
    let saves = 0;
    const save = s.runs.savePage;
    s.deps.runs = { ...s.runs, savePage: async (runId, lease, page) => {
      if (++saves === 1) throw new Error("the database is unavailable");
      return save(runId, lease, page);
    } };
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const run = (await s.runs.run(id))!;
    expect(run).toMatchObject({ status: "done", attempts: 2 });

    // AI calls that asked for slot 1.1, page by page (one page at a time, so each page's calls follow each other).
    const asks = ai.requests.map((r) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: { slot: string }[] }).slots.some((x) => x.slot === "1.1"));
    const draft = (await s.drafts.draft(run.draftId!))!;
    const withSlot = draft.pages.filter((p) => p.questions.some((q) => q.slot === "1.1"));
    // Two calls a page for slot 1.1 (the first and the redo), and none more for the page whose save failed.
    expect(asks.filter(Boolean).length).toBe(2 * withSlot.length);
    const first = withSlot[0];
    const q = first.questions.find((x) => x.slot === "1.1")!;
    expect(q).toMatchObject({ attempts: 2, check: { status: "failed" } });
    // The stored page and the draft show the true count.
    expect(s.runs.pageStore.get(id)!.get(first.number)!.questions.find((x) => x.slot === "1.1")!.attempts).toBe(2);
    expect(draft.pages[first.number - 1]).toEqual(s.runs.pageStore.get(id)!.get(first.number));
  });

  describe("a job call that stops after a later page's first answer, before that page is stored (R379-7-1)", () => {
    /**
     * The dev fake's items, except that a page's first call asked a second time answers slot 1.1 with an operation code
     * cannot build: what a lost first answer would cost (a failed check, and with it the redo).
     */
    const once = () => {
      const firsts = new Set<string>();
      return fakeAiClient({
        answer: (r) => {
          const req = JSON.parse((r.content[0] as { text: string }).text) as { day: number; page: number };
          const again = r.name === "workbook_page" && firsts.has(`${req.day}:${req.page}`);
          if (r.name === "workbook_page") firsts.add(`${req.day}:${req.page}`);
          const items = answer(r).items;
          return { items: again ? items.map((it) => (it.slot === "1.1" ? { ...it, operation: { kind: "add", operands: [], expression: null, unit: null, denominator: null, values: [] } } : it)) : items };
        },
      });
    };
    /** The day pages of a done run's draft, without their QR tokens (random in live use, made again by a new call). */
    const dayPages = async (s: ReturnType<typeof setup>, id: string) => {
      const run = (await s.runs.run(id))!;
      expect(run.status).toBe("done");
      const draft = (await s.drafts.draft(run.draftId!))!;
      return draft.pages.map((p) => ({ ...p, qrToken: "" }));
    };
    async function uninterrupted() {
      const ai = once();
      const s = setup({ ai });
      const id = await started(s);
      expect(await runWorkbookJob(id, s.deps)).toBe("done");
      return { pages: await dayPages(s, id), attempts: s.runs.attemptStore.get(id)!, requests: ai.requests.length };
    }
    /**
     * A run whose job calls stop at the given page saves (counted over every call), as a function that ends does: the
     * later pages' first calls in flight come back and are stored, then the call loses the run with nothing more
     * written, and the next job call takes it up.
     */
    async function stopping(at: number[]) {
      const ai = once();
      const s = setup({ ai });
      const id = await started(s);
      let saves = 0;
      const save = s.runs.savePage;
      s.deps.runs = { ...s.runs, savePage: async (runId, lease, page) => {
        if (at.includes(++saves)) {
          await new Promise((done) => setTimeout(done, 20));
          s.runs.runs.get(runId)!.lease = null;
          throw new Error("the function stopped");
        }
        return save(runId, lease, page);
      } };
      const outcomes = [await runWorkbookJob(id, s.deps)];
      while (outcomes.at(-1) === "stale") outcomes.push(await runWorkbookJob(id, s.deps, { resume: true }));
      return { s, id, ai, outcomes };
    }

    it("replays the stored answers: the same questions and attempt counts as a run that never stopped", async () => {
      const one = await uninterrupted();
      const { s, id, ai, outcomes } = await stopping([1]);
      expect(outcomes).toEqual(["stale", "done"]);
      // Pages of the first day had stored their first call but not their page when the call stopped.
      const calls = [...s.runs.callStore.get(id)!.values()];
      const stored = new Set(s.runs.pageStore.get(id)!.keys());
      expect(calls.filter((c) => c.seq === 0).length).toBe(stored.size);
      expect(await dayPages(s, id)).toEqual(one.pages);
      expect(s.runs.attemptStore.get(id)).toEqual(one.attempts);
      expect(ai.requests.length).toBe(one.requests);
    });

    it("replays them the same way after two stops in a row", async () => {
      const one = await uninterrupted();
      const { s, id, ai, outcomes } = await stopping([1, 3]);
      expect(outcomes).toEqual(["stale", "stale", "done"]);
      expect(await dayPages(s, id)).toEqual(one.pages);
      expect(s.runs.attemptStore.get(id)).toEqual(one.attempts);
      expect(ai.requests.length).toBe(one.requests);
    });

    it("stores a call only for the lease holder", async () => {
      const s = setup();
      const id = await started(s);
      await s.runs.claim(id, "lease-a");
      const call = { ask: { name: "workbook_page", slots: ["1.1"], panels: [] }, built: [], examples: [], refused: [], tries: { "1.1": 1 } };
      expect(await s.runs.saveCall(id, "lease-b", 3, 0, call)).toBe(false);
      expect(s.runs.callStore.get(id)?.size ?? 0).toBe(0);
      expect(await s.runs.saveCall(id, "lease-a", 3, 0, call)).toBe(true);
      // The first call stored at a page and place stays.
      expect(await s.runs.saveCall(id, "lease-a", 3, 0, { ...call, tries: { "1.1": 2 } })).toBe(true);
      expect(await s.runs.calls(id, [3])).toEqual([{ page: 3, seq: 0, call }]);
      expect(await s.runs.calls(id, [4])).toEqual([]);
    });
  });

  it("reads every attempt count past the database's row limit, page by page (R379-3-1)", async () => {
    const s = setup();
    // A store whose reads answer at most 1000 rows, as the database does.
    const limited = memoryRunStore({ children: { [CHILD]: PARENT }, now: s.now, newId: s.deps.newId, drafts: s.drafts, rowLimit: 1000 });
    const start = await startWorkbookRun(limited, CHILD, ADMIN);
    const id = (start as { runId: string }).runId;
    await limited.claim(id, "lease");
    // 1,050 slots on 35 pages; the last slot (in order) has used both attempts.
    for (let page = 3; page < 38; page++) {
      const slots = Array.from({ length: 30 }, (_, k) => `1.${k + 1}`);
      expect(await limited.useAttempts(id, "lease", page, slots)).toEqual({ refused: [] });
    }
    expect(await limited.useAttempts(id, "lease", 37, ["1.9"])).toEqual({ refused: [] });
    const counts = await limited.attempts(id);
    expect(counts.size).toBe(1050);
    expect(counts.get("37:1.9")).toBe(2);
  });

  it("gives a question its third AI attempt, the shorter rewrite, within the run's cap (SLOT_ATTEMPTS)", async () => {
    // Slot 1.1 fails the check on every call, and page 3 never fits: the first call, the redo and the shorter rewrite.
    const bad = (sl: { slot: string; skill: string }) => ({ slot: sl.slot, skill: sl.skill, difficulty: 2, text: "? + ? = ?", format: "write-number", operation: { kind: "add", operands: [], expression: null, unit: null, denominator: null, values: [] }, wrongAnswers: [], easier: null, shownWrong: null });
    const ai = fakeAiClient({ answer: (r) => ({ items: answer(r).items.map((it) => (it.slot === "1.1" ? bad(it) : it)) }) });
    const s = setup({ ai });
    s.deps.concurrency = 1;
    s.deps.fit = () => ({ fits: async (page) => (page.number === 3 ? { ok: false, problems: [{ question: null, reason: "the content does not fit the page" }] } : { ok: true }) });
    const id = await started(s);
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const run = (await s.runs.run(id))!;
    const draft = (await s.drafts.draft(run.draftId!))!;
    expect(draft.pages[2].questions.find((x) => x.slot === "1.1")).toMatchObject({ attempts: 3, check: { status: "failed" } });
    expect((await s.runs.attempts(id)).get("3:1.1")).toBe(3);
    const shorter = ai.requests.filter((r) => r.name === "workbook_page_shorter");
    expect(shorter).toHaveLength(1);
    expect((JSON.parse((shorter[0].content[0] as { text: string }).text) as { slots: { slot: string }[] }).slots.map((x) => x.slot)).toContain("1.1");
  });

  it("makes no AI call for a slot the store refuses, and stores it as failed with all its attempts used (R379-3-1)", async () => {
    const s = setup();
    s.deps.concurrency = 1;
    const id = await started(s);
    // Another reader missed these counts: the store still refuses the slot on page 3 that used both attempts.
    const runs = s.runs;
    const asked: string[] = [];
    s.deps.ai = fakeAiClient({ answer: (r) => {
      const req = JSON.parse((r.content[0] as { text: string }).text) as { slots: { slot: string }[] };
      asked.push(...req.slots.map((x) => x.slot));
      return answer(r);
    } });
    s.deps.runs = { ...runs, attempts: async () => new Map(), useAttempts: async (runId, lease, page, slots) => {
      if (page === 3 && slots.includes("1.1")) {
        const rest = slots.filter((x) => x !== "1.1");
        const counted = await runs.useAttempts(runId, lease, page, rest);
        return counted && { refused: ["1.1"] };
      }
      return runs.useAttempts(runId, lease, page, slots);
    } };
    expect(await runWorkbookJob(id, s.deps)).toBe("done");
    const draft = (await s.drafts.draft((await s.runs.run(id))!.draftId!))!;
    const q = draft.pages[2].questions.find((x) => x.slot === "1.1")!;
    expect(q).toMatchObject({ attempts: SLOT_ATTEMPTS, package: null, check: { status: "failed" } });
    // Page 3 is the first page written: its first call asked for every slot but 1.1.
    expect(asked.slice(0, draft.pages[2].questions.length - 1)).not.toContain("1.1");
  });

  it("reads as stopped when a running run has no progress for the stale time", () => {
    const now = new Date("2026-10-31T17:00:00.000Z");
    const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
    expect(runState({ status: "running", heartbeatAt: ago(30), createdAt: ago(60) }, now)).toBe("preparing");
    expect(runState({ status: "running", heartbeatAt: ago(STALE_SECONDS + 1), createdAt: ago(900) }, now)).toBe("stopped");
    expect(runState({ status: "queued", heartbeatAt: null, createdAt: ago(5) }, now)).toBe("waiting");
    expect(runState({ status: "stale", heartbeatAt: ago(5), createdAt: ago(5) }, now)).toBe("stopped");
    expect(runState({ status: "failed", heartbeatAt: ago(900), createdAt: ago(900) }, now)).toBe("failed");
    // D-200: a run queued for the Mac waits for the worker however long it takes; a server run does not.
    expect(runState({ status: "queued", heartbeatAt: null, createdAt: ago(STALE_SECONDS * 10), runner: "mac" }, now)).toBe("waiting");
    expect(runState({ status: "queued", heartbeatAt: null, createdAt: ago(STALE_SECONDS * 10), runner: "server" }, now)).toBe("stopped");
    expect(runState({ status: "running", heartbeatAt: ago(STALE_SECONDS + 1), createdAt: ago(900), runner: "mac" }, now)).toBe("stopped");
  });
});

describe("a run's plan, made once and stored (R379-8-2), and its solve checks kept by call (R379-8-1)", () => {
  /** The draft of a done run, without its QR tokens (random in live use, made again by a new call). */
  const draftOf = async (s: ReturnType<typeof setup>, id: string) => {
    const run = (await s.runs.run(id))!;
    expect(run.status).toBe("done");
    const draft = (await s.drafts.draft(run.draftId!))!;
    return { ...draft, pages: draft.pages.map((p) => ({ ...p, qrToken: "" })) };
  };
  /** A run whose job call stops at the given page save, as a function that ends does: it loses the run, nothing more written. */
  async function stoppedAt(s: ReturnType<typeof setup>, at = 1) {
    const id = await started(s);
    let saves = 0;
    const save = s.runs.savePage;
    s.deps.runs = { ...s.runs, savePage: async (runId, lease, page) => {
      if (++saves === at) {
        s.runs.runs.get(runId)!.lease = null;
        throw new Error("the function stopped");
      }
      return save(runId, lease, page);
    } };
    expect(await runWorkbookJob(id, s.deps)).toBe("stale");
    return id;
  }
  /** A child whose profile says 2.4 and 3.3 are not secure: a plan made from it starts a level lower (U9, not U10). */
  const weaker = { revision: 7, profile: { notYetSecure: ["2.4", "3.3"], standards: [] } as unknown as ChildLearnerProfile };

  it("a profile changed between a stop and a resume: the draft equals the draft of a run that never stopped", async () => {
    const BC = curriculumFor("bc")!;
    const was = planNextWorkbook({ curriculum: BC, grade: 3, profile: null, workbooks: [], number: 1 });
    const now = planNextWorkbook({ curriculum: BC, grade: 3, profile: weaker.profile, workbooks: [], number: 1 });
    // A plan made again from the new profile would be another book.
    expect(was.ok && now.ok && [was.plan.level, now.plan.level]).toEqual([10, 9]);

    const one = setup();
    const oneId = await started(one);
    expect(await runWorkbookJob(oneId, one.deps)).toBe("done");

    const s = setup();
    let inputs = child();
    s.deps.source = { inputs: async () => inputs };
    const id = await stoppedAt(s);
    expect(s.runs.pageStore.get(id)?.size ?? 0).toBe(0);
    expect(s.runs.callStore.get(id)!.size).toBeGreaterThan(0);
    inputs = child({ profile: weaker, workbooks: [] });
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("done");
    const resumed = await draftOf(s, id);
    expect(resumed).toEqual(await draftOf(one, oneId));
    expect(resumed).toMatchObject({ levels: [10], profileBuild: null });
    // The plan was stored once, by the first call, and holds no name.
    const frame = s.runs.frameStore.get(id)!;
    expect(frame).toMatchObject({ curriculum: "bc", grade: 3, profileRevision: null, workbooks: [], plan: { level: 10 } });
    expect(JSON.stringify(frame)).not.toContain("Leah");
  });

  it("refuses to go on, asking the AI nothing, when the curriculum, the planned book, a model or the code changed since the run started", async () => {
    const changes: [string, (s: ReturnType<typeof setup>, id: string) => void, RegExp][] = [
      ["curriculum", (s, id) => { s.runs.frameStore.get(id)!.versions.curriculum = "0".repeat(28); }, /the curriculum changed since it started/],
      ["outline", (s, id) => { s.runs.frameStore.get(id)!.versions.outline = "0".repeat(28); }, /the planned book \(its pages, layouts or rooms\) changed/],
      ["model", (s) => { s.deps.ai = { ...s.deps.ai!, model: "another/model" }; }, /the AI model changed since it started \(fake then, another\/model now\)/],
      ["solve model", (s) => { s.deps.solver = { ...s.deps.solver!, model: "another/reader" }; }, /the solve check's model changed/],
      ["code", (s) => { s.deps.build = "def456"; }, /the site's code changed since it started \(none then, def456 now\)/],
    ];
    for (const [, change, error] of changes) {
      const s = setup();
      const id = await stoppedAt(s);
      const asked = (s.ai as ReturnType<typeof fakeAiClient>).requests.length;
      change(s, id);
      expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
      expect((await s.runs.run(id))!.error).toMatch(error);
      expect((s.ai as ReturnType<typeof fakeAiClient>).requests.length).toBe(asked);
    }
  });

  it("renders a stored draft only on the code the run started on", async () => {
    // The call stops when only the render is left: the draft is stored, and the next call renders it.
    const s = setup({ budgetMs: 1e9 });
    s.deps.build = "abc123";
    const id = await started(s);
    const finish = s.runs.finish;
    s.deps.runs = { ...s.runs, finish: async (runId) => {
      s.runs.runs.get(runId)!.lease = null;
      return false;
    } };
    expect(await runWorkbookJob(id, s.deps)).toBe("stale");
    expect(await s.drafts.draft((await s.runs.run(id))!.draftKey)).not.toBeNull();
    s.deps.runs = { ...s.runs, finish };
    s.deps.build = "def456";
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
    expect((await s.runs.run(id))!.error).toBe("The run cannot go on: the site's code changed since it started (abc123 then, def456 now). Start a new run.");
  });

  it("refuses a run that kept pages or attempts with no stored plan (started before plans were stored)", async () => {
    const s = setup();
    const id = await stoppedAt(s);
    s.runs.frameStore.delete(id);
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
    expect((await s.runs.run(id))!.error).toBe("This run was started before a run's plan was stored, so it cannot go on safely. Start a new run.");
  });

  it("fails closed when a stored page or call does not fit the stored plan's pages and slots", async () => {
    // A stored page with a slot its planned page does not have.
    const s = setup();
    const id = await stoppedAt(s, 3);
    const [page] = s.runs.pageStore.get(id)!.values();
    page.questions[0].slot = "9.9";
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("failed");
    expect((await s.runs.run(id))!.error).toBe(`The run cannot go on: kept page ${page.number} has slot 9.9, which the plan's page does not have. Start a new run.`);

    // A stored call that asked other slots than its planned page's first call.
    const t = setup();
    const tid = await stoppedAt(t);
    const call = [...t.runs.callStore.get(tid)!.values()].find((c) => c.seq === 0)!;
    call.call.ask = { ...call.call.ask, slots: call.call.ask.slots.slice(1) };
    expect(await runWorkbookJob(tid, t.deps, { resume: true })).toBe("failed");
    expect((await t.runs.run(tid))!.error).toMatch(new RegExp(`^The run cannot go on: page ${call.page}: its kept call 0 is workbook_page of`));
  });

  it("stores a call before its solve checks; a stop during them resumes running only the checks with no stored result (R379-8-1)", async () => {
    // A reader that answers one more than the key for every printed question with "now" in it, and counts its checks.
    const reader = () => {
      let checks = 0;
      const solver: Solver = {
        model: "reader",
        solve: async (request) => {
          checks++;
          await new Promise((done) => setTimeout(done, 1));
          return { answers: request.key.map((k) => ({ question: k.question, box: k.box, answer: /now/.test(request.questions[0].text) && k.question === "question" ? String(Number(k.right[0]) + 1) : k.right[0] })), problem: null };
        },
      };
      return { solver, checks: () => checks };
    };
    const a = reader();
    const one = setup({ solver: a.solver });
    const oneId = await started(one);
    expect(await runWorkbookJob(oneId, one.deps)).toBe("done");
    const keys = one.runs.solveStore.get(oneId)!.map((x) => x.callKey!);
    // Every check is kept once, under its call key, and each ran once.
    expect(keys.every((k) => /^\d+:\d:(\d+\.\d+|e\d+)$/.test(k))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a.checks()).toBe(keys.length);
    expect(one.runs.solveStore.get(oneId)!.some((x) => x.verdict === "disagreed")).toBe(true);

    const b = reader();
    const s = setup({ solver: b.solver });
    const id = await started(s);
    let saves = 0;
    let stoppedAtKey: string | undefined;
    const saveSolves = s.runs.saveSolves;
    s.deps.runs = { ...s.runs, saveSolves: async (runId, lease, batch) => {
      if (++saves === 30) {
        stoppedAtKey = batch[0].callKey;
        s.runs.runs.get(runId)!.lease = null;
        throw new Error("the function stopped");
      }
      return saveSolves(runId, lease, batch);
    } };
    expect(await runWorkbookJob(id, s.deps)).toBe("stale");
    // The call whose check stopped the function was stored before its checks started.
    const [page, seq] = stoppedAtKey!.split(":").map(Number);
    expect(s.runs.callStore.get(id)!.has(`${page}:${seq}`)).toBe(true);
    const kept = s.runs.solveStore.get(id)!.length;
    expect(kept).toBe(29);
    const before = b.checks();
    s.deps.runs = s.runs;
    expect(await runWorkbookJob(id, s.deps, { resume: true })).toBe("done");
    // The resume ran only the checks with no stored result, and made the draft a run that never stopped makes.
    expect(b.checks() - before).toBe(keys.length - kept);
    expect(s.runs.solveStore.get(id)!.map((x) => x.callKey).sort()).toEqual([...keys].sort());
    expect(await draftOf(s, id)).toEqual(await draftOf(one, oneId));
    expect((s.ai as ReturnType<typeof fakeAiClient>).requests.length).toBe((one.ai as ReturnType<typeof fakeAiClient>).requests.length);
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


describe("R404 lease and runner regressions", () => {
  it("R404-1 renews during a call longer than the stale interval and aborts work when renewal fails", async () => {
    vi.useFakeTimers();
    try {
      let entered!: () => void;
      const startedCall = new Promise<void>((resolve) => { entered = resolve; });
      let requests = 0;
      const s = setup({ concurrency: 1, ai: { model: "slow", json: async (_request, signal) => {
        requests++;
        entered();
        return await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("lease lost")), { once: true });
        });
      } } });
      const id = await started(s);
      const running = runWorkbookJob(id, { ...s.deps, timeLimitMs: 10 * 60_000 });
      await startedCall;
      for (let i = 0; i < 14; i++) {
        s.tick(30);
        await vi.advanceTimersByTimeAsync(30_000);
      }
      expect(await s.runs.resume(id, "competing-lease", STALE_SECONDS)).toBeNull();
      expect((await s.runs.run(id))!.heartbeatAt).toBe(s.now().toISOString());
      s.deps.runs.renew = async () => false;
      s.tick(30);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await running).toBe("stale");
      expect(requests).toBe(1);
      expect(await s.runs.pages(id)).toEqual([]);
      expect(await s.drafts.draft((await s.runs.run(id))!.draftKey)).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("R404-1 makes no request when lease renewal throws", async () => {
    const s = setup({ concurrency: 1 });
    const id = await started(s);
    s.deps.runs.renew = async () => { throw new Error("offline"); };
    expect(await runWorkbookJob(id, s.deps)).toBe("stale");
    expect(pageCalls((s.ai as ReturnType<typeof fakeAiClient>).requests)).toBe(0);
  });

  it("R404-2 refuses a Mac claim or resume after the run is routed to the server", async () => {
    const s = setup();
    const id = await started(s);
    // The worker cached this candidate before the route selected server.
    expect(await runWorkbookJob(id, { ...s.deps, runner: "mac" })).toBe("not-claimed");
    expect(await s.runs.claim(id, "server", "server")).not.toBeNull();
    await s.runs.yield(id, "server");
    expect(await runWorkbookJob(id, { ...s.deps, runner: "mac" }, { resume: true })).toBe("not-claimed");
    expect(await s.runs.resume(id, "server-resume", STALE_SECONDS, "server")).not.toBeNull();
  });
});
