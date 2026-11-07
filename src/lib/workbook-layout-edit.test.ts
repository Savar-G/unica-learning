import { beforeAll, expect, it, vi } from "vitest";
import { buildPrintContract } from "./workbook-print-contract";
import { generateWorkbook, type GenerateInput, type GeneratedWorkbook } from "./workbook-generator";
import { curriculumFor } from "./workbook-curriculum";
import { planLevel, planWorkbook } from "./workbook-plan";
import { workbookFakeAi } from "./workbook-ai-fake";
import { keySolver } from "./workbook-solve-check";
import { memoryDraftStore } from "./workbook-draft-memory";
import { layoutCoverageProblem, layoutEditPlan, runWorkbookLayoutEdit, type LayoutEditDeps, type LayoutEditPlan } from "./workbook-layout-edit";
import { packageItem } from "./question-package";
import type { EditCheckpoint, EditFrame, EditSnapshot, ReviewComment } from "./workbook-edit";
import type { DraftRendering } from "./workbook-job";
import { commentFromRow } from "./workbook-edit-store";

vi.mock("server-only", () => ({}));

const id = "55555555-5555-4555-8555-000000000002", child = "22222222-2222-4222-8222-222222222222";
let draft: GeneratedWorkbook, input: GenerateInput;
let dayContent: GeneratedWorkbook["pages"][number]["content"];
let scalar: GeneratedWorkbook["pages"][number]["questions"][number];
beforeAll(async () => {
  const curriculum = curriculumFor("bc")!;
  const plan = planWorkbook({ profile: { standards: [] }, grade: 1, level: planLevel(curriculum, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 }, reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [] });
  if (!plan.ok) throw new Error(plan.reason);
  input = { workbookId: id, childId: child, number: 1, profileBuild: null, plan: plan.plan, curriculum, book: { child: "Test" } };
  let serial = 0;
  const result = await generateWorkbook(input, { ai: workbookFakeAi({ NODE_ENV: "test", WORKBOOK_AI_FAKE: "on" })!, solver: keySolver(), fit: { fits: async () => ({ ok: true }) }, store: memoryDraftStore({ [child]: id }), qrToken: () => `synthetic-token-${++serial}` });
  if (result.status !== "stored") throw new Error(result.status);
  dayContent = result.draft.pages.find(p => p.content?.kind === "day")!.content;
  scalar = result.draft.pages.flatMap(p => p.questions).find(q => q.package && packageItem(q.package).format === "write-number" && packageItem(q.package).scorable && !packageItem(q.package).parentChecked)!;
  draft = { ...result.draft, pages: result.draft.pages.slice(0, 2), counts: { ...result.draft.counts, pages: 2, questions: 0 } };
});

it("refuses a layout that loses a code-reading answer region", () => {
  expect(scalar).toBeTruthy();
  const answer = packageItem(scalar.package!).regions.find(r => r.kind === "box")!;
  const rendered = { number: 3, image: { path: "synthetic.png", width: 816, height: 1056 }, questions: [{ number: scalar.number,
    box: { x: 10, y: 10, width: 60, height: 60 }, regions: [{ id: answer.id, kind: "box" as const, box: { x: 10, y: 10, width: 60, height: 60 } }] }] };
  const source = { number: 3, questions: [scalar] };
  expect(layoutCoverageProblem(id, source, rendered)).toBeNull();
  expect(layoutCoverageProblem(id, source, { ...rendered, questions: [{ ...rendered.questions[0], regions: [] }] })).toMatch(/no complete marking/);
});

function image(number: number, hash = "a"): DraftRendering["pages"][number] {
  const page = draft.pages.find(p => p.number === number)!;
  const made = buildPrintContract({ workbookId: id, page: { ...page, questions: [] },
    marks: [{ name: "scan-tl", x: 24, y: 24, width: 12, height: 12 }, { name: "scan-tr", x: 780, y: 24, width: 12, height: 12 },
      { name: "scan-br", x: 780, y: 1020, width: 12, height: 12 }, { name: "scan-bl", x: 24, y: 1020, width: 12, height: 12 }].map(m => ({ ...m, visible: true })),
    image: { width: 816, height: 1056, sha256: hash.repeat(64) }, css: { width: 816, height: 1056 } });
  if (made.problem) throw new Error(made.problem);
  return { number, image: { path: `${hash}-${number}.png`, width: 816, height: 1056 }, questions: [], printContract: made.contract };
}

function setup() {
  const snapshot: EditSnapshot = { draft: structuredClone(draft), input, parentId: id, revision: 1, problems: [], rendering: { pdfPath: "old.pdf", pages: draft.pages.map(p => image(p.number)) } };
  const comment: ReviewComment = { id: "layout-comment", draftId: id, revision: 1, page: 1, question: null, x: 0.5, y: 0.5,
    note: "Use normal capitals on the cover", route: "layout", item: null, actor: { id: "admin", email: "test@example.com" }, createdAt: "2026-11-07T00:00:00Z", status: "pending", error: null, batchId: null, before: null, after: null };
  const plan: LayoutEditPlan = { build: "reviewed-source", pages: [1], results: [{ id: comment.id, page: 1, status: "applied", note: "Normal display case is now printed." }] };
  let currentFrame: EditFrame | null = null, owned = true;
  const checkpoints = new Map<number, EditCheckpoint>();
  const finish = vi.fn<LayoutEditDeps["store"]["finish"]>(async () => true);
  const renderPage = vi.fn<LayoutEditDeps["renderPage"]>(async (_s, n) => ({ page: image(n, "b"), paths: [`b-${n}.png`] }));
  const assemble = vi.fn<LayoutEditDeps["assemble"]>(async () => ({ pdfPath: "new.pdf", paths: ["new.pdf"] }));
  const deps: LayoutEditDeps = { build: "reviewed-source", runner: "mac", newId: () => "lease", renderPage, assemble,
    store: { claim: async () => ({ draftId: id, revision: 1, plan }), load: async () => snapshot,
      frame: async (_id, _lease, frame) => { currentFrame ??= { solveModel: frame.solveModel, model: frame.model, build: frame.build, calls: frame.calls, layoutPages: frame.layoutPages }; return currentFrame; },
      checkpoints: async () => [...checkpoints.values()], checkpoint: async (_id, _lease, value) => { if (!owned) return false; checkpoints.set(value.number, structuredClone(value)); return true; }, finish } };
  return { snapshot, comment, plan, deps, finish, renderPage, assemble, checkpoints, expire: () => { owned = false; } };
}

it("requires explicit reviewed outcomes, current comments, a build and real page scope", () => {
  const s = setup(), value = { reviewed: true, pages: [1], results: s.plan.results };
  expect(layoutEditPlan(value, [s.comment], s.snapshot, "reviewed-source")).toEqual(s.plan);
  for (const broken of [null, {}, { ...value, reviewed: false }, { ...value, pages: [1, 1] }, { ...value, pages: [999] },
    { ...value, results: [{ ...s.plan.results[0], note: "" }] }, { ...value, results: [{ ...s.plan.results[0], id: "foreign" }] }]) {
    expect(layoutEditPlan(broken, [s.comment], s.snapshot, "reviewed-source")).toBeNull();
  }
  expect(layoutEditPlan(value, [{ ...s.comment, revision: 2 }], s.snapshot, "reviewed-source")).toBeNull();
  expect(layoutEditPlan(value, [s.comment], s.snapshot, null)).toBeNull();
  expect(layoutEditPlan({ ...value, results: [{ ...s.plan.results[0], status: "unsupported" }] }, [s.comment], s.snapshot, "reviewed-source")?.results[0].status).toBe("unsupported");
});

it("preserves an explicit layout route and its result through row conversion and plan admission", () => {
  const s = setup();
  const page = s.snapshot.draft.pages[0];
  page.content = dayContent;
  const comment = commentFromRow({ id: s.comment.id, draft_id: id, parent_id: id, child_id: child,
    revision: 1, page_number: 1, question_number: null, x: 0.5, y: 0.5,
    note: "Make this easier to read.", item: null, actor_id: "admin", actor_email: "test@example.com",
    created_at: s.comment.createdAt, status: "failed", error: null, batch_id: null,
    before_value: null, after_value: null, request_key: null, client_request_key: null,
    route: "layout", result_note: "The previous correction was incomplete." });
  expect(comment.route).toBe("layout");
  expect(comment.resultNote).toBe("The previous correction was incomplete.");
  expect(layoutEditPlan({ reviewed: true, pages: [1], results: s.plan.results }, [comment], s.snapshot, "reviewed-source")).toEqual(s.plan);
});

it("renders only reviewed pages and passes the other image and all saved content through unchanged", async () => {
  const s = setup(), before = structuredClone(s.snapshot.draft), other = s.snapshot.rendering!.pages[1];
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("done");
  expect(s.renderPage.mock.calls.map(c => c[1])).toEqual([1]);
  expect(s.assemble.mock.calls[0][1][1]).toBe(other);
  expect(s.snapshot.draft).toEqual(before);
  expect(s.finish.mock.calls[0][2]).toMatchObject({ results: [{ status: "applied" }], rendering: { pdfPath: "new.pdf" } });
});

it("reuses saved image checkpoints and accepts a JSONB frame with different key order", async () => {
  const s = setup();
  s.checkpoints.set(1, { number: 1, image: image(1, "b") });
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("done");
  expect(s.renderPage).not.toHaveBeenCalled();
});

it.each(["partial", "unsupported"] as const)("keeps the reviewed %s outcome truthful when another request can apply", async status => {
  const s = setup();
  s.plan.results.push({ ...s.plan.results[0], id: "another", status, note: "This request still needs work." });
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("done");
  expect(s.finish.mock.calls[0][2]).toMatchObject({ results: [expect.objectContaining({ status: "applied" }), expect.objectContaining({ status })] });
});

it("does not make a revision for an unchanged page", async () => {
  const s = setup();s.renderPage.mockResolvedValue({ page: image(1), paths: [] });
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("failed");
  expect(s.assemble).not.toHaveBeenCalled();
  expect(s.finish.mock.calls[0][2]).toMatchObject({ error: expect.stringContaining("All comments stay open") });
});

it.each(["page", "content", "invalid contract"])("refuses a changed %s proof", async kind => {
  const s = setup(), next = image(1, "b");
  if (kind === "page") next.printContract!.page = 2;
  else if (kind === "content") next.printContract!.fingerprints.content = "c".repeat(64);
  else next.printContract = null;
  s.renderPage.mockResolvedValue({ page: next, paths: [] });
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("failed");
  expect(s.assemble).not.toHaveBeenCalled();
});

it("refuses saved-content mutation and a changed reviewed source", async () => {
  const s = setup();
  s.renderPage.mockImplementation(async snapshot => { snapshot.draft.pages[0].qrToken = "changed";return { page: image(1, "b"), paths: [] }; });
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("failed");
  expect(s.assemble).not.toHaveBeenCalled();
  const t = setup();t.deps.build = "another-source";
  expect(await runWorkbookLayoutEdit("batch", t.deps)).toBe("failed");
  expect(t.renderPage).not.toHaveBeenCalled();
});

it("does not dispatch on the server or finish after an expired checkpoint", async () => {
  const s = setup();s.deps.runner = "server";
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("not-claimed");
  expect(s.renderPage).not.toHaveBeenCalled();
  s.deps.runner = "mac";s.expire();
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("not-claimed");
  expect(s.finish).not.toHaveBeenCalled();
});

it("retains an uncertain finish rather than attempting another save or deleting committed files", async () => {
  const s = setup();s.finish.mockRejectedValue(new Error("reply lost"));
  expect(await runWorkbookLayoutEdit("batch", s.deps)).toBe("failed");
  expect(s.finish).toHaveBeenCalledTimes(1);
});
