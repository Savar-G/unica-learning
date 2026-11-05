import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { checkQuestionPackage, type Item, type QuestionPackage } from "@/lib/question-package";
import type { WorkbookInput } from "@/lib/workbook-content";
import { curriculumFor, curriculumVersion } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { runWorkbookEdit, type EditJobDeps, type EditSnapshot } from "@/lib/workbook-edit";
import { memoryWorkbookReview } from "@/lib/workbook-edit-memory";
import { renderableDraft } from "@/lib/workbook-fit";
import type { FitCheck, GeneratedWorkbook } from "@/lib/workbook-generator";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { runWorkbookJob, startWorkbookRun, type DraftRendering, type RunFrame, type WorkbookJobDeps } from "@/lib/workbook-job";
import { layoutProblems } from "@/lib/workbook-layout-check";
import type { DayContent, PageContent } from "@/lib/workbook-page";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import {
  manifestProblem,
  pageContentFingerprint,
  printContractForPhoto,
  scanManifest,
  sha256Hex,
  teachingContext,
  type TeachingFrame,
} from "@/lib/workbook-print-contract";
import { mark, proofPages, renderedPages, renderWorkbook, type MeasuredElement, type WorkbookDraft, type WorkbookTemplate } from "@/lib/workbook-render";
import { teachingFrame } from "@/lib/workbook-teaching-frame";
import { sampleDraft } from "@/lib/workbook-sample";
import { sampleBook } from "@/lib/workbook-sample-book";
import { approveDraft, approvedWorkbook, type DraftForApproval } from "@/lib/workbook-ship";
import { memoryShipStore } from "@/lib/workbook-ship-memory";
import { workbookShipStore } from "@/lib/workbook-ship-store";
import { keySolver } from "@/lib/workbook-solve-check";
import { memoryWorkbookFiles, memoryWorkbookStore } from "@/lib/workbook-store-memory";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { workbookTemplate } from "@/lib/workbook-template";

// The print contract (#536) through public interfaces, with the fake print engine and the real page templates. Each
// test names what would disprove it: a field lost on the way from render to store, a contract that survives a change, a
// bad mark that still gives a contract, or a legacy book that gets one.

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" };
const NOW = "2026-11-04T18:00:00.000Z";
const SCALE = 150 / 96;

const answer = (r: AiJsonRequest) => fakeWorkbookItems(r);
const fits: FitCheck = { fits: async () => ({ ok: true }) };
// (The template's fit check reads real measurements, which the fake engine does not make. The Chromium test runs it.)
const template: WorkbookTemplate = { ...workbookTemplate(), fit: undefined };

/** A whole draft made by the real job, with its stored plan and revision 1 as the job stored it. */
async function jobRun() {
  let clock = new Date(NOW), ids = 0, tokens = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const drafts = memoryDraftStore({ [CHILD]: PARENT });
  const runs = memoryRunStore({ children: { [CHILD]: PARENT }, now: () => clock, newId, drafts });
  const files = memoryWorkbookFiles();
  const deps: WorkbookJobDeps = {
    itemPolicy: "approved-v1", runs, drafts, files, ai: fakeAiClient({ answer: (r) => { clock = new Date(clock.getTime() + 1000); return answer(r); } }),
    template, fit: () => fits, engine: fakePrintEngine(), solver: keySolver(),
    source: {
      inputs: async (id) => (id === CHILD ? { parentId: PARENT, name: "Leah", grade: 1, province: "BC", profile: null, workbooks: [] } : null),
      prepareProfile: async () => ({ ok: true, profile: null }),
    },
    newId, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`, fileKey: () => `k${ids}`,
    now: () => clock.getTime(), concurrency: 4, budgetMs: 1e9,
  };
  const start = await startWorkbookRun(runs, CHILD, ADMIN);
  if (start.status !== "started") throw new Error(start.status);
  expect(await runWorkbookJob(start.runId, deps)).toBe("done");
  const run = (await runs.run(start.runId))!;
  const draft = (await drafts.draft(run.draftId!))!;
  return { runId: start.runId, draft, frame: (await runs.frame(start.runId))!, revision: runs.revisions[0] };
}

const engine = () => fakePrintEngine();

/** The draft rendered whole with every question passing, as approval needs: the job's own proofs are for the failed ones. */
async function rendered(draft: GeneratedWorkbook, key: string): Promise<DraftRendering> {
  const result = await renderWorkbook({ draft: renderableDraft(draft), parentId: PARENT, template, engine: engine(), fileKey: key });
  if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 3)));
  return { pdfPath: result.workbook.pdfPath, pdfSha256: result.workbook.pdfSha256, pages: renderedPages(result) };
}

const frameOf = (f: RunFrame): TeachingFrame => teachingFrame(f);

function setupShip(...d: DraftForApproval[]) {
  const workbooks = memoryWorkbookStore({ children: [{ id: CHILD, parentId: PARENT }], now: () => new Date(NOW) });
  const drafts = new Map(d.map((x) => [x.runId, x]));
  return { workbooks, drafts, ship: memoryShipStore({ workbooks, drafts, now: () => new Date(NOW) }) };
}

const storable = (p: QuestionPackage) => ["checked", "not-checked"].includes(checkQuestionPackage(p).status);

let made: Awaited<ReturnType<typeof jobRun>>;
let sound: GeneratedWorkbook;
let rendering: DraftRendering;
let approval: DraftForApproval;

beforeAll(async () => {
  made = await jobRun();
  // Every question passes, so the book can be approved. The fake's chance repeats are not what this file tests.
  sound = structuredClone(made.draft);
  for (const p of sound.pages) {
    p.fit = p.fit.status === "failed" ? { status: "fits" } : p.fit;
    const good = p.questions.find((q) => q.package && storable(q.package));
    for (const q of p.questions) {
      if (q.check.status === "failed") q.check = { status: "checked" };
      // (A package the store would refuse takes a sound one's content, in its own place.)
      if (!q.package || !storable(q.package)) {
        q.package = { ...structuredClone(good!.package!), id: `${good!.package!.id}:${q.number}`, ref: { source: "workbook", workbookId: sound.id, page: p.number, question: q.number } };
      }
    }
  }
  rendering = await rendered(sound, "r1");
  approval = { runId: made.runId, runDone: true, draftId: sound.id, revision: 1, oldFormat: false, draft: sound, rendering, renderProblems: [], frame: frameOf(made.frame) };
}, 400_000);

describe("render, job, approval and store", () => {
  it("the job keeps each rendered page's contract and regions in revision 1, and a proof has none", () => {
    // Disproved if the job maps pages to number, image and boxes only, as it did before #536.
    const pages = made.revision.rendering!.pages;
    const real = pages.filter((p) => !p.proof);
    expect(real.length).toBeGreaterThan(0);
    for (const p of real) expect(p.printContract).toMatchObject({ page: p.number, workbookId: made.draft.id });
    expect(real.flatMap((p) => p.questions).every((q) => Array.isArray(q.regions))).toBe(true);
    for (const p of pages.filter((x) => x.proof)) expect(p.printContract ?? null).toBeNull();
    expect(made.revision.rendering!.pdfSha256 ?? null).toEqual(made.revision.rendering!.pdfPath ? expect.stringMatching(/^[0-9a-f]{64}$/) : null);
  });

  it("every page of the book has a contract in declared units: the marks, their order, the image and the fingerprints", async () => {
    // Disproved by a page with no contract, or a coordinate not at the template's 22 px corner in image pixels.
    expect(rendering.pages).toHaveLength(sound.pages.length);
    const c = rendering.pages[0].printContract!;
    expect(c.coordinates).toEqual({
      units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait",
      image: { width: 1275, height: 1650 }, cssPage: { width: 816, height: 1056 }, scale: { x: 1275 / 816, y: 1650 / 1056 },
    });
    expect(c.marks.anchor).toBe("outer-corner");
    expect(c.marks.order).toEqual(["tl", "tr", "br", "bl"]);
    expect(c.marks.points).toEqual({
      tl: { x: 34.375, y: 34.375 }, tr: { x: 1240.625, y: 34.375 }, br: { x: 1240.625, y: 1615.625 }, bl: { x: 34.375, y: 1615.625 },
    });
    expect(rendering.pages.every((p) => p.printContract && p.contractProblem === null)).toBe(true);
    const page = sound.pages.find((p) => p.day === 1 && p.questions.length > 0)!;
    const contract = rendering.pages.find((p) => p.number === page.number)!.printContract!;
    expect(contract).toMatchObject({ day: 1, pageOfDay: page.pageOfDay, label: (page.content as DayContent).id });
    expect(contract.fingerprints.image).toMatch(/^[0-9a-f]{64}$/);
    expect(contract.fingerprints.content).toBe(pageContentFingerprint(renderableDraft(sound).pages.find((p) => p.number === page.number)!));
    const cover = rendering.pages[0].printContract!;
    expect([cover.day, cover.pageOfDay]).toEqual([null, null]);
  });

  it("approval keeps every field through the store, as one unit with a revision", async () => {
    // Disproved if a field is lost on approval or in the store, or the revision is absent or a timestamp.
    const { workbooks, ship } = setupShip(approval);
    expect(await approveDraft(ship, { runId: made.runId, revision: 1, actor: ADMIN })).toEqual({ status: "approved", workbookId: sound.id });
    const w = (await workbooks.workbook(sound.id))!;
    expect(w.printedRevision).toMatch(/^[0-9a-f]{28}$/);
    expect(w.pdfSha256).toBe(rendering.pdfSha256);
    expect(w.printManifest).toMatchObject({ testWorkbook: false, snapshotDay: 7, levelTest: null, curriculum: { key: "bc", version: curriculumVersion("bc") } });
    expect(w.pages.map((p) => p.printContract)).toEqual(rendering.pages.map((p) => p.printContract));
    expect(w.pages.flatMap((p) => p.questions.map((q) => q.regions))).toEqual(rendering.pages.flatMap((p) => p.questions.map((q) => q.regions)));
    const questions = w.pages.flatMap((p) => p.questions);
    expect(questions.length).toBeGreaterThan(0);
    // Every question's plan is frozen, and its regions are the package's regions by id: item and region stay distinct.
    const planned = w.pages.filter((p) => !sound.pages.find((x) => x.number === p.number)?.content || !(sound.pages.find((x) => x.number === p.number)!.content as DayContent).extraPractice);
    expect(planned.flatMap((p) => p.questions).filter((q) => !q.teaching)).toEqual([]);
    for (const q of questions) {
      if (q.content.status !== "found") throw new Error("a stored question did not read");
      expect(q.regions!.map((r) => r.id)).toEqual((q.content.package.item?.regions ?? [{ id: "answer" }]).map((r) => r.id));
    }
    expect(ship.audit[0].detail).toMatchObject({ printedRevision: w.printedRevision });
  });

  it("teaching context keeps the planned step and the step the item really tests apart, each complete", () => {
    // Disproved by a reference that mixes two steps: a unit or number of the planned part with a skill of the item.
    const w = approvedWorkbook(approval);
    const curriculum = curriculumFor("bc")!;
    const plan = made.frame.plan;
    const counts = { planned: 0, otherSkill: 0, earlierReview: 0, withoutTemplate: 0 };
    for (const p of sound.pages) {
      if (p.content?.kind !== "day" || p.content.extraPractice) continue;
      const planned = plan.days.find((d) => d.day === (p.content as DayContent).day)!.pages.find((x) => x.number === (p.content as DayContent).page)!;
      for (const q of p.questions) {
        const t = w.pages.find((x) => x.number === p.number)!.questions.find((x) => x.number === q.number)!.teaching!;
        const part = planned.parts[Number(q.slot.split(".")[0]) - 1];
        const template = q.itemPlan?.template;
        expect(t).toMatchObject({ part: part.kind, slot: q.slot, practiceType: q.place ?? null, curriculum: { key: "bc", version: curriculumVersion("bc") } });
        expect(t.plannedStep).toEqual(part.step ? { unit: part.step.unit, skill: part.step.skill, step: part.step.step } : null);
        if (template) {
          // The step the question tests, whole: its unit is its own skill's, never the planned part's.
          expect(t.itemStep).toEqual({ unit: curriculum.skill(template.skill)!.unit, skill: template.skill, step: template.step });
          if (part.step && template.skill !== part.step.skill) counts.otherSkill++;
          if (!part.step) counts.earlierReview++;
        } else {
          counts.withoutTemplate++;
          if (t.itemStep) expect(t.itemStep).toEqual(t.plannedStep);
        }
        if (part.step) counts.planned++;
        expect("unit" in t || "skill" in t).toBe(false);
        // The practice type is the block the question printed in.
        expect(t.practiceType).toBe((p.content as DayContent).blocks.find((b) => b.items.includes(q.number))!.slot);
      }
    }
    // Each case above must have run on this book.
    expect(counts.planned).toBeGreaterThan(0);
    expect(counts.otherSkill).toBeGreaterThan(0);
    expect(counts.earlierReview).toBeGreaterThan(0);
  });

  it("the manifest requires each printed day's question pages, and never a cover, padding or extra page", () => {
    const m = approvedWorkbook(approval).printManifest!;
    const byNumber = new Map(sound.pages.map((p) => [p.number, p]));
    expect(m.days.map((d) => d.day)).toEqual(made.frame.plan.days.map((d) => d.day));
    for (const d of m.days) for (const n of d.pages) expect(byNumber.get(n)).toMatchObject({ day: d.day });
    const required = new Set(m.days.flatMap((d) => d.pages));
    for (const p of sound.pages.filter((x) => x.day === null)) expect(required.has(p.number)).toBe(false);
    expect(sound.pages.some((p) => p.type === "cover" || p.type === "blank")).toBe(true);
  });
});

describe("the units a teaching context reads", () => {
  // The contract is permanent, so its units are those of the curriculum the run was planned on, not today's.
  const plan = {} as WorkbookPlan;
  const curriculumNow = curriculumVersion("bc")!;

  it("the job freezes each skill's unit on the run's frame", () => {
    expect(made.frame.units?.["1.1-count-to-20"]).toBe("1.1");
    expect(made.frame.units?.[Object.keys(made.frame.units ?? {})[0]]).toBe(curriculumFor("bc")!.skill(Object.keys(made.frame.units ?? {})[0])!.unit);
  });

  it("a frame's own units win, even when the curriculum has changed since", () => {
    expect(teachingFrame({ curriculum: "bc", versions: { curriculum: "older" }, plan, units: { "x-skill": "x.1" } })!.units).toEqual({ "x-skill": "x.1" });
  });

  it("a frame from before the units reads them only from the same curriculum version; else it has none", () => {
    expect(teachingFrame({ curriculum: "bc", versions: { curriculum: curriculumNow }, plan })!.units["1.1-count-to-20"]).toBe("1.1");
    expect(teachingFrame({ curriculum: "bc", versions: { curriculum: "older" }, plan })!.units).toEqual({});
  });
});

describe("the Supabase ship store", () => {
  it("reads the run's stored plan and sends the whole contract to approve_workbook_draft", async () => {
    // Disproved if the store drops the plan (no teaching context or manifest), or the request loses a contract field.
    const sent: Record<string, unknown>[] = [];
    const rows: Record<string, unknown> = {
      workbook_runs: { status: "done", draft_id: sound.id },
      workbook_drafts: { schema_version: 2, draft: JSON.parse(JSON.stringify(sound)) },
      workbook_draft_revisions: { revision: 1, content: null, rendering: JSON.parse(JSON.stringify(rendering)), render_problems: [] },
      workbook_run_frames: { frame: JSON.parse(JSON.stringify(made.frame)) },
    };
    const db = createClient<Database>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/approve_workbook_draft") {
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ status: "approved", workbookId: sound.id });
      }
      const row = rows[url.pathname.replace("/rest/v1/", "")];
      if (!row) throw new Error(`unexpected ${url.pathname}`);
      return new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json" ? Response.json(row) : Response.json([row]);
    } } });
    const store = workbookShipStore(db);
    const d = (await store.draftForApproval(made.runId))!;
    expect(d.frame).toMatchObject({ curriculum: made.frame.curriculum, curriculumVersion: made.frame.versions.curriculum, plan: JSON.parse(JSON.stringify(made.frame.plan)) });
    expect(d.frame?.units["1.1-count-to-20"]).toBe("1.1");
    expect(await approveDraft(store, { runId: made.runId, revision: 1, actor: ADMIN })).toEqual({ status: "approved", workbookId: sound.id });
    const w = sent[0].p_workbook as WorkbookInput;
    expect(w.printedRevision).toMatch(/^[0-9a-f]{28}$/);
    expect(w.printedRevision).toBe(approvedWorkbook(approval).printedRevision);
    expect(w.pages.every((p) => p.printContract)).toBe(true);
    expect(w.printManifest?.days.length).toBeGreaterThan(0);
    expect(w.pages.flatMap((p) => p.questions).filter((q) => q.teaching).length).toBeGreaterThan(0);
  });
});

describe("a changed revision changes its contract as one unit", () => {
  /** An edit of one page through the real edit job, then approval of the new revision. */
  async function edited() {
    const snapshot: EditSnapshot = {
      draft: structuredClone(sound), rendering: structuredClone(rendering), problems: [], revision: 1, parentId: PARENT,
      input: { workbookId: sound.id, childId: CHILD, number: sound.number, profileBuild: sound.profileBuild, plan: made.frame.plan, curriculum: curriculumFor("bc")!, book: { child: "Leah" } },
    };
    const review = memoryWorkbookReview(snapshot);
    let serial = 0;
    const deps: EditJobDeps = {
      store: review.store, runner: "mac", newId: () => `lease-${++serial}`,
      // The note takes effect through the person and the thing the AI names: code rewrites the printed words.
      generation: { ai: fakeAiClient({ answer: (r) => ({ items: fakeWorkbookItems(r).items.map((x) => ({ ...x, name: "Mia", thing: "apples" })) }) }), solver: keySolver(), fit: fits, store: memoryDraftStore({ [CHILD]: PARENT }), qrToken: () => `edit-token-${++serial}`.padEnd(22, "x") },
      async renderPage(_s, draft, number) {
        const one = renderableDraft(draft);
        one.pages = one.pages.filter((p) => p.number === number);
        const result = await renderWorkbook({ draft: one, parentId: PARENT, template, engine: engine(), fileKey: `edit${number}` });
        if (result.status !== "rendered") throw new Error(result.problems[0].reason);
        return { page: renderedPages(result)[0], paths: [] };
      },
      assemble: async () => ({ pdfPath: `${PARENT}/${sound.id}/workbook-edit.pdf`, pdfSha256: await sha256Hex(new TextEncoder().encode("edited pdf")), paths: [] }),
      remove: async () => {},
    };
    const isStory = (q: GeneratedWorkbook["pages"][number]["questions"][number]) => q.itemPlan?.source === "story" && /How many/.test(q.package?.text ?? "");
    const page = sound.pages.find((p) => p.day !== null && p.questions.some(isStory))!;
    const target = page.questions.find(isStory)!;
    const question = target.number;
    expect(review.save({ draftId: sound.id, revision: 1, page: page.number, question, x: .2, y: .2, note: "Use apples", item: null, actor: ADMIN, createdAt: NOW }).status).toBe("saved");
    const sent = review.send(1, "mac");
    if (sent.status !== "queued") throw new Error(sent.reason);
    const outcome = await runWorkbookEdit(sent.id, deps);
    expect([outcome, review.comments[0].error, target.package!.text]).toEqual(["done", null, target.package!.text]);
    const after = review.snapshot();
    return { page: page.number, question, after };
  }

  it("the edited page's contract and the revision change; other pages keep theirs; re-approval replaces them together", async () => {
    // Disproved if a new revision keeps the old identity, or if the book keeps part of an old contract.
    const { workbooks, drafts, ship } = setupShip(approval);
    await approveDraft(ship, { runId: made.runId, revision: 1, actor: ADMIN });
    const first = (await workbooks.workbook(sound.id))!;

    const { page, after } = await edited();
    expect(after.revision).toBe(2);
    expect(after.rendering!.pdfSha256).not.toBe(rendering.pdfSha256);
    const before = new Map(rendering.pages.map((p) => [p.number, p.printContract]));
    for (const p of after.rendering!.pages) {
      // (The edited page was rendered again: this book's code-worded stories print the same words, so its fingerprint
      // may stay. The next test changes the content. Every other page keeps its contract untouched.)
      if (p.number === page) expect(p.printContract).toMatchObject({ page, workbookId: sound.id });
      else expect(p.printContract).toEqual(before.get(p.number));
    }

    // The database's finish_workbook_edit takes the stored workbook back to draft, which ends the revision.
    workbooks.setStatus(sound.id, "draft");
    expect((await workbooks.workbook(sound.id))!.printedRevision).toBeNull();

    drafts.set(made.runId, { ...approval, revision: 2, draft: { ...after.draft }, rendering: after.rendering });
    expect(await approveDraft(ship, { runId: made.runId, revision: 2, actor: ADMIN })).toMatchObject({ status: "approved" });
    const second = (await workbooks.workbook(sound.id))!;
    expect(second.printedRevision).toMatch(/^[0-9a-f]{28}$/);
    expect(second.printedRevision).not.toBe(first.printedRevision);
    expect(second.pdfSha256).toBe(after.rendering!.pdfSha256);
    const pageAfter = second.pages.find((p) => p.number === page)!;
    expect(pageAfter.printContract).toEqual(after.rendering!.pages.find((p) => p.number === page)!.printContract);

    // A photo identified against the first revision cannot use the second's calibration.
    expect(printContractForPhoto(second, pageAfter, { printedRevision: first.printedRevision })).toEqual({ status: "unavailable", reason: "other-revision" });
    expect(printContractForPhoto(second, pageAfter, { printedRevision: second.printedRevision })).toMatchObject({ status: "available", revision: second.printedRevision, contract: { page } });
  }, 60_000);

  it("a page rendered with changed content has a new content fingerprint, and the book a new revision", async () => {
    // Disproved if a content change leaves the contract or the revision as it was.
    const number = sound.pages.find((p) => p.day !== null && p.questions.length > 0)!.number;
    const changed = structuredClone(sound);
    changed.pages.find((p) => p.number === number)!.questions[0].package!.text += " Changed.";
    const render = await rendered(changed, "r2");
    const fresh = render.pages.find((p) => p.number === number)!.printContract!;
    expect(fresh.fingerprints.content).not.toBe(rendering.pages.find((p) => p.number === number)!.printContract!.fingerprints.content);
    const w1 = approvedWorkbook(approval);
    const w2 = approvedWorkbook({ ...approval, draft: changed, rendering: render });
    expect(w2.printedRevision).toMatch(/^[0-9a-f]{28}$/);
    expect(w2.printedRevision).not.toBe(w1.printedRevision);
    expect(w2.pages.find((p) => p.number === number)!.printContract).toEqual(fresh);
  }, 120_000);

  it("a page whose content is not what its contract printed takes the whole book's contract away", () => {
    // Disproved if approval trusts a stored contract without comparing the content it names.
    const changed = structuredClone(approval);
    changed.draft.pages.find((p) => p.questions.length > 0)!.questions[0].package!.text += " Changed.";
    const w = approvedWorkbook(changed);
    expect(w.printedRevision).toBeNull();
    expect(w.pages.every((p) => p.printContract === null)).toBe(true);
    expect(w.printManifest).toBeNull();
    expect(w.pages.flatMap((p) => p.questions).every((q) => q.regions === null)).toBe(true);
  });

  it("a contract whose printed day is not the draft page's day gives no contract", () => {
    // Disproved if the day identity comes only from a stored contract, never compared with the page it describes.
    const moved = structuredClone(approval);
    const number = moved.draft.pages.find((p) => p.day !== null)!.number;
    moved.rendering!.pages.find((p) => p.number === number)!.printContract!.day = 99;
    expect(approvedWorkbook(moved).printedRevision).toBeNull();
  });

  it("only a draft takes a contract, and only with all its pages and questions: a printed book never changes", async () => {
    // The memory store keeps the database's rule (migration workbook_print_contract_lock, probed on the hosted database).
    const { workbooks, ship } = setupShip(approval);
    await approveDraft(ship, { runId: made.runId, revision: 1, actor: ADMIN });
    const whole = approvedWorkbook(approval);
    const before = (await workbooks.workbook(sound.id))!;
    for (const to of ["approved", "printed", "shipped"] as const) {
      workbooks.setStatus(sound.id, to);
      expect(() => workbooks.applyPrintContract({ ...whole, pages: [], printedRevision: null, pdfSha256: null, printManifest: null })).toThrow(/cannot change/);
      expect(() => workbooks.applyPrintContract(whole)).toThrow(/cannot change/);
    }
    const after = (await workbooks.workbook(sound.id))!;
    expect([after.printedRevision, after.pdfSha256, after.printManifest]).toEqual([before.printedRevision, before.pdfSha256, before.printManifest]);
    // A draft: a call with no pages or no questions changes nothing either.
    workbooks.setStatus(sound.id, "draft");
    const draft = (await workbooks.workbook(sound.id))!;
    expect(() => workbooks.applyPrintContract({ ...whole, pages: [] })).toThrow(/pages/);
    const page = whole.pages.find((p) => p.questions.length > 0)!;
    expect(() => workbooks.applyPrintContract({ ...whole, pages: whole.pages.map((p) => (p === page ? { ...p, questions: [] } : p)) })).toThrow(/questions/);
    expect((await workbooks.workbook(sound.id))!.pdfSha256).toBe(draft.pdfSha256);
    workbooks.applyPrintContract(whole);
    expect((await workbooks.workbook(sound.id))!.printedRevision).toBe(whole.printedRevision);
  });

  it("a book with part of a contract has none", () => {
    const part = structuredClone(approval);
    part.rendering!.pages[1].printContract = null;
    const w = approvedWorkbook(part);
    expect(w.printedRevision).toBeNull();
    expect(w.pages.every((p) => p.printContract === null)).toBe(true);
  });
});

describe("a book from before #536", () => {
  /** A revision stored before the contract: number, image and boxes only. */
  const legacy = (): DraftForApproval => ({
    ...structuredClone(approval),
    frame: null,
    rendering: {
      pdfPath: rendering.pdfPath,
      pages: rendering.pages.map((p) => ({ number: p.number, image: p.image, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) })),
    },
  });

  it("stays approvable and stored, with no revision and no automatic marking", async () => {
    // Disproved if the old book is refused, or if it gets any invented contract.
    const { workbooks, ship } = setupShip(legacy());
    expect(await approveDraft(ship, { runId: made.runId, revision: 1, actor: ADMIN })).toMatchObject({ status: "approved" });
    const w = (await workbooks.workbook(sound.id))!;
    expect(w.printedRevision).toBeNull();
    expect(w.printManifest).toBeNull();
    expect(w.pages.every((p) => p.printContract === null && p.questions.every((q) => q.regions === null && q.teaching === null))).toBe(true);
    expect(w.pages[0].image).toEqual(rendering.pages[0].image);
    // A photo keeps its old timestamp identity as evidence, and automatic marking stays unavailable.
    expect(printContractForPhoto(w, w.pages[0], { printedRevision: "2026-11-01 00:00:00+00" })).toEqual({ status: "unavailable", reason: "no-contract" });
  });
});

// ---------- The scan marks ----------

const draftOf = (book = sampleBook({ level: "U12", workbookId: "55555555-5555-4555-8555-000000000021", childId: CHILD, child: "Mateo", number: 1 }).draft): WorkbookDraft => ({
  ...book, pages: book.pages.filter((p) => p.content?.kind === "day").slice(0, 1),
});
const renderWith = (o: { rects?: Record<string, { x: number; y: number; width: number; height: number }>; hidden?: string[]; template?: WorkbookTemplate }) =>
  renderWorkbook({ draft: draftOf(), parentId: PARENT, template: o.template ?? template, engine: fakePrintEngine({ rects: o.rects, hidden: o.hidden }) });

describe("scan mark validation", () => {
  const TL = { x: 22, y: 22, width: 18, height: 18 };

  it("a positive control: the template's own marks give a contract", async () => {
    const r = await renderWith({});
    if (r.status !== "rendered") throw new Error("not rendered");
    expect(r.workbook.pages[0].printContract).toMatchObject({ marks: { points: { tl: { x: 22 * SCALE, y: 22 * SCALE } } } });
    expect(r.pages[0].contractProblem).toBeNull();
  });

  const cases: [string, Parameters<typeof renderWith>[0], RegExp][] = [
    ["a hidden mark", { hidden: ["1 scan-tl"] }, /scan-tl is hidden/],
    ["a mark off the page", { rects: { "1 scan-tr": { x: 810, y: 22, width: 18, height: 18 } } }, /scan-tr is off the page/],
    ["a mark with no size", { rects: { "1 scan-br": { x: 776, y: 1016, width: 0, height: 18 } } }, /scan-br has no size/],
    ["a mark moved out of the rectangle", { rects: { "1 scan-bl": { x: 60, y: 1016, width: 18, height: 18 } } }, /do not form a rectangle/],
    ["marks of different sizes", { rects: { "1 scan-tl": { ...TL, width: 30 } } }, /not the same size/],
    ["top and bottom swapped", { rects: { "1 scan-tl": { x: 22, y: 1016, width: 18, height: 18 }, "1 scan-tr": { x: 776, y: 1016, width: 18, height: 18 }, "1 scan-bl": TL, "1 scan-br": { x: 776, y: 22, width: 18, height: 18 } } }, /not at the page's corners/],
    ["left and right swapped", { rects: { "1 scan-tl": { x: 776, y: 22, width: 18, height: 18 }, "1 scan-tr": TL, "1 scan-bl": { x: 776, y: 1016, width: 18, height: 18 }, "1 scan-br": { x: 22, y: 1016, width: 18, height: 18 } } }, /not at the page's corners/],
    ["marks bunched in one area", { rects: { "1 scan-tl": TL, "1 scan-tr": { x: 100, y: 22, width: 18, height: 18 }, "1 scan-bl": { x: 22, y: 100, width: 18, height: 18 }, "1 scan-br": { x: 100, y: 100, width: 18, height: 18 } } }, /not at the page's corners/],
  ];
  it.each(cases)("%s gives no contract, and the page still renders", async (_name, o, reason) => {
    const r = await renderWith(o);
    if (r.status !== "rendered") throw new Error(`failed: ${JSON.stringify(r.problems)}`);
    expect(r.workbook.pages[0].printContract).toBeNull();
    expect(r.pages[0].contractProblem).toMatch(reason);
  });

  /** The real template with its marks changed. */
  const withMarks = (change: (html: string) => string): WorkbookTemplate => ({
    ...template, page: (page, parts, book) => { const html = template.page(page, parts, book); return html === null ? null : change(html); },
  });

  it.each<[string, (html: string) => string, RegExp]>([
    ["a missing mark", (h) => h.replace(`<i class="scan br" ${mark.scanMark("br")}></i>`, ""), /no scan-br/],
    ["no marks", (h) => h.replace(/<i class="scan [a-z]+" data-measure="scan-[a-z]+"><\/i>/g, ""), /no scan marks/],
    ["a duplicate mark", (h) => h.replace(`<i class="scan br" ${mark.scanMark("br")}></i>`, `<i class="scan br" ${mark.scanMark("br")}></i><i class="scan br" ${mark.scanMark("br")}></i>`), /scan-br more than once/],
    ["an unknown mark", (h) => `${h}<i data-measure="scan-middle"></i>`, /unknown scan mark, scan-middle/],
  ])("%s gives no contract, not a failed page", async (_name, change, reason) => {
    const r = await renderWith({ template: withMarks(change) });
    if (r.status !== "rendered") throw new Error(`failed: ${JSON.stringify(r.problems)}`);
    expect(r.workbook.pages[0].printContract).toBeNull();
    expect(r.pages[0].contractProblem).toMatch(reason);
  });

  it("a template with no marks renders with no contract, and its other paths keep working", async () => {
    // Disproved if a path with no marks crashes, or if it gets a contract anyway.
    const sample = sampleDraft({ workbookId: "55555555-5555-4555-8555-000000000022", childId: CHILD, qrTokens: [1, 2, 3].map((n) => `fixed-page-token-${n}`.padEnd(20, "x")) });
    const r = await renderWorkbook({ draft: sample, parentId: PARENT, template: fixedTemplate(), engine: fakePrintEngine() });
    if (r.status !== "rendered") throw new Error(JSON.stringify(r.problems));
    expect(r.workbook.pages.every((p) => p.printContract === null)).toBe(true);
    expect(r.pages.every((p) => /no scan marks/.test(p.contractProblem ?? ""))).toBe(true);
    expect((await proofPages({ draft: draftOf(), template, engine: fakePrintEngine(), problems: [{ page: draftOf().pages[0].number, question: null, reason: "x" }] }))).toHaveLength(1);
  });

  it("no check of the page reads a scan mark: the template's fit check never sees one", async () => {
    let seen: string[] = [];
    await renderWith({ template: { ...template, fit: (_p, measured) => { seen = [...measured.keys()]; return []; } } });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((n) => n.startsWith("scan-"))).toEqual([]);
  });

  it("the layout checks ignore scan-* names, even with a clipped line", () => {
    // Disproved by the negative control: the same clip on a question's text is a problem.
    const page = draftOf().pages[0];
    const content: PageContent = { ...(page.content as DayContent), consistentLayout: true };
    const at = (name: string): MeasuredElement => ({
      sheet: 0, name, text: "x", visible: true, textPrinted: true, x: 22, y: 22, width: 18, height: 18, clientWidth: 18, clientHeight: 18, scrollWidth: 18, scrollHeight: 18,
      firstLine: { x: 22, y: 22, width: 18, height: 18, baseline: 36 }, clip: { top: 9, bottom: 9, left: 9, right: 9 },
    });
    const run = (name: string) => layoutProblems({ ...page, content }, new Map([[name, at(name)]]), { rows: [], beside: new Map() });
    expect(run("scan-tl")).toEqual([]);
    expect(run("question-1-content").map((p) => p.reason).join()).toMatch(/cut by its box/);
  });
});

describe("answer regions as printed", () => {
  it("each region has its measured box in image pixels; a region the page did not measure has none", async () => {
    // Disproved if a missing region is dropped or given a box it never printed in.
    const draft = draftOf();
    const q = draft.pages[0].questions.find((x) => x.package.item || x.package.answer)!;
    const number = draft.pages[0].number;
    const r = await renderWorkbook({
      draft, parentId: PARENT, template, engine: fakePrintEngine({ rects: { [`1 question-${q.number}`]: { x: 100, y: 200, width: 300, height: 100 } } }),
    });
    if (r.status !== "rendered") throw new Error(JSON.stringify(r.problems));
    const out = r.workbook.pages.find((p) => p.number === number)!.questions.find((x) => x.number === q.number)!;
    expect(out.regions!.length).toBeGreaterThan(0);
    // The fake lays an answer space over the question's lower 70%.
    const answerRegion = out.regions!.find((x) => x.box)!;
    expect(answerRegion.box).toEqual({ x: 100 * SCALE, y: 230 * SCALE, width: 300 * SCALE, height: 70 * SCALE });

    const hidden = await renderWorkbook({
      draft, parentId: PARENT,
      template: { ...template, page: (page, parts, book) => template.page(page, parts, book)!.replace(new RegExp(`data-measure="region-${q.number}-[^"]*"`, "g"), "") },
      engine: fakePrintEngine(),
    });
    if (hidden.status !== "rendered") throw new Error(JSON.stringify(hidden.problems));
    const again = hidden.workbook.pages[0].questions.find((x) => x.number === q.number)!;
    expect(again.regions!.map((x) => x.id)).toEqual(out.regions!.map((x) => x.id));
    expect(again.regions!.filter((x, i) => x.box === null && i > 0).length).toBe(out.regions!.length - 1);
  });
});

// ---------- Teaching context and eligibility ----------

describe("teaching context", () => {
  const item = (o: Partial<Item>): Item => ({ format: "write-number", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "box", answer: null } as unknown as Item["regions"][number]], checks: [], error: null, ...o });
  const pkg = (i: Item, skills: string[] = ["2.4-add"]): QuestionPackage => ({
    id: "q", ref: { source: "workbook", workbookId: "w", page: 1, question: 1 }, templateId: null, text: "1 + 1 = ?", item: i, answer: null, operation: null,
    steps: [{ id: "worked-step-99" } as unknown as QuestionPackage["steps"][number]], skill: { standard: "2.4", skills }, level: 10, difficulty: 1, wrongAnswers: [], easierExample: null,
  });
  const plan = {
    days: [{ day: 1, pages: [{ number: 1, parts: [{ kind: "new-idea", unit: "A", step: { unit: "2.4", skill: "2.4-add", step: 3 }, skills: ["2.4-add"], extra: true }, { kind: "remember-these", unit: null, step: null, skills: ["2.1-count"] }] }] }],
  } as unknown as WorkbookPlan;
  const frame: TeachingFrame = { curriculum: "bc", curriculumVersion: "v1", plan, units: { "2.4-add": "2.4", "2.1-count": "2.1", "K5-take-away-change": "K.5" } };
  const page = { content: { kind: "day", day: 1, page: 1 } as unknown as PageContent, expected: [{ slot: "2.1", steps: ["2.1-count#2"] }] };

  it("freezes the planned part and slot, and a whole planned step: not the worked solution's step id", () => {
    expect(teachingContext(frame, page, { slot: "1.1", part: "new-idea", place: "now-you", package: pkg(item({})) })).toEqual({
      version: 1, curriculum: { key: "bc", version: "v1" }, practiceType: "now-you", part: "new-idea", slot: "1.1", extra: true, track: "A",
      plannedStep: { unit: "2.4", skill: "2.4-add", step: 3 }, itemStep: { unit: "2.4", skill: "2.4-add", step: 3 }, reviewSteps: [],
      eligibility: { format: "write-number", scorable: true, parentChecked: false, mastery: true, reason: null },
    });
  });

  it("an item from another skill keeps both steps whole: Codex's K5-take-away-change on a counting part", () => {
    // The bug: unit and step of the planned part, skill of the item. Each reference must be one step.
    const t = teachingContext(frame, page, { slot: "1.1", part: "new-idea", place: "word-problems", package: pkg(item({}), ["K5-take-away-change", "2.4-add"]), itemPlan: { template: { skill: "K5-take-away-change", step: 3 } } })!;
    expect(t.plannedStep).toEqual({ unit: "2.4", skill: "2.4-add", step: 3 });
    expect(t.itemStep).toEqual({ unit: "K.5", skill: "K5-take-away-change", step: 3 });
    expect(t.eligibility).toMatchObject({ mastery: true, reason: null });
  });

  it("a question reviewing an earlier step of the same skill names that step, and the planned step stays apart", () => {
    const t = teachingContext(frame, page, { slot: "1.2", part: "new-idea", place: "on-your-own", package: pkg(item({})), itemPlan: { template: { skill: "2.4-add", step: 1 } } })!;
    expect(t.plannedStep).toEqual({ unit: "2.4", skill: "2.4-add", step: 3 });
    expect(t.itemStep).toEqual({ unit: "2.4", skill: "2.4-add", step: 1 });
  });

  it("a review part has no planned step; its item names the step it reviews, and keeps the slot's steps", () => {
    const t = teachingContext(frame, page, { slot: "2.1", part: "remember-these", package: pkg(item({}), ["2.1-count"]), itemPlan: { template: { skill: "2.1-count", step: 2 } } })!;
    expect(t).toMatchObject({ plannedStep: null, itemStep: { unit: "2.1", skill: "2.1-count", step: 2 }, reviewSteps: ["2.1-count#2"], eligibility: { mastery: true } });
  });

  it("an item step is never partial or guessed: no unit, a template the package does not name, or a written item off the planned skill", () => {
    const unknown = teachingContext(frame, page, { slot: "1.1", part: "new-idea", package: pkg(item({}), ["9.9-unknown", "2.4-add"]), itemPlan: { template: { skill: "9.9-unknown", step: 2 } } })!;
    const stale = teachingContext(frame, page, { slot: "1.1", part: "new-idea", package: pkg(item({}), ["2.4-add"]), itemPlan: { template: { skill: "2.1-count", step: 2 } } })!;
    const offSkill = teachingContext(frame, page, { slot: "1.1", part: "new-idea", package: pkg(item({}), ["2.1-count"]) })!;
    for (const t of [unknown, stale, offSkill]) {
      expect(t.itemStep).toBeNull();
      expect(t.plannedStep).toEqual({ unit: "2.4", skill: "2.4-add", step: 3 });
      expect(t.eligibility).toMatchObject({ mastery: false, reason: "no-item-step" });
    }
  });

  it("a planned step with no known unit is left out, not stored in part", () => {
    const noStepUnit = { ...plan, days: [{ day: 1, pages: [{ number: 1, parts: [{ kind: "new-idea", unit: "A", step: { unit: "", skill: "2.4-add", step: 3 }, skills: [] }] }] }] } as unknown as WorkbookPlan;
    expect(teachingContext({ ...frame, plan: noStepUnit }, page, { slot: "1.1", part: "new-idea", package: pkg(item({})) })!.plannedStep).toBeNull();
  });

  it.each<[string, Item, string | undefined, string]>([
    ["a scorable Try first", item({}), "try-first", "try-first"],
    ["a written reason", item({ format: "written-reason", scorable: false }), "now-you", "not-scorable"],
    ["a parent-checked item", item({ scorable: false, parentChecked: true }), "now-you", "parent-checked"],
  ])("%s never counts toward mastery", (_name, i, place, reason) => {
    const t = teachingContext(frame, page, { slot: "1.1", part: "new-idea", place, package: pkg(i) })!;
    expect(t.eligibility).toMatchObject({ mastery: false, reason });
  });

  it("a review question with no step of its own is not eligible", () => {
    expect(teachingContext(frame, page, { slot: "2.1", part: "remember-these", package: pkg(item({}), ["2.1-count"]) })!.eligibility).toMatchObject({ mastery: false, reason: "no-item-step" });
  });

  it("a slot the stored plan does not hold has no context: it is not rebuilt from anything else", () => {
    expect(teachingContext(frame, page, { slot: "9.1", part: "new-idea", package: pkg(item({})) })).toBeNull();
    expect(teachingContext(frame, page, { slot: "1.1", part: "another-part", package: pkg(item({})) })).toBeNull();
    expect(teachingContext(frame, { content: { kind: "cover" } as unknown as PageContent }, { slot: "1.1", part: "new-idea", package: pkg(item({})) })).toBeNull();
  });
});

// ---------- The scan manifest ----------

describe("the scan manifest", () => {
  const dayPage = (number: number, day: number, pageOfDay: number, questions: { slot: string; part: string }[] = [{ slot: "1.1", part: "practice" }]) =>
    ({ number, type: "practice", dayLabel: `Day ${day}`, day, pageOfDay, questions });
  const book = (number: number, type: string) => ({ number, type, dayLabel: null, day: null, pageOfDay: null, questions: [] });
  const part = (kind = "practice", over = {}) => ({ kind, unit: null, step: null, skills: [], ...over });
  const planOf = (days: { day: number; pages: { number: number; parts: unknown[]; extraPractice?: boolean }[] }[], testWorkbook = false) => ({ days, testWorkbook }) as unknown as WorkbookPlan;
  const frameFor = (plan: WorkbookPlan): TeachingFrame => ({ curriculum: "bc", curriculumVersion: "v1", plan, units: {} });
  const ordinary = planOf([{ day: 1, pages: [{ number: 1, parts: [part()] }, { number: 2, parts: [part()] }] }, { day: 7, pages: [{ number: 1, parts: [part()] }] }]);

  it("lists each day's question pages; covers, padding and extra practice stay out", () => {
    const pages = [book(1, "cover"), book(2, "how-plan"), dayPage(3, 1, 1), dayPage(4, 1, 2), dayPage(5, 7, 1), { ...book(6, "practice"), dayLabel: "Extra practice", questions: [{ slot: "1.1", part: "practice" }] }, book(7, "back-cover"), book(8, "blank")];
    expect(scanManifest(frameFor(ordinary), pages).manifest).toEqual({
      version: 1, curriculum: { key: "bc", version: "v1" }, testWorkbook: false, snapshotDay: 7, levelTest: null,
      days: [{ day: 1, pages: [3, 4] }, { day: 7, pages: [5] }],
    });
  });

  it("does not require a page that holds only an optional block, or a page with no questions", () => {
    const plan = planOf([{ day: 1, pages: [{ number: 1, parts: [part()] }, { number: 2, parts: [part("challenge", { extra: true })] }, { number: 3, parts: [part()] }] }]);
    const pages = [dayPage(1, 1, 1), dayPage(2, 1, 2, [{ slot: "1.1", part: "challenge" }]), dayPage(3, 1, 3, [])];
    expect(scanManifest(frameFor(plan), pages).manifest?.days).toEqual([{ day: 1, pages: [1] }]);
  });

  it("freezes all of a test workbook's Day 7 as the level test", () => {
    const test = part("level-test");
    const plan = planOf([{ day: 6, pages: [{ number: 1, parts: [part()] }] }, { day: 7, pages: [{ number: 1, parts: [test] }, { number: 2, parts: [test] }] }], true);
    const pages = [dayPage(1, 6, 1), dayPage(2, 7, 1, [{ slot: "1.1", part: "level-test" }]), dayPage(3, 7, 2, [{ slot: "1.1", part: "level-test" }])];
    expect(scanManifest(frameFor(plan), pages).manifest).toMatchObject({ testWorkbook: true, levelTest: { day: 7, pages: [2, 3] } });
  });

  it("takes the real planner's test workbook: all of Day 7 is the level test", () => {
    // Disproved if the plan's own test workbook does not satisfy the manifest's rule.
    const curriculum = curriculumFor("bc")!;
    const level = planLevel(curriculum, "U10")!;
    const passed = Object.fromEntries(level.units.flatMap((u) => u.skills.filter((k) => k.delivery !== "warm-up").map((k) => [k.id, k.delivery === "activity" ? 1 : k.steps.length || 3])));
    const result = planWorkbook({ profile: { standards: [] }, grade: 3, level, passed, workbook: { number: 5, inLevel: 4 }, reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [] });
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.testWorkbook).toBe(true);
    let number = 0;
    const pages = result.plan.days.flatMap((d) => d.pages.filter((p) => !p.extraPractice).map((p) => dayPage(++number, d.day, p.number, [{ slot: "1.1", part: p.parts[0].kind }])));
    const m = scanManifest(frameFor(result.plan), pages);
    expect(m.problem).toBeNull();
    expect(m.manifest!.levelTest!.day).toBe(7);
    expect(m.manifest!.levelTest!.pages).toEqual(pages.filter((p) => p.day === 7).map((p) => p.number));
    expect(m.manifest!.levelTest!.pages.length).toBeGreaterThan(0);
  });

  it.each<[string, WorkbookPlan, ReturnType<typeof dayPage>[], RegExp]>([
    ["a planned page that did not print", ordinary, [dayPage(3, 1, 1), dayPage(5, 7, 1)], /Day 1's printed pages/],
    ["a printed day the plan does not have", ordinary, [dayPage(3, 1, 1), dayPage(4, 1, 2), dayPage(5, 7, 1), dayPage(6, 9, 1)], /printed day is not in the plan/],
    ["a day with nothing to scan", ordinary, [dayPage(3, 1, 1, []), dayPage(4, 1, 2, []), dayPage(5, 7, 1)], /Day 1 has no pages/],
    ["a level test in an ordinary workbook", planOf([{ day: 7, pages: [{ number: 1, parts: [part("level-test")] }] }]), [dayPage(1, 7, 1, [{ slot: "1.1", part: "level-test" }])], /not a test workbook/],
    ["a test workbook whose Day 7 is partly something else", planOf([{ day: 7, pages: [{ number: 1, parts: [part("level-test")] }, { number: 2, parts: [part()] }] }], true), [dayPage(1, 7, 1, [{ slot: "1.1", part: "level-test" }]), dayPage(2, 7, 2)], /Day 7 is not its level test/],
  ])("gives no manifest for %s", (_name, plan, pages, reason) => {
    const r = scanManifest(frameFor(plan), pages);
    expect(r.manifest).toBeNull();
    expect(r.problem).toMatch(reason);
  });

  it("the store's check refuses a cover, padding, a wrong day, an empty page and a page twice", () => {
    const m = (days: { day: number; pages: number[] }[], levelTest: unknown = null, testWorkbook = levelTest !== null) => ({ version: 1, curriculum: {}, testWorkbook, snapshotDay: 7, days, levelTest });
    const pages = [{ ...book(1, "cover") }, { ...book(2, "blank") }, dayPage(3, 1, 1), dayPage(4, 7, 1), dayPage(5, 1, 2, [])];
    expect(manifestProblem(m([{ day: 1, pages: [3] }]), pages)).toBeNull();
    expect(manifestProblem(m([{ day: 1, pages: [1] }]), pages)).toMatch(/not a page of Day 1/);
    expect(manifestProblem(m([{ day: 1, pages: [2] }]), pages)).toMatch(/not a page of Day 1/);
    expect(manifestProblem(m([{ day: 2, pages: [3] }]), pages)).toMatch(/not a page of Day 2/);
    expect(manifestProblem(m([{ day: 1, pages: [5] }]), pages)).toMatch(/no questions/);
    expect(manifestProblem(m([{ day: 1, pages: [3, 3] }]), pages)).toMatch(/twice/);
    expect(manifestProblem(m([{ day: 1, pages: [99] }]), pages)).toMatch(/not in the book/);
    expect(manifestProblem(m([{ day: 7, pages: [4] }], { day: 7, pages: [4] }), pages)).toBeNull();
    expect(manifestProblem(m([{ day: 1, pages: [3] }], { day: 1, pages: [3] }), pages)).toMatch(/not on Day 7/);
    expect(manifestProblem(m([{ day: 7, pages: [4] }], { day: 7, pages: [] }), pages)).toMatch(/not Day 7's required/);
    expect(manifestProblem(m([{ day: 7, pages: [4] }], null, true), pages)).toMatch(/kind of workbook/);
  });
});

describe("the fingerprints", () => {
  it("a stored value gives the same content fingerprint: jsonb changes key order, not meaning", () => {
    // Disproved if approval would mistake a jsonb round trip for changed content, and lose the book's contract.
    const page = { number: 3, dayLabel: "Day 1", type: "practice", qrToken: "t", questions: [{ number: 1, package: { b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } } }], content: { z: 1, a: "é" } };
    const shuffled = { content: { a: "é", z: 1 }, questions: [{ package: { a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }, number: 1 }], qrToken: "t", type: "practice", dayLabel: "Day 1", number: 3 };
    expect(pageContentFingerprint(shuffled)).toBe(pageContentFingerprint(page));
    expect(pageContentFingerprint({ ...page, qrToken: "other" })).not.toBe(pageContentFingerprint(page));
    expect(pageContentFingerprint({ ...page, content: { z: 2, a: "é" } })).not.toBe(pageContentFingerprint(page));
    const { content: _c, ...none } = page;
    void _c;
    expect(pageContentFingerprint({ ...none, content: undefined })).toBe(pageContentFingerprint(none));
  });
});
