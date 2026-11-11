import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { FIRST_DAY_PAGES, firstPagesProblem, runFirstPagesJob, type FirstPagesJobDeps } from "@/lib/first-pages";
import { memoryFirstPagesStore } from "@/lib/first-pages-memory";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { FIRST_PAGES_CHANGED, runWorkbookJob, startWorkbookRun, STALE_SECONDS, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import type { FitCheck, GeneratedPage } from "@/lib/workbook-generator";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { workbookTemplate } from "@/lib/workbook-template";
import { keySolver } from "@/lib/workbook-solve-check";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";

// The first pages of Workbook 1 (docs/first-pages.md) through the job's public interface: the in-memory stores, the
// fake AI with the dev fake's items, the key solver, the fake print engine and the real templates and generator. Then
// "Prepare next workbook" for Workbook 1 keeps exactly those pages.

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const OTHER_CHILD = "00000000-0000-4000-8000-0000000000c2";
const OTHER_PARENT = "00000000-0000-4000-8000-0000000000f2";
const TEST = "00000000-0000-4000-8000-0000000000a1";
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" };
const fits: FitCheck = { fits: async () => ({ ok: true }) };

const child = (over: Partial<ChildInputs> = {}): ChildInputs => ({
  parentId: PARENT, name: "Leah", grade: 4, province: "BC", profile: { revision: 1, profile: firstCustomerProfile() }, workbooks: [], ...over,
});

/** The day pages each AI request was for, as "<day>:<page of the day>": the page writer names them in its request. */
const pagesAsked = (requests: AiJsonRequest[]) => [...new Set(requests.filter((r) => r.name === "workbook_page").map((r) => {
  const asked = JSON.parse((r.content[0] as { text: string }).text) as { day: number; page: number };
  return `${asked.day}:${asked.page}`;
}))];
const placeOf = (p: GeneratedPage) => `${p.day}:${p.pageOfDay}`;

function setup(o: { inputs?: ChildInputs; itemPolicy?: "approved-v1" | "legacy"; fail?: () => boolean } = {}) {
  let clock = new Date("2026-11-10T17:00:00.000Z");
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  let tokens = 0;
  const qrToken = () => `token-${String(++tokens).padStart(12, "0")}`;
  // (Late bound: the runs are made below.)
  const first = memoryFirstPagesStore({ now: () => clock, newId,
    runActive: async (childId) => (await allRuns()).some((r) => r.childId === childId && (r.status === "queued" || r.status === "running" || r.status === "done")) });
  const files = memoryWorkbookFiles();
  const ai = fakeAiClient({ answer: (r) => { if (o.fail?.()) throw new Error("the AI provider answered 500"); return fakeWorkbookItems(r); } });
  const inputs: Record<string, ChildInputs> = { [CHILD]: o.inputs ?? child(), [OTHER_CHILD]: child({ parentId: OTHER_PARENT, name: "Kai" }) };
  const source: WorkbookJobDeps["source"] = {
    inputs: async (id) => (inputs[id] ? structuredClone(inputs[id]) : null),
    prepareProfile: async (id) => ({ ok: true, profile: inputs[id]?.profile ?? null }),
  };
  const deps: FirstPagesJobDeps = {
    store: first.store, runner: "mac", source, files, ai, solver: keySolver(), template: workbookTemplate(), fit: () => fits, engine: fakePrintEngine(),
    newId, qrToken, fileKey: () => `k${ids}`, now: () => clock.getTime(), build: "commit-a", itemPolicy: o.itemPolicy ?? "approved-v1",
  };
  const drafts = memoryDraftStore({ [CHILD]: PARENT, [OTHER_CHILD]: OTHER_PARENT });
  const runs = memoryRunStore({ children: { [CHILD]: PARENT, [OTHER_CHILD]: OTHER_PARENT }, now: () => clock, newId, drafts, firstPages: first.forRuns });
  const runDeps = (over: Partial<WorkbookJobDeps> = {}): WorkbookJobDeps => ({
    itemPolicy: o.itemPolicy ?? "approved-v1", runs, drafts, files, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), template: workbookTemplate(),
    fit: () => fits, engine: fakePrintEngine(), newId, qrToken, fileKey: () => `r${ids}`, now: () => clock.getTime(), concurrency: 4, budgetMs: 1e9,
    build: "commit-b",
    source: { ...source, firstPages: async (id) => first.ready(id, await allRuns()) },
    ...over,
  });
  const runIds: string[] = [];
  const allRuns = async () => (await Promise.all(runIds.map((id) => runs.run(id)))).filter((r) => r !== null);
  const startRun = async (childId = CHILD) => {
    const s = await startWorkbookRun(runs, childId, ADMIN);
    if (s.status !== "started") throw new Error(s.status);
    runIds.push(s.runId);
    return s.runId;
  };
  return { first, files, deps, ai, inputs, runs, drafts, runDeps, startRun, allRuns, tick: (s: number) => { clock = new Date(clock.getTime() + s * 1000); }, now: () => clock };
}

const printed = (p: GeneratedPage) => ({ number: p.number, type: p.type, qrToken: p.qrToken, questions: p.questions.map((q) => ({ slot: q.slot, number: q.number, package: q.package, check: q.check })), content: p.content });

describe("first pages", () => {
  it("writes only the cover, the first lesson and its two practice pages, prints them, and Workbook 1 keeps them exactly", async () => {
    const s = setup();
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("ready");

    const ready = (await s.first.store.get(set.id))!;
    expect(ready.status).toBe("ready");
    const result = ready.result!;
    // Four pages: the cover, a lesson page with its worked example, two practice pages of its topic, on its day.
    expect(result.cover).toMatchObject({ number: 1, type: "cover", content: { kind: "cover", child: "Leah", workbook: 1 } });
    expect(result.pages.map((p) => p.type)).toEqual(["new-idea", "practice", "practice-2"]);
    expect(new Set(result.pages.map((p) => p.day)).size).toBe(1);
    const lesson = result.pages[0];
    expect(lesson.content?.kind === "day" && lesson.content.blocks.some((b) => b.slot === "worked-example")).toBe(true);
    const topic = (p: GeneratedPage) => (p.content?.kind === "day" ? p.content.title : null);
    expect(new Set(result.pages.map(topic)).size).toBe(1);
    expect(firstPagesProblem(result.pages)).toBeNull();
    // Only these three day pages went to the AI: no other page of the book was written.
    expect(pagesAsked(s.ai.requests as AiJsonRequest[]).every((n) => result.pages.some((p) => placeOf(p) === n))).toBe(true);
    expect((await s.first.store.pages(set.id)).map((p) => p.number)).toEqual(result.pages.map((p) => p.number));
    expect(result.counts.dayPages).toBe(FIRST_DAY_PAGES);
    expect(result.counts.writerCalls).toBe((await s.first.store.calls(set.id, result.pages.map((p) => p.number))).length);
    expect(result.counts.writerCalls).toBeLessThanOrEqual(FIRST_DAY_PAGES * 3);
    // One PDF and four page images, in the family's folder for Workbook 1's id.
    expect(result.files.images.map((i) => i.number)).toEqual([1, ...result.pages.map((p) => p.number)]);
    const paths = [result.files.pdf.path, ...result.files.images.map((i) => i.path)];
    for (const p of paths) {
      expect(p.startsWith(`${PARENT}/${set.workbookId}/`)).toBe(true);
      expect(s.files.files.has(p)).toBe(true);
    }
    expect(result.files.pdf.bytes).toBe(s.files.files.get(result.files.pdf.path)!.bytes.length);

    // Workbook 1: the run takes the reserved id, keeps the three pages and the cover's QR code, writes the rest.
    const runId = await s.startRun();
    const runAi = fakeAiClient({ answer: fakeWorkbookItems });
    expect(await runWorkbookJob(runId, s.runDeps({ ai: runAi }))).toBe("done");
    const run = (await s.runs.run(runId))!;
    expect(run.draftKey).toBe(set.workbookId);
    const draft = (await s.drafts.draft(run.draftId!))!;
    expect(draft.id).toBe(set.workbookId);
    for (const kept of result.pages) expect(printed(draft.pages.find((p) => p.number === kept.number)!)).toEqual(printed(kept));
    const cover = draft.pages[0];
    expect(cover.qrToken).toBe(result.cover.qrToken);
    const { minutes: _a, ...coverNow } = cover.content as unknown as Record<string, unknown>;
    const { minutes: _b, ...coverThen } = result.cover.content as unknown as Record<string, unknown>;
    void _a; void _b;
    expect(coverNow).toEqual(coverThen);
    // The run asked the AI for no kept page, and every QR code of the book is its own.
    expect(pagesAsked(runAi.requests as AiJsonRequest[]).some((n) => result.pages.some((p) => placeOf(p) === n))).toBe(false);
    expect(new Set(draft.pages.map((p) => p.qrToken)).size).toBe(draft.pages.length);
    expect((await s.runs.frame(runId))?.firstPages).toMatchObject({ id: set.id, pages: result.pages.map((p) => p.number), coverToken: result.cover.qrToken });
    expect((await s.first.store.get(set.id))?.keptBy).toBe(runId);
    // The book keeps them: they can no longer be hidden.
    expect(s.first.decide(set.id, "drop", await s.allRuns())).toBe(false);
    expect((await s.first.store.get(set.id))?.status).toBe("ready");
  }, 240_000);

  it("refuses Workbook 1 before any AI call when the new plan no longer makes the first pages, until the admin chooses", async () => {
    const s = setup();
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("ready");
    // The name the cover prints changed since the pages were made.
    s.inputs[CHILD] = child({ name: "Leia" });
    const runAi = fakeAiClient({ answer: fakeWorkbookItems });
    const runId = await s.startRun();
    expect(await runWorkbookJob(runId, s.runDeps({ ai: runAi }))).toBe("failed");
    expect((await s.runs.run(runId))?.error).toBe(FIRST_PAGES_CHANGED);
    expect(runAi.requests).toEqual([]);
    expect((await s.first.store.get(set.id))?.keptBy).toBeNull();

    // "Make it without the first pages": the set is hidden, and the next run makes the book from its own plan.
    expect(s.first.decide(set.id, "drop")).toBe(true);
    const next = await s.startRun();
    // (The legacy item policy: this plan's own random id is not what this case is about.)
    expect(await runWorkbookJob(next, s.runDeps({ itemPolicy: "legacy" }))).toBe("done");
    const run = (await s.runs.run(next))!;
    expect(run.draftKey).not.toBe(set.workbookId);
    expect((await s.runs.frame(next))?.firstPages).toBeUndefined();
    expect((await s.first.store.get(set.id))?.status).toBe("hidden");
  }, 240_000);

  it("is unavailable for a child who already has a workbook, and for a family whose child is not theirs", async () => {
    const s = setup({ inputs: child({ workbooks: [{ number: 1, levels: [12] }] }), itemPolicy: "legacy" });
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("unavailable");
    expect((await s.first.store.get(set.id))?.error).toMatch(/Workbook 1 only/);
    expect(s.ai.requests).toEqual([]);

    const t = setup({ itemPolicy: "legacy" });
    const other = t.first.queue({ assessmentId: TEST, parentId: PARENT, childId: OTHER_CHILD });
    expect(await runFirstPagesJob(other.id, t.deps)).toBe("unavailable");
    expect((await t.first.store.get(other.id))?.error).toMatch(/another family/);
    expect(t.files.files.size).toBe(0);
  });

  it("is unavailable without a curriculum or a profile, and the report is not touched", async () => {
    const s = setup({ inputs: child({ province: "ON" }), itemPolicy: "legacy" });
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("unavailable");
    expect((await s.first.store.get(set.id))?.error).toMatch(/no workbook curriculum for ON/);

    const t = setup({ itemPolicy: "legacy" });
    t.deps.source = { ...t.deps.source, prepareProfile: async () => ({ ok: false }) };
    const set2 = t.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set2.id, t.deps)).toBe("unavailable");
    expect((await t.first.store.get(set2.id))?.result).toBeNull();
    expect(t.ai.requests).toEqual([]);
  });

  it("plans a child with no clear gap, and a child placed below the school grade, from the real planner", async () => {
    // No profile: the planner starts from the school grade. A grade 6 child whose profile shows gaps starts lower.
    for (const inputs of [child({ profile: null, grade: 2 }), child({ grade: 6 })]) {
      const s = setup({ inputs });
      const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
      expect(await runFirstPagesJob(set.id, s.deps)).toBe("ready");
      const row = (await s.first.store.get(set.id))!;
      // The cover names the level the plan starts at, never the school grade.
      expect(row.result!.cover.content).toMatchObject({ kind: "cover", level: row.frame!.plan.level });
    }
  }, 240_000);

  it("keeps an error on the set and tries again once; the retry asks the AI for nothing it stored", async () => {
    const s = setup({ itemPolicy: "legacy" });
    let fitCalls = 0;
    // The print engine crashes once, after the first page's AI call was stored.
    s.deps.fit = () => ({ fits: async () => { if (++fitCalls === 1) throw new Error("the print engine crashed"); return { ok: true }; } });
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("retry");
    expect(await s.first.store.get(set.id)).toMatchObject({ status: "queued", attempts: 1, error: "the print engine crashed" });
    const storedCalls = s.first.inside(set.id)!.calls.map((c) => `${c.page}:${c.seq}`);
    expect(storedCalls.length).toBeGreaterThan(0);
    const before = s.ai.requests.length;
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("ready");
    const all = s.first.inside(set.id)!.calls.map((c) => `${c.page}:${c.seq}`);
    // Every call of the second attempt is a new one: none it had stored was asked again.
    expect(s.ai.requests.length - before).toBe(all.length - storedCalls.length);
    expect(await s.first.store.get(set.id)).toMatchObject({ status: "ready", attempts: 2 });
  }, 240_000);

  it("takes a new Workbook 1 id once when the plan's capacity check fails for its id, then is unavailable; no AI call", async () => {
    const s = setup();
    // No page ever fits: the capacity check of the whole book fails before anything is stored.
    s.deps.fit = () => ({ fits: async () => ({ ok: false, problems: [{ question: null, slot: null, reason: "the content does not fit its space" }] }) });
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("retry");
    const again = (await s.first.store.get(set.id))!;
    expect(again).toMatchObject({ status: "queued", attempts: 1, frame: null });
    expect(again.workbookId).not.toBe(set.workbookId);
    expect(again.error).toMatch(/could not be planned/);
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("unavailable");
    expect(await s.first.store.get(set.id)).toMatchObject({ status: "unavailable", attempts: 2 });
    expect(s.ai.requests).toEqual([]);
    expect(s.files.files.size).toBe(0);
  }, 240_000);

  it("fails after its last attempt, and a second claim while one holds it takes nothing", async () => {
    const s = setup({ fail: () => true, itemPolicy: "legacy" });
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(await s.first.store.claim(set.id, "lease-a", "mac", STALE_SECONDS)).not.toBeNull();
    // Another worker finds it held.
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("not-claimed");
    // The holder stops; past the stale time the set is taken up again (attempt 2) and fails for good.
    s.tick(STALE_SECONDS + 1);
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("failed");
    expect(await s.first.store.get(set.id)).toMatchObject({ status: "failed", attempts: 2 });
    expect(await runFirstPagesJob(set.id, s.deps)).toBe("not-claimed");
    // The late holder writes nothing more.
    expect(await s.first.store.savePage(set.id, "lease-a", { number: 4 } as GeneratedPage)).toBe(false);
  });

  it("queues one set per test however often it is asked", () => {
    const s = setup();
    const a = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    const b = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    expect(b.id).toBe(a.id);
    expect(b.workbookId).toBe(a.workbookId);
  });
});
